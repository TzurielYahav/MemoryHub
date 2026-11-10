/**
 * Firebase Firestore Database Integration Service for Memory Hub
 *
 * Implements PRD Section 6.1, 6.2, 6.4 (Spark Free-Tier Discipline), and 6.5 (Conflict Resolution).
 * - Stores structured workspace data (projects, tasks, pages, subfolders, files metadata, canvases, meetings, routines, settings) in Firebase Firestore.
 * - Enforces offline-first local cache with debounced batched writes to protect the free tier (50K reads / 20K writes / day).
 * - Offloads heavy media/files to Google Drive (stripping binary dataUrls from Firestore documents).
 * - Supports real-time snapshot listeners for multi-device sync between Windows and Android.
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
  writeBatch,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import {
  CanvasBoard,
  MeetingNote,
  PageDocument,
  Project,
  Routine,
  Subfolder,
  Task,
  WorkspaceFile,
  WorkspaceState,
} from '../types/domain';
import { SyncMutation } from './syncEngine';

export interface FirebaseConfigInput {
  projectId: string;
  apiKey: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

let activeFirebaseApp: FirebaseApp | null = null;
let activeFirestore: Firestore | null = null;
let lastConfigHash: string = '';

/**
 * Initializes or reconfigures the Firebase app instance
 */
export function getOrInitFirestore(config: FirebaseConfigInput): Firestore | null {
  if (!config.projectId || !config.apiKey) {
    return null;
  }

  const configHash = `${config.projectId}:${config.apiKey}:${config.appId || ''}`;
  if (activeFirestore && lastConfigHash === configHash) {
    return activeFirestore;
  }

  try {
    const existingApps = getApps();
    const app =
      existingApps.length > 0
        ? getApp()
        : initializeApp({
            projectId: config.projectId.trim(),
            apiKey: config.apiKey.trim(),
            authDomain: config.authDomain?.trim() || `${config.projectId.trim()}.firebaseapp.com`,
            storageBucket: config.storageBucket?.trim() || `${config.projectId.trim()}.appspot.com`,
            messagingSenderId: config.messagingSenderId?.trim(),
            appId: config.appId?.trim() || `1:${config.projectId.trim()}:web:personal`,
          });

    activeFirebaseApp = app;
    activeFirestore = getFirestore(app);
    lastConfigHash = configHash;
    return activeFirestore;
  } catch (err) {
    console.error('Failed to initialize Firebase Firestore:', err);
    return null;
  }
}

/**
 * Strips heavy binary fields (dataUrl, audioDataUrl) before saving to Firestore,
 * ensuring documents stay tiny (< 10 KB) and well within Spark 1 GiB storage & 1 MB doc limit.
 */
export function sanitizePayloadForFirestore(collectionName: string, payload: any): any {
  if (!payload || typeof payload !== 'object') return payload;

  const sanitized = { ...payload };

  if (collectionName === 'files') {
    delete sanitized.dataUrl; // Files are stored in Google Drive
  }

  if (collectionName === 'meetings') {
    delete sanitized.audioDataUrl; // Audio is stored in Google Drive
  }

  return sanitized;
}

/**
 * Pushes batched mutations using Firestore writeBatch, obeying free-tier limits
 */
export async function pushBatchMutationsToFirestore(
  config: FirebaseConfigInput,
  mutations: SyncMutation[]
): Promise<{ success: boolean; writesCount: number; error?: string }> {
  const db = getOrInitFirestore(config);
  if (!db) {
    return { success: false, writesCount: 0, error: 'Firebase Firestore is not configured.' };
  }

  if (mutations.length === 0) {
    return { success: true, writesCount: 0 };
  }

  // Deduplicate mutations by collection + docId
  const deduped = new Map<string, SyncMutation>();
  for (const m of mutations) {
    deduped.set(`${m.collection}:${m.docId}`, m);
  }
  const uniqueMutations = Array.from(deduped.values());

  try {
    const batch = writeBatch(db);

    for (const m of uniqueMutations) {
      const docRef = doc(db, m.collection, m.docId);
      if (m.operation === 'delete') {
        batch.delete(docRef);
      } else {
        const cleanPayload = sanitizePayloadForFirestore(m.collection, m.payload);
        batch.set(
          docRef,
          {
            ...cleanPayload,
            _syncedAt: new Date().toISOString(),
          },
          { merge: true }
        );
      }
    }

    await batch.commit();
    return { success: true, writesCount: uniqueMutations.length };
  } catch (err: any) {
    console.error('Firestore batch commit error:', err);
    return {
      success: false,
      writesCount: 0,
      error: err?.message || 'Failed to commit batched mutations to Firestore.',
    };
  }
}

/**
 * Tests connection to Firebase Firestore by reading and writing a ping document
 */
export async function testFirestoreConnection(
  config: FirebaseConfigInput
): Promise<{ success: boolean; latencyMs?: number; error?: string }> {
  const startTime = Date.now();
  const db = getOrInitFirestore(config);

  if (!db) {
    return {
      success: false,
      error: 'Please enter a valid Firebase Project ID and API Key.',
    };
  }

  try {
    const testDocRef = doc(db, '_memory_hub_meta', 'connectivity_check');
    await setDoc(
      testDocRef,
      {
        lastPing: new Date().toISOString(),
        client: 'Memory Hub Multi-Device Sync',
      },
      { merge: true }
    );

    const snapshot = await getDoc(testDocRef);
    if (!snapshot.exists()) {
      return { success: false, error: 'Ping document was not found after write.' };
    }

    const latencyMs = Date.now() - startTime;
    return { success: true, latencyMs };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message ||
        'Could not connect to Firestore. Please check your Project ID, API Key, and Firestore Security Rules.',
    };
  }
}

/**
 * Pulls all workspace collections from Firestore for cloud restore or initial multi-device sync
 */
export async function pullAllWorkspaceFromFirestore(
  config: FirebaseConfigInput
): Promise<{
  success: boolean;
  data?: Partial<WorkspaceState>;
  readsCount: number;
  error?: string;
}> {
  const db = getOrInitFirestore(config);
  if (!db) {
    return { success: false, readsCount: 0, error: 'Firebase Firestore not configured.' };
  }

  let totalReads = 0;
  const result: Partial<WorkspaceState> = {};

  try {
    const collectionsToFetch = [
      'projects',
      'subfolders',
      'tasks',
      'pages',
      'files',
      'canvases',
      'meetings',
      'routines',
    ] as const;

    for (const colName of collectionsToFetch) {
      const snap = await getDocs(collection(db, colName));
      totalReads += snap.size;
      const docs = snap.docs.map((d) => d.data());

      switch (colName) {
        case 'projects':
          result.projects = docs as Project[];
          break;
        case 'subfolders':
          result.subfolders = docs as Subfolder[];
          break;
        case 'tasks':
          result.tasks = docs as Task[];
          break;
        case 'pages':
          result.pages = docs as PageDocument[];
          break;
        case 'files':
          result.files = docs as WorkspaceFile[];
          break;
        case 'canvases':
          result.canvases = docs as CanvasBoard[];
          break;
        case 'meetings':
          result.meetings = docs as MeetingNote[];
          break;
        case 'routines':
          result.routines = docs as Routine[];
          break;
      }
    }

    return {
      success: true,
      data: result,
      readsCount: totalReads,
    };
  } catch (err: any) {
    return {
      success: false,
      readsCount: totalReads,
      error: err?.message || 'Failed to pull workspace data from Firestore.',
    };
  }
}

/**
 * Pushes the full current workspace state into Firestore (e.g. for initial cloud backup)
 */
export async function pushFullWorkspaceToFirestore(
  config: FirebaseConfigInput,
  state: WorkspaceState
): Promise<{ success: boolean; writesCount: number; error?: string }> {
  const db = getOrInitFirestore(config);
  if (!db) {
    return { success: false, writesCount: 0, error: 'Firebase Firestore not configured.' };
  }

  const collections = [
    { name: 'projects', items: state.projects },
    { name: 'subfolders', items: state.subfolders },
    { name: 'tasks', items: state.tasks },
    { name: 'pages', items: state.pages },
    { name: 'files', items: state.files },
    { name: 'canvases', items: state.canvases },
    { name: 'meetings', items: state.meetings },
    { name: 'routines', items: state.routines },
  ];

  let totalWrites = 0;

  try {
    for (const col of collections) {
      if (col.items.length === 0) continue;

      // Firestore batches have max 500 operations
      const chunkSize = 400;
      for (let i = 0; i < col.items.length; i += chunkSize) {
        const chunk = col.items.slice(i, i + chunkSize);
        const batch = writeBatch(db);

        for (const item of chunk) {
          const docRef = doc(db, col.name, (item as any).id);
          const sanitized = sanitizePayloadForFirestore(col.name, item);
          batch.set(docRef, { ...sanitized, _syncedAt: new Date().toISOString() }, { merge: true });
          totalWrites++;
        }

        await batch.commit();
      }
    }

    return { success: true, writesCount: totalWrites };
  } catch (err: any) {
    return {
      success: false,
      writesCount: totalWrites,
      error: err?.message || 'Failed to push workspace state to Firestore.',
    };
  }
}

/**
 * Sets up real-time listener for remote updates across devices
 */
export function subscribeToFirestoreSync(
  config: FirebaseConfigInput,
  collectionName: string,
  onRemoteDocChange: (docId: string, data: any, changeType: 'added' | 'modified' | 'removed') => void,
  onError?: (err: Error) => void
): Unsubscribe | null {
  const db = getOrInitFirestore(config);
  if (!db) return null;

  try {
    const colRef = collection(db, collectionName);
    return onSnapshot(
      colRef,
      (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          onRemoteDocChange(change.doc.id, change.doc.data(), change.type);
        });
      },
      (err) => {
        if (onError) onError(err);
      }
    );
  } catch (err: any) {
    if (onError) onError(err);
    return null;
  }
}
