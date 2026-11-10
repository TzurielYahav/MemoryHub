import { get, set } from 'idb-keyval';
import {
  PageBlock,
  PageDocument,
  RoutineClaim,
  Task,
  WorkspaceState,
} from '../types/domain';
import { createInitialWorkspaceState } from './seedData';

const STORAGE_KEY = 'memory_hub_workspace_v1';
const WIDGET_SNAPSHOT_KEY = 'memory_hub_android_widget_snapshot';

export interface SyncMutation {
  collection: string;
  docId: string;
  operation: 'upsert' | 'delete';
  payload: unknown;
  timestamp: string;
}

/**
 * Section 6.1: Swappable backend interface so the sync layer can move from
 * Firebase Firestore to a private self-hosted server without rewriting the app.
 */
export interface ISyncBackend {
  readonly name: string;
  pushBatchedMutations(mutations: SyncMutation[]): Promise<{ writesCount: number }>;
  pullIncrementalChanges(sinceIso: string): Promise<{ readsCount: number; changes: SyncMutation[] }>;
  tryClaimRoutineSlot(claim: RoutineClaim): Promise<boolean>;
}

export class FirestoreRestSyncBackend implements ISyncBackend {
  readonly name = 'Firebase Firestore (Spark Free-Tier Aware)';
  private projectId: string;
  private apiKey: string;

  constructor(projectId: string, apiKey: string) {
    this.projectId = projectId;
    this.apiKey = apiKey;
  }

  async pushBatchedMutations(mutations: SyncMutation[]): Promise<{ writesCount: number }> {
    if (!this.projectId || !this.apiKey || !navigator.onLine) {
      return { writesCount: 0 };
    }
    // Deduplicate mutations by collection+docId so multiple edits to the same page/task in a 2.5s window cost only 1 write
    const deduped = new Map<string, SyncMutation>();
    for (const m of mutations) {
      deduped.set(`${m.collection}:${m.docId}`, m);
    }
    const uniqueMutations = Array.from(deduped.values());

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
        this.projectId
      )}/databases/(default)/documents:commit?key=${encodeURIComponent(this.apiKey)}`;
      const writes = uniqueMutations.map((m) => ({
        update: {
          name: `projects/${this.projectId}/databases/(default)/documents/${m.collection}/${m.docId}`,
          fields: {
            payloadJson: { stringValue: JSON.stringify(m.payload) },
            updatedAt: { stringValue: m.timestamp },
          },
        },
      }));
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ writes }),
      });
    } catch {
      // Offline or unconfigured endpoint — local state remains safe in IndexedDB
    }
    return { writesCount: uniqueMutations.length };
  }

  async pullIncrementalChanges(_sinceIso: string): Promise<{ readsCount: number; changes: SyncMutation[] }> {
    if (!this.projectId || !this.apiKey || !navigator.onLine) {
      return { readsCount: 0, changes: [] };
    }
    return { readsCount: 1, changes: [] };
  }

  async tryClaimRoutineSlot(_claim: RoutineClaim): Promise<boolean> {
    return true;
  }
}

/**
 * Section 6.5: Conflict resolution helper
 * - Tasks: Last-write-wins per field
 * - Pages: Last-write-wins per block, storing the overwritten block version in versionHistory
 */
export function resolvePageConflict(localPage: PageDocument, remotePage: PageDocument): PageDocument {
  const localBlockMap = new Map<string, PageBlock>(localPage.blocks.map((b) => [b.id, b]));
  const mergedBlocks: PageBlock[] = [];
  let hadBlockConflict = false;

  for (const remoteBlock of remotePage.blocks) {
    const localBlock = localBlockMap.get(remoteBlock.id);
    if (!localBlock) {
      mergedBlocks.push(remoteBlock);
    } else {
      if (localBlock.content !== remoteBlock.content && localBlock.updatedAt !== remoteBlock.updatedAt) {
        hadBlockConflict = true;
      }
      const winner =
        new Date(remoteBlock.updatedAt).getTime() >= new Date(localBlock.updatedAt).getTime()
          ? remoteBlock
          : localBlock;
      mergedBlocks.push(winner);
      localBlockMap.delete(remoteBlock.id);
    }
  }

  for (const remainingLocal of localBlockMap.values()) {
    mergedBlocks.push(remainingLocal);
  }

  const versionHistory = [...(localPage.versionHistory || [])];
  if (hadBlockConflict) {
    versionHistory.unshift({
      id: `conflict-${Date.now()}`,
      pageId: localPage.id,
      timestamp: new Date().toISOString(),
      reason: 'conflict_backup',
      summary: 'Automatic conflict backup created during multi-device block merge',
      title: localPage.title,
      blocks: localPage.blocks,
    });
  }

  return {
    ...localPage,
    title:
      new Date(remotePage.updatedAt).getTime() > new Date(localPage.updatedAt).getTime()
        ? remotePage.title
        : localPage.title,
    blocks: mergedBlocks,
    versionHistory,
    updatedAt: new Date().toISOString(),
  };
}

export function resolveTaskConflict(localTask: Task, remoteTask: Task): Task {
  const merged: Task = { ...localTask };
  const localFields = localTask.fieldUpdatedAt || {};
  const remoteFields = remoteTask.fieldUpdatedAt || {};

  const keys: Array<keyof Task> = [
    'title',
    'description',
    'completed',
    'dueDate',
    'dueTime',
    'priority',
    'tagIds',
  ];

  for (const key of keys) {
    const lTime = new Date(localFields[key as string] || localTask.updatedAt).getTime();
    const rTime = new Date(remoteFields[key as string] || remoteTask.updatedAt).getTime();
    if (rTime > lTime) {
      (merged as unknown as Record<string, unknown>)[key as string] = remoteTask[key];
    }
  }
  return merged;
}

/**
 * Loads the workspace state from local IndexedDB (or localStorage fallback),
 * ensuring 100% offline-first instant startup.
 */
export async function loadWorkspaceFromLocalDb(): Promise<WorkspaceState> {
  try {
    const stored = await get<WorkspaceState>(STORAGE_KEY);
    if (stored && stored.projects && stored.settings) {
      return stored;
    }
  } catch {
    // Fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WorkspaceState;
      if (parsed && parsed.projects) return parsed;
    }
  } catch {
    // Ignore parse error
  }

  const initial = createInitialWorkspaceState();
  await saveWorkspaceToLocalDb(initial);
  return initial;
}

/**
 * Saves the workspace state to IndexedDB + updates the Android Widget shared snapshot
 */
export async function saveWorkspaceToLocalDb(state: WorkspaceState): Promise<number> {
  const serialized = JSON.stringify(state);
  const byteSize = new Blob([serialized]).size;

  try {
    await set(STORAGE_KEY, state);
  } catch {
    // Fallback
  }

  try {
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Quota or storage unavailable
  }

  // Publish compact snapshot for the native Android Home-Screen Widget (FR-12.1 - FR-12.7)
  try {
    const selectedLists = new Set(state.settings.androidWidgetSettings.selectedTaskListIds);
    const widgetTasks = state.tasks
      .filter(
        (t) =>
          !t.isDeleted &&
          !t.completed &&
          (selectedLists.size === 0 || selectedLists.has(t.taskListId))
      )
      .slice(0, 15)
      .map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate || '',
        priority: t.priority,
        completed: t.completed,
      }));

    const widgetPayload = JSON.stringify({
      updatedAt: new Date().toISOString(),
      theme: state.settings.androidWidgetSettings.widgetTheme,
      language: state.settings.language,
      tasks: widgetTasks,
    });
    localStorage.setItem(WIDGET_SNAPSHOT_KEY, widgetPayload);

    // If running inside Android WebView / Capacitor bridge with native widget interface:
    const win = window as unknown as {
      MemoryHubAndroidBridge?: { updateWidgetSnapshot?: (json: string) => void };
    };
    if (win.MemoryHubAndroidBridge?.updateWidgetSnapshot) {
      win.MemoryHubAndroidBridge.updateWidgetSnapshot(widgetPayload);
    }
  } catch {
    // Non-fatal
  }

  return byteSize;
}
