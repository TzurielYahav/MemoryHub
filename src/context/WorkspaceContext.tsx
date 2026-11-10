import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AgentConversation,
  AgentEditProposal,
  AppSettings,
  CanvasBoard,
  CalendarEvent,
  MeetingNote,
  PageBlock,
  PageDocument,
  PriorityLevel,
  Project,
  RecurrenceRule,
  Routine,
  RoutineClaim,
  RoutineRunLog,
  Subfolder,
  Task,
  TaskList,
  TaskSourceType,
  TaskTag,
  WorkspaceFile,
  WorkspaceState,
} from '../types/domain';
import {
  FirestoreRestSyncBackend,
  loadWorkspaceFromLocalDb,
  saveWorkspaceToLocalDb,
  SyncMutation,
  resolvePageConflict,
  resolveTaskConflict,
} from '../services/syncEngine';
import { createInitialWorkspaceState } from '../services/seedData';
import { runAgentTurn } from '../services/aiAgentService';
import { extractTextAndOcrFromFile, transcribeAndSummarizeMeetingAudio } from '../services/mediaAiService';
import { isEmailAllowedByPolicy } from '../services/searchEngine';
import {
  signInWithGoogleOAuth,
  validateGoogleAccessToken,
  revokeGoogleAccessToken,
} from '../services/googleAuthService';
import {
  getOrCreateDriveFolder,
  uploadFileToDrive,
  downloadFileFromDrive,
  listDriveFolderFiles,
  testGoogleDriveConnection,
} from '../services/googleDriveService';
import {
  pushBatchMutationsToFirestore,
  testFirestoreConnection,
  pushFullWorkspaceToFirestore,
  pullAllWorkspaceFromFirestore,
  subscribeToFirestoreSync,
} from '../services/firestoreSyncService';

export type ActiveNavSection =
  | 'home'
  | 'project'
  | 'all-tasks'
  | 'calendar'
  | 'search'
  | 'agent'
  | 'review-inbox'
  | 'routines'
  | 'gmail'
  | 'android-widget'
  | 'trash'
  | 'settings';

export type ProjectSubTab = 'overview' | 'tasks' | 'pages' | 'files' | 'canvases' | 'meetings';

export interface ActiveProjectFile {
  type: 'page' | 'canvas' | 'meeting' | 'file' | 'new-meeting';
  id: string;
  folderId?: string | null;
}

interface WorkspaceContextValue {
  state: WorkspaceState;
  isLoaded: boolean;
  activeNav: ActiveNavSection;
  setActiveNav: (nav: ActiveNavSection) => void;
  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;
  selectedFolderId: string | null;
  setSelectedFolderId: (id: string | null) => void;
  projectSubTab: ProjectSubTab;
  setProjectSubTab: (tab: ProjectSubTab) => void;
  selectedPageId: string | null;
  setSelectedPageId: (id: string | null) => void;
  selectedCanvasId: string | null;
  setSelectedCanvasId: (id: string | null) => void;
  selectedMeetingId: string | null;
  setSelectedMeetingId: (id: string | null) => void;
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  activeProjectFile: ActiveProjectFile | null;
  setActiveProjectFile: (file: ActiveProjectFile | null) => void;
  quickCaptureMode: 'none' | 'task' | 'voice-agent' | 'text-agent';
  setQuickCaptureMode: (mode: 'none' | 'task' | 'voice-agent' | 'text-agent') => void;

  // Project & Subfolder actions
  createProject: (name: string, description: string, icon: string, color: string) => Project;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProjectToTrash: (id: string) => void;
  createSubfolder: (projectId: string, parentId: string | null, name: string, icon?: string) => Subfolder;
  deleteSubfolderToTrash: (id: string) => void;
  moveItemToLocation: (
    itemType: 'task' | 'page' | 'file' | 'canvas' | 'meeting' | 'subfolder',
    itemId: string,
    targetProjectId: string,
    targetFolderId: string | null
  ) => void;
  reorderProjectItems: (
    orderedItems: Array<{
      itemType: 'page' | 'file' | 'canvas' | 'meeting' | 'subfolder';
      itemId: string;
      folderId: string | null;
      order: number;
    }>
  ) => void;

  // Task & Tag actions
  createTask: (input: {
    projectId: string;
    folderId?: string | null;
    taskListId?: string;
    title: string;
    description?: string;
    dueDate?: string;
    dueTime?: string;
    priority?: PriorityLevel;
    reminderMinutesBefore?: number | null;
    recurrence?: RecurrenceRule;
    tagIds?: string[];
    attachmentFileIds?: string[];
    syncToGoogleCalendar?: boolean;
    sourceType?: TaskSourceType;
    sourceId?: string;
    sourceTitle?: string;
    sourceUrl?: string;
  }) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  toggleTaskCompletion: (id: string) => void;
  deleteTaskToTrash: (id: string) => void;
  createTaskList: (projectId: string, name: string, showInAndroidWidget?: boolean) => TaskList;
  toggleTaskListWidgetVisibility: (taskListId: string) => void;
  createTag: (name: string, color: string) => TaskTag;

  // Page & Block actions
  createPage: (projectId: string, folderId: string | null, title: string, icon?: string, initialBlocks?: PageBlock[], createdByAgent?: boolean) => PageDocument;
  updatePage: (id: string, patch: Partial<PageDocument>, snapshotReason?: { reason: 'manual_snapshot' | 'agent_edit'; summary: string }) => void;
  restorePageVersion: (pageId: string, versionId: string) => void;
  deletePageToTrash: (id: string) => void;

  // File & OCR actions
  uploadWorkspaceFile: (file: File, projectId: string, folderId: string | null, taskId?: string | null) => Promise<WorkspaceFile>;
  deleteFileToTrash: (id: string) => void;

  // Canvas actions
  createCanvas: (projectId: string, folderId: string | null, title: string) => CanvasBoard;
  updateCanvas: (id: string, patch: Partial<CanvasBoard>) => void;
  deleteCanvasToTrash: (id: string) => void;

  // Meeting actions
  createMeetingNote: (input: {
    projectId: string;
    folderId: string | null;
    title: string;
    captureMode: 'mic_only' | 'mic_and_system_audio';
    durationSec: number;
    userLiveNotes: string;
    audioDataUrl?: string;
    audioMimeType?: string;
    liveSegments?: MeetingNote['segments'];
  }) => Promise<MeetingNote>;
  updateMeetingNote: (id: string, patch: Partial<MeetingNote>) => void;
  renameMeetingSpeaker: (meetingId: string, speakerId: string, newLabel: string) => void;
  deleteMeetingOriginalAudio: (meetingId: string) => void;
  handleMeetingTaskSuggestion: (
    meetingId: string,
    suggestionId: string,
    decision: 'accept' | 'reject',
    editedTitle?: string
  ) => void;
  deleteMeetingToTrash: (id: string) => void;

  // AI Agent & Diff Review actions
  sendAgentPrompt: (prompt: string, conversationId: string, scopeProjectId: string | null) => Promise<void>;
  createNewConversation: (scopeProjectId: string | null) => AgentConversation;
  clearConversationMessages: (conversationId: string) => void;
  applyEditProposalDecision: (
    proposalId: string,
    decision: 'accept_all' | 'accept_selected' | 'reject',
    selectedBlockIds?: string[]
  ) => void;
  createAgentProposalForPage: (pageId: string, instruction: string) => void;

  // Routines & Google Integrations
  createRoutine: (routine: Omit<Routine, 'id' | 'createdAt' | 'updatedAt'>) => Routine;
  updateRoutine: (id: string, patch: Partial<Routine>) => void;
  deleteRoutine: (id: string) => void;
  executeRoutineNow: (routineId: string, simulateLateMinutes?: number, simulateDeviceName?: string) => Promise<void>;
  extractTaskFromGmailMessage: (emailId: string, targetProjectId: string) => Task | null;

  // Google & Cloud Sync Actions (Google Sign-In, Google Drive, Firestore)
  signInWithGoogle: (clientId?: string) => Promise<{ success: boolean; error?: string }>;
  signOutGoogle: () => Promise<void>;
  testGoogleDrive: () => Promise<{ success: boolean; folderId?: string; fileCount?: number; error?: string }>;
  syncDriveFiles: () => Promise<{ uploaded: number; downloaded: number; errors: string[] }>;
  testFirestore: () => Promise<{ success: boolean; latencyMs?: number; error?: string }>;
  pushWorkspaceToFirestore: () => Promise<{ success: boolean; writesCount: number; error?: string }>;
  pullWorkspaceFromFirestore: () => Promise<{ success: boolean; readsCount: number; error?: string }>;

  // Trash & Settings
  restoreTrashItem: (itemType: 'project' | 'subfolder' | 'task' | 'page' | 'file' | 'canvas' | 'meeting', id: string) => void;
  permanentlyPurgeTrashItem: (itemType: 'project' | 'subfolder' | 'task' | 'page' | 'file' | 'canvas' | 'meeting', id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  navigateToItem: (itemType: string, itemId: string, projectId?: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function computeNextRecurrenceDate(currentDateStr: string | undefined, rule: RecurrenceRule): string {
  const base = currentDateStr ? new Date(`${currentDateStr}T12:00:00`) : new Date();
  const next = new Date(base.getTime());
  if (rule.frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (rule.frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (rule.frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (rule.frequency === 'custom') {
    next.setDate(next.getDate() + Math.max(1, rule.intervalDays || 3));
  }
  return next.toISOString().slice(0, 10);
}

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<WorkspaceState>(() => createInitialWorkspaceState());
  const [isLoaded, setIsLoaded] = useState(false);

  const [activeNav, setActiveNav] = useState<ActiveNavSection>('home');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>('proj-product-2026');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [projectSubTab, setProjectSubTab] = useState<ProjectSubTab>('overview');
  const [selectedPageId, setSelectedPageId] = useState<string | null>('page-arch-overview');
  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>('canvas-system-flow');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>('meeting-bilingual-sync');
  const [selectedFileId, setSelectedFileId] = useState<string | null>('file-prd-architecture');
  const [activeProjectFile, setActiveProjectFile] = useState<ActiveProjectFile | null>({
    type: 'page',
    id: 'page-arch-overview',
  });
  const [quickCaptureMode, setQuickCaptureMode] = useState<'none' | 'task' | 'voice-agent' | 'text-agent'>('none');

  const pendingMutationsRef = useRef<SyncMutation[]>([]);
  const debounceTimerRef = useRef<number | null>(null);

  // Load initial state from IndexedDB & handle URL query params for Android Widget quick-entry overlays (FR-12.3 - FR-12.6)
  useEffect(() => {
    let mounted = true;
    loadWorkspaceFromLocalDb().then((loaded) => {
      if (!mounted) return;
      setState(loaded);
      setIsLoaded(true);

      const params = new URLSearchParams(window.location.search);
      const mode = params.get('mode');
      if (mode === 'quick-task') setQuickCaptureMode('task');
      if (mode === 'quick-voice') setQuickCaptureMode('voice-agent');
      if (mode === 'quick-agent') setQuickCaptureMode('text-agent');
    });

    // Listen for Electron global shortcut IPC events (FR-13.2)
    const win = window as unknown as {
      electronAPI?: {
        onGlobalShortcut?: (cb: (action: string) => void) => void;
      };
    };
    if (win.electronAPI?.onGlobalShortcut) {
      win.electronAPI.onGlobalShortcut((action: string) => {
        if (action === 'quick-add-task') setQuickCaptureMode('task');
        if (action === 'open-agent') setActiveNav('agent');
        if (action === 'quick-voice-agent') setQuickCaptureMode('voice-agent');
      });
    }

    return () => {
      mounted = false;
    };
  }, []);

  // Apply RTL/LTR direction and Light/Dark theme to document root (FR-14.1, FR-14.3)
  useEffect(() => {
    const dir = state.settings.language === 'he' ? 'rtl' : 'ltr';
    document.documentElement.dir = dir;
    document.documentElement.lang = state.settings.language;

    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const isDark =
      state.settings.theme === 'dark' || (state.settings.theme === 'system' && prefersDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [state.settings.language, state.settings.theme]);

  // Debounced Local Persistence + Firestore Spark Free-Tier Batch Sync (Section 6.4)
  const queueSyncMutation = useCallback(
    (collection: string, docId: string, operation: 'upsert' | 'delete', payload: unknown) => {
      pendingMutationsRef.current.push({
        collection,
        docId,
        operation,
        payload,
        timestamp: new Date().toISOString(),
      });
    },
    []
  );

  useEffect(() => {
    if (!isLoaded) return;

    // Immediately save to local IndexedDB for zero data loss (Section 9 Reliability)
    saveWorkspaceToLocalDb(state).then((byteSize) => {
      setState((prev) => {
        if (Math.abs(prev.usageStats.estimatedBytesUsed - byteSize) < 512) return prev;
        return {
          ...prev,
          usageStats: {
            ...prev.usageStats,
            estimatedBytesUsed: byteSize,
          },
        };
      });
    });

    // Debounce cloud sync writes by 2.5 seconds (Section 6.4: no write per keystroke)
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    if (pendingMutationsRef.current.length > 0) {
      debounceTimerRef.current = window.setTimeout(async () => {
        const batch = [...pendingMutationsRef.current];
        pendingMutationsRef.current = [];

        const dedupedCount = new Set(batch.map((b) => `${b.collection}:${b.docId}`)).size;
        if (state.settings.firebaseConfig.enabled && state.settings.firebaseConfig.projectId) {
          const res = await pushBatchMutationsToFirestore(state.settings.firebaseConfig, batch);
          if (!res.success) {
            // Fallback to REST backend
            const backend = new FirestoreRestSyncBackend(
              state.settings.firebaseConfig.projectId,
              state.settings.firebaseConfig.apiKey
            );
            await backend.pushBatchedMutations(batch);
          }
        }

        setState((prev) => ({
          ...prev,
          usageStats: {
            ...prev.usageStats,
            writesToday: prev.usageStats.writesToday + Math.max(1, dedupedCount),
            pendingBatchWrites: 0,
            lastSyncedAt: new Date().toISOString(),
            syncState: navigator.onLine ? 'synced' : 'offline',
          },
        }));
      }, 2500);
    }
  }, [state, isLoaded]);

  // Global keyboard shortcuts inside the window as well (`Ctrl+Shift+Space` -> Quick Task, `Ctrl+Shift+A` -> AI Agent, `Ctrl+K` -> Search)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setActiveNav('search');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'Space') {
        e.preventDefault();
        setQuickCaptureMode('task');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        setActiveNav('agent');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // FR-6.5: Automatically transcribe offline-queued meetings when internet connection returns
  useEffect(() => {
    const processOfflineMeetings = async () => {
      if (!navigator.onLine) return;
      const queued = state.meetings.filter(
        (m) => !m.isDeleted && m.transcriptionStatus === 'queued_offline'
      );
      for (const m of queued) {
        const result = await transcribeAndSummarizeMeetingAudio(
          m.audioDataUrl,
          m.audioMimeType || 'audio/webm',
          m.userLiveNotes,
          m.title,
          state.settings
        );
        setState((prev) => ({
          ...prev,
          meetings: prev.meetings.map((item) =>
            item.id === m.id
              ? {
                  ...item,
                  transcriptionStatus: 'completed',
                  speakerLabels: result.speakerLabels,
                  segments: result.segments,
                  summary: result.summary,
                  keyPoints: result.keyPoints,
                  decisions: result.decisions,
                  taskSuggestions: result.taskSuggestions,
                  updatedAt: new Date().toISOString(),
                }
              : item
          ),
        }));
      }
    };
    window.addEventListener('online', processOfflineMeetings);
    return () => window.removeEventListener('online', processOfflineMeetings);
  }, [state.meetings, state.settings]);

  // FR-2.4: Task Reminder Local Notification Checker (Windows & Android)
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = new Date();
      state.tasks.forEach((task) => {
        if (
          task.isDeleted ||
          task.completed ||
          task.reminderNotified ||
          task.reminderMinutesBefore == null ||
          !task.dueDate
        ) {
          return;
        }
        const dueDateTime = new Date(`${task.dueDate}T${task.dueTime || '09:00'}:00`);
        const triggerTime = new Date(
          dueDateTime.getTime() - task.reminderMinutesBefore * 60 * 1000
        );
        if (now >= triggerTime && now.getTime() - triggerTime.getTime() < 3600 * 1000) {
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(`Memory Hub Reminder: ${task.title}`, {
              body: task.description || `Due ${task.dueDate} ${task.dueTime || ''}`,
            });
          }
          setState((prev) => ({
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === task.id ? { ...t, reminderNotified: true } : t
            ),
          }));
        }
      });
    }, 30000);
    return () => window.clearInterval(interval);
  }, [state.tasks]);

  // --- Actions ---

  const createProject = useCallback(
    (name: string, description: string, icon: string, color: string): Project => {
      const now = new Date().toISOString();
      const proj: Project = {
        id: `proj-${Date.now()}`,
        name: name.trim() || 'Untitled Project',
        description,
        icon: icon || '📁',
        color: color || '#4F46E5',
        order: state.projects.length,
        isArchived: false,
        excludeFromAgent: false,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      const defaultList: TaskList = {
        id: `list-${Date.now()}`,
        projectId: proj.id,
        folderId: null,
        name: 'General Tasks',
        order: 0,
        showInAndroidWidget: true,
        createdAt: now,
        updatedAt: now,
      };
      queueSyncMutation('projects', proj.id, 'upsert', proj);
      setState((prev) => ({
        ...prev,
        projects: [...prev.projects, proj],
        taskLists: [...prev.taskLists, defaultList],
      }));
      setSelectedProjectId(proj.id);
      setSelectedFolderId(null);
      setActiveNav('project');
      return proj;
    },
    [state.projects.length, queueSyncMutation]
  );

  const updateProject = useCallback(
    (id: string, patch: Partial<Project>) => {
      const now = new Date().toISOString();
      queueSyncMutation('projects', id, 'upsert', patch);
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: now } : p
        ),
      }));
    },
    [queueSyncMutation]
  );

  const deleteProjectToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('projects', id, 'delete', { isDeleted: true, deletedAt: now });
      setState((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === id ? { ...p, isDeleted: true, deletedAt: now, updatedAt: now } : p
        ),
      }));
      if (selectedProjectId === id) {
        setActiveNav('home');
      }
    },
    [selectedProjectId, queueSyncMutation]
  );

  const createSubfolder = useCallback(
    (projectId: string, parentId: string | null, name: string, icon = '📂'): Subfolder => {
      const now = new Date().toISOString();
      const folder: Subfolder = {
        id: `folder-${Date.now()}`,
        projectId,
        parentId,
        name: name.trim() || 'New Subfolder',
        icon,
        order: state.subfolders.length,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      queueSyncMutation('subfolders', folder.id, 'upsert', folder);
      setState((prev) => ({
        ...prev,
        subfolders: [...prev.subfolders, folder],
      }));
      return folder;
    },
    [state.subfolders.length, queueSyncMutation]
  );

  const deleteSubfolderToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('subfolders', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        subfolders: prev.subfolders.map((f) =>
          f.id === id ? { ...f, isDeleted: true, deletedAt: now, updatedAt: now } : f
        ),
      }));
      if (selectedFolderId === id) setSelectedFolderId(null);
    },
    [selectedFolderId, queueSyncMutation]
  );

  // FR-1.4: Move any item between projects and folders
  const moveItemToLocation = useCallback(
    (
      itemType: 'task' | 'page' | 'file' | 'canvas' | 'meeting' | 'subfolder',
      itemId: string,
      targetProjectId: string,
      targetFolderId: string | null
    ) => {
      const now = new Date().toISOString();
      queueSyncMutation(itemType, itemId, 'upsert', { targetProjectId, targetFolderId });
      setState((prev) => {
        if (itemType === 'task') {
          return {
            ...prev,
            tasks: prev.tasks.map((t) =>
              t.id === itemId
                ? { ...t, projectId: targetProjectId, folderId: targetFolderId, updatedAt: now }
                : t
            ),
          };
        }
        if (itemType === 'page') {
          return {
            ...prev,
            pages: prev.pages.map((p) =>
              p.id === itemId
                ? { ...p, projectId: targetProjectId, folderId: targetFolderId, updatedAt: now }
                : p
            ),
          };
        }
        if (itemType === 'file') {
          return {
            ...prev,
            files: prev.files.map((f) =>
              f.id === itemId
                ? { ...f, projectId: targetProjectId, folderId: targetFolderId, updatedAt: now }
                : f
            ),
          };
        }
        if (itemType === 'canvas') {
          return {
            ...prev,
            canvases: prev.canvases.map((c) =>
              c.id === itemId
                ? { ...c, projectId: targetProjectId, folderId: targetFolderId, updatedAt: now }
                : c
            ),
          };
        }
        if (itemType === 'meeting') {
          return {
            ...prev,
            meetings: prev.meetings.map((m) =>
              m.id === itemId
                ? { ...m, projectId: targetProjectId, folderId: targetFolderId, updatedAt: now }
                : m
            ),
          };
        }
        if (itemType === 'subfolder') {
          return {
            ...prev,
            subfolders: prev.subfolders.map((sf) =>
              sf.id === itemId && targetFolderId !== itemId
                ? { ...sf, projectId: targetProjectId, parentId: targetFolderId, updatedAt: now }
                : sf
            ),
          };
        }
        return prev;
      });
    },
    [queueSyncMutation]
  );

  const reorderProjectItems = useCallback(
    (
      orderedItems: Array<{
        itemType: 'page' | 'file' | 'canvas' | 'meeting' | 'subfolder';
        itemId: string;
        folderId: string | null;
        order: number;
      }>
    ) => {
      const now = new Date().toISOString();
      const mapByTypeAndId = new Map<
        string,
        { folderId: string | null; order: number }
      >();
      orderedItems.forEach((it) => {
        mapByTypeAndId.set(`${it.itemType}:${it.itemId}`, {
          folderId: it.folderId,
          order: it.order,
        });
        queueSyncMutation(it.itemType, it.itemId, 'upsert', {
          folderId: it.folderId,
          order: it.order,
        });
      });

      setState((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          const hit = mapByTypeAndId.get(`page:${p.id}`);
          return hit
            ? { ...p, folderId: hit.folderId, order: hit.order, updatedAt: now }
            : p;
        }),
        canvases: prev.canvases.map((c) => {
          const hit = mapByTypeAndId.get(`canvas:${c.id}`);
          return hit
            ? { ...c, folderId: hit.folderId, order: hit.order, updatedAt: now }
            : c;
        }),
        meetings: prev.meetings.map((m) => {
          const hit = mapByTypeAndId.get(`meeting:${m.id}`);
          return hit
            ? { ...m, folderId: hit.folderId, order: hit.order, updatedAt: now }
            : m;
        }),
        files: prev.files.map((f) => {
          const hit = mapByTypeAndId.get(`file:${f.id}`);
          return hit
            ? { ...f, folderId: hit.folderId, order: hit.order, updatedAt: now }
            : f;
        }),
        subfolders: prev.subfolders.map((sf) => {
          const hit = mapByTypeAndId.get(`subfolder:${sf.id}`);
          return hit && hit.folderId !== sf.id
            ? { ...sf, parentId: hit.folderId, order: hit.order, updatedAt: now }
            : sf;
        }),
      }));
    },
    [queueSyncMutation]
  );

  const createTask = useCallback(
    (input: {
      projectId: string;
      folderId?: string | null;
      taskListId?: string;
      title: string;
      description?: string;
      dueDate?: string;
      dueTime?: string;
      priority?: PriorityLevel;
      reminderMinutesBefore?: number | null;
      recurrence?: RecurrenceRule;
      tagIds?: string[];
      attachmentFileIds?: string[];
      syncToGoogleCalendar?: boolean;
      sourceType?: TaskSourceType;
      sourceId?: string;
      sourceTitle?: string;
      sourceUrl?: string;
    }): Task => {
      const now = new Date().toISOString();
      const defaultList =
        state.taskLists.find((l) => l.projectId === input.projectId) || state.taskLists[0];
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const gcalEventId = input.syncToGoogleCalendar ? `gcal-${taskId}` : undefined;

      const newTask: Task = {
        id: taskId,
        projectId: input.projectId,
        folderId: input.folderId ?? null,
        taskListId: input.taskListId || defaultList?.id || 'list-main-product',
        title: input.title.trim() || 'Untitled Task',
        description: input.description || '',
        completed: false,
        dueDate: input.dueDate,
        dueTime: input.dueTime,
        priority: input.priority || 'none',
        reminderMinutesBefore: input.reminderMinutesBefore ?? null,
        recurrence: input.recurrence || { frequency: 'none' },
        tagIds: input.tagIds || [],
        attachmentFileIds: input.attachmentFileIds || [],
        syncToGoogleCalendar: input.syncToGoogleCalendar || false,
        googleCalendarEventId: gcalEventId,
        sourceType: input.sourceType || 'user',
        sourceId: input.sourceId,
        sourceTitle: input.sourceTitle,
        sourceUrl: input.sourceUrl,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        fieldUpdatedAt: { title: now, completed: now, priority: now },
      };

      queueSyncMutation('tasks', newTask.id, 'upsert', newTask);

      setState((prev) => {
        const nextCalendarEvents = [...prev.calendarEvents];
        // FR-8.4: Create event in Google Calendar when syncToGoogleCalendar is enabled
        if (newTask.syncToGoogleCalendar && newTask.dueDate) {
          const startTime = newTask.dueTime || '09:00';
          nextCalendarEvents.push({
            id: gcalEventId!,
            googleEventId: gcalEventId,
            title: newTask.title,
            description: newTask.description || 'Synced from Memory Hub Task',
            startIso: `${newTask.dueDate}T${startTime}:00`,
            endIso: `${newTask.dueDate}T${startTime}:00`,
            source: 'memory_hub_task',
            linkedTaskId: newTask.id,
          });
        }
        return {
          ...prev,
          tasks: [newTask, ...prev.tasks],
          calendarEvents: nextCalendarEvents,
        };
      });

      return newTask;
    },
    [state.taskLists, queueSyncMutation]
  );

  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      const now = new Date().toISOString();
      queueSyncMutation('tasks', id, 'upsert', patch);
      setState((prev) => {
        const updatedTasks = prev.tasks.map((t) => {
          if (t.id !== id) return t;
          const fieldTimes = { ...(t.fieldUpdatedAt || {}) };
          Object.keys(patch).forEach((k) => {
            fieldTimes[k] = now;
          });
          return { ...t, ...patch, updatedAt: now, fieldUpdatedAt: fieldTimes };
        });

        // FR-8.4: Keep linked Google Calendar event updated when task changes
        const target = updatedTasks.find((t) => t.id === id);
        let updatedEvents = [...prev.calendarEvents];
        if (target) {
          if (target.syncToGoogleCalendar && target.dueDate) {
            const existingIdx = updatedEvents.findIndex((e) => e.linkedTaskId === target.id);
            const startIso = `${target.dueDate}T${target.dueTime || '09:00'}:00`;
            const evtObj: CalendarEvent = {
              id: target.googleCalendarEventId || `gcal-${target.id}`,
              googleEventId: target.googleCalendarEventId || `gcal-${target.id}`,
              title: target.title,
              description: target.description,
              startIso,
              endIso: startIso,
              source: 'memory_hub_task',
              linkedTaskId: target.id,
            };
            if (existingIdx >= 0) {
              updatedEvents[existingIdx] = evtObj;
            } else {
              updatedEvents.push(evtObj);
            }
          } else if (!target.syncToGoogleCalendar) {
            updatedEvents = updatedEvents.filter((e) => e.linkedTaskId !== target.id);
          }
        }

        return {
          ...prev,
          tasks: updatedTasks,
          calendarEvents: updatedEvents,
        };
      });
    },
    [queueSyncMutation]
  );

  // FR-2.5: Completing a recurring task automatically creates the next occurrence!
  const toggleTaskCompletion = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('tasks', id, 'upsert', { toggleComplete: true, timestamp: now });

      setState((prev) => {
        const target = prev.tasks.find((t) => t.id === id);
        if (!target) return prev;
        const becomingCompleted = !target.completed;
        const nextTasks = prev.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                completed: becomingCompleted,
                completedAt: becomingCompleted ? now : undefined,
                updatedAt: now,
              }
            : t
        );

        if (becomingCompleted && target.recurrence && target.recurrence.frequency !== 'none') {
          const nextDueDate = computeNextRecurrenceDate(target.dueDate, target.recurrence);
          const nextOccurrence: Task = {
            ...target,
            id: `task-${Date.now()}-rec`,
            completed: false,
            completedAt: undefined,
            dueDate: nextDueDate,
            reminderNotified: false,
            createdAt: now,
            updatedAt: now,
          };
          nextTasks.unshift(nextOccurrence);
        }

        return {
          ...prev,
          tasks: nextTasks,
        };
      });
    },
    [queueSyncMutation]
  );

  const deleteTaskToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('tasks', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === id ? { ...t, isDeleted: true, deletedAt: now, updatedAt: now } : t
        ),
      }));
    },
    [queueSyncMutation]
  );

  const createTaskList = useCallback(
    (projectId: string, name: string, showInAndroidWidget = true): TaskList => {
      const now = new Date().toISOString();
      const list: TaskList = {
        id: `list-${Date.now()}`,
        projectId,
        folderId: null,
        name: name.trim() || 'Task List',
        order: state.taskLists.length,
        showInAndroidWidget,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        taskLists: [...prev.taskLists, list],
        settings: showInAndroidWidget
          ? {
              ...prev.settings,
              androidWidgetSettings: {
                ...prev.settings.androidWidgetSettings,
                selectedTaskListIds: [
                  ...prev.settings.androidWidgetSettings.selectedTaskListIds,
                  list.id,
                ],
              },
            }
          : prev.settings,
      }));
      return list;
    },
    [state.taskLists.length]
  );

  const toggleTaskListWidgetVisibility = useCallback((taskListId: string) => {
    setState((prev) => {
      const selected = new Set(prev.settings.androidWidgetSettings.selectedTaskListIds);
      if (selected.has(taskListId)) {
        selected.delete(taskListId);
      } else {
        selected.add(taskListId);
      }
      return {
        ...prev,
        taskLists: prev.taskLists.map((l) =>
          l.id === taskListId ? { ...l, showInAndroidWidget: selected.has(taskListId) } : l
        ),
        settings: {
          ...prev.settings,
          androidWidgetSettings: {
            ...prev.settings.androidWidgetSettings,
            selectedTaskListIds: Array.from(selected),
          },
        },
      };
    });
  }, []);

  const createTag = useCallback((name: string, color: string): TaskTag => {
    const tag: TaskTag = {
      id: `tag-${Date.now()}`,
      name: name.trim(),
      color,
    };
    setState((prev) => ({
      ...prev,
      tags: [...prev.tags, tag],
    }));
    return tag;
  }, []);

  const createPage = useCallback(
    (
      projectId: string,
      folderId: string | null,
      title: string,
      icon = '📄',
      initialBlocks?: PageBlock[],
      createdByAgent = false
    ): PageDocument => {
      const now = new Date().toISOString();
      const page: PageDocument = {
        id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        projectId,
        folderId,
        title: title.trim() || 'Untitled Page',
        icon,
        createdByAgent,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        versionHistory: [],
        blocks:
          initialBlocks && initialBlocks.length > 0
            ? initialBlocks
            : [
                {
                  id: `blk-${Date.now()}-1`,
                  type: 'heading1',
                  content: title.trim() || 'Untitled Page',
                  dir: 'auto',
                  updatedAt: now,
                },
                {
                  id: `blk-${Date.now()}-2`,
                  type: 'paragraph',
                  content: '',
                  dir: 'auto',
                  updatedAt: now,
                },
              ],
      };
      queueSyncMutation('pages', page.id, 'upsert', page);
      setState((prev) => ({
        ...prev,
        pages: [page, ...prev.pages],
      }));
      setSelectedPageId(page.id);
      return page;
    },
    [queueSyncMutation]
  );

  const updatePage = useCallback(
    (
      id: string,
      patch: Partial<PageDocument>,
      snapshotReason?: { reason: 'manual_snapshot' | 'agent_edit'; summary: string }
    ) => {
      const now = new Date().toISOString();
      queueSyncMutation('pages', id, 'upsert', patch);
      setState((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== id) return p;
          const nextHistory = [...(p.versionHistory || [])];
          if (snapshotReason) {
            nextHistory.unshift({
              id: `ver-${Date.now()}`,
              pageId: p.id,
              timestamp: now,
              reason: snapshotReason.reason,
              summary: snapshotReason.summary,
              title: p.title,
              blocks: p.blocks,
            });
          }
          return {
            ...p,
            ...patch,
            versionHistory: nextHistory,
            updatedAt: now,
          };
        }),
      }));
    },
    [queueSyncMutation]
  );

  const restorePageVersion = useCallback(
    (pageId: string, versionId: string) => {
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        pages: prev.pages.map((p) => {
          if (p.id !== pageId) return p;
          const snap = p.versionHistory.find((v) => v.id === versionId);
          if (!snap) return p;
          return {
            ...p,
            title: snap.title,
            blocks: snap.blocks,
            versionHistory: [
              {
                id: `ver-${Date.now()}`,
                pageId: p.id,
                timestamp: now,
                reason: 'manual_snapshot',
                summary: `Backed up state before restoring snapshot from ${new Date(
                  snap.timestamp
                ).toLocaleTimeString()}`,
                title: p.title,
                blocks: p.blocks,
              },
              ...p.versionHistory,
            ],
            updatedAt: now,
          };
        }),
      }));
    },
    []
  );

  const deletePageToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('pages', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === id ? { ...p, isDeleted: true, deletedAt: now, updatedAt: now } : p
        ),
      }));
    },
    [queueSyncMutation]
  );

  // FR-4.1 - FR-4.3: Upload file, cache locally, sync metadata to Google Drive, and run PDF/Image OCR
  const uploadWorkspaceFile = useCallback(
    async (
      file: File,
      projectId: string,
      folderId: string | null,
      taskId: string | null = null
    ): Promise<WorkspaceFile> => {
      const now = new Date().toISOString();
      const dataUrl: string = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
      });

      const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const extractedText = await extractTextAndOcrFromFile(file, dataUrl, state.settings);

      let driveFileId = `gdrive-${fileId}`;
      let driveWebViewLink: string | undefined = undefined;
      let driveSyncStatus: 'local_only' | 'syncing' | 'synced' | 'error' =
        state.settings.googleAccount.connected ? 'synced' : 'local_only';

      if (state.settings.googleAccount.connected && state.settings.googleAccount.accessToken) {
        try {
          const folderIdOnDrive =
            state.settings.googleAccount.driveFolderId ||
            (await getOrCreateDriveFolder(
              state.settings.googleAccount.accessToken,
              state.settings.googleAccount.driveFolderName || 'MemoryHub'
            ));

          const driveRes = await uploadFileToDrive({
            accessToken: state.settings.googleAccount.accessToken,
            folderId: folderIdOnDrive,
            fileName: file.name,
            mimeType: file.type || 'application/octet-stream',
            blobOrDataUrl: file,
          });

          if (driveRes.success && driveRes.driveFileId) {
            driveFileId = driveRes.driveFileId;
            driveWebViewLink = driveRes.webViewLink;
            driveSyncStatus = 'synced';
          }
        } catch {
          driveSyncStatus = 'local_only';
        }
      }

      const newFile: WorkspaceFile = {
        id: fileId,
        projectId,
        folderId,
        taskId,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        dataUrl,
        extractedText,
        ocrStatus: 'completed',
        driveFileId,
        driveWebViewLink,
        driveSyncStatus,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };

      queueSyncMutation('files', newFile.id, 'upsert', { ...newFile, dataUrl: undefined });

      setState((prev) => ({
        ...prev,
        files: [newFile, ...prev.files],
        tasks: taskId
          ? prev.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    attachmentFileIds: Array.from(new Set([...t.attachmentFileIds, newFile.id])),
                    updatedAt: now,
                  }
                : t
            )
          : prev.tasks,
      }));

      return newFile;
    },
    [state.settings, queueSyncMutation]
  );

  const deleteFileToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('files', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        files: prev.files.map((f) =>
          f.id === id ? { ...f, isDeleted: true, deletedAt: now, updatedAt: now } : f
        ),
      }));
    },
    [queueSyncMutation]
  );

  const createCanvas = useCallback(
    (projectId: string, folderId: string | null, title: string): CanvasBoard => {
      const now = new Date().toISOString();
      const canvas: CanvasBoard = {
        id: `canvas-${Date.now()}`,
        projectId,
        folderId,
        title: title.trim() || 'Untitled Canvas',
        viewport: { x: 40, y: 40, zoom: 1 },
        nodes: [
          {
            id: `node-${Date.now()}-1`,
            type: 'rounded_rect',
            x: 140,
            y: 120,
            width: 200,
            height: 90,
            text: title.trim() || 'Start Idea',
            fillColor: '#EEF2FF',
            borderColor: '#4F46E5',
            borderStyle: 'solid',
            borderWidth: 2,
            textColor: '#1E1B4B',
            fontSize: 14,
            textAlign: 'center',
            zIndex: 1,
          },
        ],
        connectors: [],
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };
      queueSyncMutation('canvases', canvas.id, 'upsert', canvas);
      setState((prev) => ({
        ...prev,
        canvases: [canvas, ...prev.canvases],
      }));
      setSelectedCanvasId(canvas.id);
      return canvas;
    },
    [queueSyncMutation]
  );

  const updateCanvas = useCallback(
    (id: string, patch: Partial<CanvasBoard>) => {
      const now = new Date().toISOString();
      queueSyncMutation('canvases', id, 'upsert', patch);
      setState((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === id ? { ...c, ...patch, updatedAt: now } : c
        ),
      }));
    },
    [queueSyncMutation]
  );

  const deleteCanvasToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('canvases', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        canvases: prev.canvases.map((c) =>
          c.id === id ? { ...c, isDeleted: true, deletedAt: now, updatedAt: now } : c
        ),
      }));
    },
    [queueSyncMutation]
  );

  // FR-6.1 - FR-6.10: Create meeting note, handle offline queueing, transcribe & separate speakers
  const createMeetingNote = useCallback(
    async (input: {
      projectId: string;
      folderId: string | null;
      title: string;
      captureMode: 'mic_only' | 'mic_and_system_audio';
      durationSec: number;
      userLiveNotes: string;
      audioDataUrl?: string;
      audioMimeType?: string;
      liveSegments?: MeetingNote['segments'];
    }): Promise<MeetingNote> => {
      const now = new Date().toISOString();
      const isOnline = navigator.onLine;
      const meetingId = `meeting-${Date.now()}`;

      let speakerLabels: Record<string, string> = {
        speaker_1: 'Speaker 1',
        speaker_2: 'Speaker 2',
      };
      let segments: MeetingNote['segments'] = input.liveSegments || [];
      let summary = '';
      let keyPoints: string[] = [];
      let decisions: string[] = [];
      let taskSuggestions: MeetingNote['taskSuggestions'] = [];
      let status: MeetingNote['transcriptionStatus'] = isOnline ? 'completed' : 'queued_offline';

      if (isOnline) {
        const result = await transcribeAndSummarizeMeetingAudio(
          input.audioDataUrl,
          input.audioMimeType || 'audio/webm',
          input.userLiveNotes,
          input.title,
          state.settings,
          input.liveSegments
        );
        speakerLabels = result.speakerLabels;
        segments = result.segments;
        summary = result.summary;
        keyPoints = result.keyPoints;
        decisions = result.decisions;
        taskSuggestions = result.taskSuggestions;
      } else {
        summary =
          'Recorded while offline. Audio is safely saved on device and will be transcribed automatically when internet connection returns (FR-6.5).';
      }

      const meeting: MeetingNote = {
        id: meetingId,
        projectId: input.projectId,
        folderId: input.folderId,
        title: input.title.trim() || 'Meeting Note',
        recordedAt: now,
        durationSec: input.durationSec,
        captureMode: input.captureMode,
        transcriptionStatus: status,
        transcriptionProvider: state.settings.transcriptionProvider,
        speakerLabels,
        segments,
        userLiveNotes: input.userLiveNotes,
        summary,
        keyPoints,
        decisions,
        taskSuggestions,
        audioDataUrl: input.audioDataUrl,
        audioMimeType: input.audioMimeType,
        audioDeleted: state.settings.audioRetention === 'delete_after_summary',
        driveAudioFileId: `drive-audio-${meetingId}`,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
      };

      queueSyncMutation('meetings', meeting.id, 'upsert', { ...meeting, audioDataUrl: undefined });
      setState((prev) => ({
        ...prev,
        meetings: [meeting, ...prev.meetings],
      }));
      setSelectedMeetingId(meeting.id);

      // FR-6.6: Upload meeting audio to Google Drive in the background when connected
      if (
        input.audioDataUrl &&
        state.settings.googleAccount.connected &&
        state.settings.googleAccount.accessToken
      ) {
        (async () => {
          try {
            const folderId =
              state.settings.googleAccount.driveFolderId ||
              (await getOrCreateDriveFolder(
                state.settings.googleAccount.accessToken,
                state.settings.googleAccount.driveFolderName || 'MemoryHub'
              ));
            const upRes = await uploadFileToDrive({
              accessToken: state.settings.googleAccount.accessToken,
              folderId,
              fileName: `meeting-${meetingId}-audio.webm`,
              mimeType: input.audioMimeType || 'audio/webm',
              blobOrDataUrl: input.audioDataUrl!,
            });
            if (upRes.success && upRes.driveFileId) {
              setState((prev) => ({
                ...prev,
                meetings: prev.meetings.map((m) =>
                  m.id === meetingId ? { ...m, driveAudioFileId: upRes.driveFileId } : m
                ),
              }));
            }
          } catch {
            // Keep local audio
          }
        })();
      }

      return meeting;
    },
    [state.settings, queueSyncMutation]
  );

  const updateMeetingNote = useCallback(
    (id: string, patch: Partial<MeetingNote>) => {
      const now = new Date().toISOString();
      queueSyncMutation('meetings', id, 'upsert', patch);
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === id ? { ...m, ...patch, updatedAt: now } : m
        ),
      }));
    },
    [queueSyncMutation]
  );

  // FR-6.4: Rename speaker once and apply across the entire transcript
  const renameMeetingSpeaker = useCallback(
    (meetingId: string, speakerId: string, newLabel: string) => {
      const trimmed = newLabel.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                speakerLabels: {
                  ...m.speakerLabels,
                  [speakerId]: trimmed,
                },
                updatedAt: now,
              }
            : m
        ),
      }));
    },
    []
  );

  // FR-6.6: Delete original audio while keeping the transcript intact
  const deleteMeetingOriginalAudio = useCallback((meetingId: string) => {
    const now = new Date().toISOString();
    setState((prev) => ({
      ...prev,
      meetings: prev.meetings.map((m) =>
        m.id === meetingId
          ? {
              ...m,
              audioDataUrl: undefined,
              driveAudioFileId: undefined,
              audioDeleted: true,
              updatedAt: now,
            }
          : m
      ),
    }));
  }, []);

  // FR-6.8 & FR-2.9: Accept, edit, or reject suggested tasks from a meeting, linking back to the meeting
  const handleMeetingTaskSuggestion = useCallback(
    (
      meetingId: string,
      suggestionId: string,
      decision: 'accept' | 'reject',
      editedTitle?: string
    ) => {
      const meeting = state.meetings.find((m) => m.id === meetingId);
      if (!meeting) return;
      const suggestion = meeting.taskSuggestions.find((s) => s.id === suggestionId);
      if (!suggestion) return;

      let createdTaskId: string | undefined;
      if (decision === 'accept') {
        const created = createTask({
          projectId: meeting.projectId,
          folderId: meeting.folderId,
          title: (editedTitle ?? suggestion.title).trim(),
          description: suggestion.description,
          priority: suggestion.priority,
          dueDate: suggestion.dueDate,
          sourceType: 'meeting',
          sourceId: meeting.id,
          sourceTitle: meeting.title,
        });
        createdTaskId = created.id;
      }

      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === meetingId
            ? {
                ...m,
                taskSuggestions: m.taskSuggestions.map((s) =>
                  s.id === suggestionId
                    ? {
                        ...s,
                        title: editedTitle ?? s.title,
                        status: decision === 'accept' ? 'accepted' : 'rejected',
                        createdTaskId,
                      }
                    : s
                ),
              }
            : m
        ),
      }));
    },
    [state.meetings, createTask]
  );

  const deleteMeetingToTrash = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      queueSyncMutation('meetings', id, 'delete', { isDeleted: true });
      setState((prev) => ({
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === id ? { ...m, isDeleted: true, deletedAt: now, updatedAt: now } : m
        ),
      }));
    },
    [queueSyncMutation]
  );

  // --- AI Agent & Diff Approval Workflow (FR-7.1 - FR-7.15) ---

  const sendAgentPrompt = useCallback(
    async (prompt: string, conversationId: string, scopeProjectId: string | null) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const now = new Date().toISOString();

      const userMessage = {
        id: `msg-user-${Date.now()}`,
        role: 'user' as const,
        content: trimmed,
        timestamp: now,
      };

      setState((prev) => ({
        ...prev,
        conversations: prev.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, scopeProjectId, messages: [...c.messages, userMessage], updatedAt: now }
            : c
        ),
      }));

      const turnResult = await runAgentTurn(state, trimmed, scopeProjectId);
      const createdSummaryItems: NonNullable<typeof turnResult.assistantMessage.createdItems> = [];

      for (const ct of turnResult.createdTasks) {
        const task = createTask({
          projectId: ct.projectId,
          title: ct.title,
          description: ct.description,
          priority: ct.priority,
          dueDate: ct.dueDate,
          syncToGoogleCalendar: ct.syncToGoogleCalendar,
          sourceType: 'agent',
          sourceTitle: 'AI Agent Chat',
        });
        createdSummaryItems.push({
          type: 'task',
          id: task.id,
          title: task.title,
          projectId: task.projectId,
        });
      }

      for (const cp of turnResult.createdPages) {
        const blocks: PageBlock[] = cp.initialParagraphs.map((txt, idx) => ({
          id: `blk-agent-${Date.now()}-${idx}`,
          type: idx === 0 ? 'callout' : 'paragraph',
          content: txt,
          dir: 'auto',
          updatedAt: new Date().toISOString(),
        }));
        const page = createPage(cp.projectId, null, cp.title, '✨', blocks, true);
        createdSummaryItems.push({
          type: 'page',
          id: page.id,
          title: page.title,
          projectId: page.projectId,
        });
      }

      const finalAssistantMsg = {
        ...turnResult.assistantMessage,
        createdItems: createdSummaryItems.length > 0 ? createdSummaryItems : undefined,
      };

      setState((prev) => ({
        ...prev,
        editProposals: [...turnResult.editProposals, ...prev.editProposals],
        conversations: prev.conversations.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, finalAssistantMsg],
                updatedAt: new Date().toISOString(),
              }
            : c
        ),
      }));
    },
    [state, createTask, createPage]
  );

  const createNewConversation = useCallback(
    (scopeProjectId: string | null): AgentConversation => {
      const now = new Date().toISOString();
      const conv: AgentConversation = {
        id: `conv-${Date.now()}`,
        title: `Conversation ${state.conversations.length + 1}`,
        scopeProjectId,
        messages: [],
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        conversations: [conv, ...prev.conversations],
      }));
      return conv;
    },
    [state.conversations.length]
  );

  const clearConversationMessages = useCallback((conversationId: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === conversationId ? { ...c, messages: [], updatedAt: new Date().toISOString() } : c
      ),
    }));
  }, []);

  // FR-7.9 & FR-7.12: Apply or reject an Agent Edit Proposal (Accept All, Accept Selected Blocks, or Reject),
  // saving the previous page state into versionHistory so the user can always undo!
  const applyEditProposalDecision = useCallback(
    (
      proposalId: string,
      decision: 'accept_all' | 'accept_selected' | 'reject',
      selectedBlockIds?: string[]
    ) => {
      const now = new Date().toISOString();
      setState((prev) => {
        const proposal = prev.editProposals.find((p) => p.id === proposalId);
        if (!proposal || proposal.status !== 'pending') return prev;

        if (decision === 'reject') {
          return {
            ...prev,
            editProposals: prev.editProposals.map((p) =>
              p.id === proposalId ? { ...p, status: 'rejected' } : p
            ),
          };
        }

        const acceptedSet =
          decision === 'accept_all'
            ? new Set(proposal.blockChanges.map((bc) => bc.blockId))
            : new Set(
                selectedBlockIds ||
                  proposal.blockChanges.filter((bc) => bc.accepted).map((bc) => bc.blockId)
              );

        const nextPages = prev.pages.map((page) => {
          if (page.id !== proposal.targetId) return page;

          // Save snapshot in Version History (FR-7.12)
          const snapshot = {
            id: `ver-agent-${Date.now()}`,
            pageId: page.id,
            timestamp: now,
            reason: 'agent_edit' as const,
            summary: `Before applying AI Agent proposal: "${proposal.summaryOfChanges}"`,
            title: page.title,
            blocks: page.blocks,
          };

          const updatedBlocks = page.blocks.map((blk) => {
            const change = proposal.blockChanges.find(
              (bc) => bc.blockId === blk.id && bc.changeType === 'modified'
            );
            if (change && acceptedSet.has(blk.id)) {
              return {
                ...blk,
                content: change.afterText,
                updatedAt: now,
              };
            }
            return blk;
          });

          for (const addedChange of proposal.blockChanges) {
            if (addedChange.changeType === 'added' && acceptedSet.has(addedChange.blockId)) {
              updatedBlocks.push(
                addedChange.afterBlock || {
                  id: addedChange.blockId,
                  type: 'callout',
                  content: addedChange.afterText,
                  dir: 'auto',
                  updatedAt: now,
                }
              );
            }
          }

          return {
            ...page,
            blocks: updatedBlocks,
            versionHistory: [snapshot, ...(page.versionHistory || [])],
            updatedAt: now,
          };
        });

        return {
          ...prev,
          pages: nextPages,
          editProposals: prev.editProposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  status: decision === 'accept_all' ? 'accepted_all' : 'accepted_partial',
                }
              : p
          ),
        };
      });
    },
    []
  );

  const createAgentProposalForPage = useCallback(
    (pageId: string, instruction: string) => {
      const page = state.pages.find((p) => p.id === pageId);
      if (!page) return;
      const isHebrew = /[\u0590-\u05FF]/.test(instruction + page.title);
      const targetBlock = page.blocks[0];
      const newBlkId = `blk-prop-${Date.now()}`;

      const proposal: AgentEditProposal = {
        id: `prop-${Date.now()}`,
        targetType: 'page',
        targetId: page.id,
        targetTitle: page.title,
        projectId: page.projectId,
        summaryOfChanges: instruction.trim() || 'AI Agent structural refinement & summary addition',
        createdAt: new Date().toISOString(),
        origin: 'chat',
        status: 'pending',
        blockChanges: [
          ...(targetBlock
            ? [
                {
                  blockId: targetBlock.id,
                  changeType: 'modified' as const,
                  beforeText: targetBlock.content,
                  afterText: `${targetBlock.content} — ${
                    isHebrew ? '[שופר ע״י סוכן AI]' : '[Polished by AI Agent]'
                  }`,
                  accepted: true,
                },
              ]
            : []),
          {
            blockId: newBlkId,
            changeType: 'added' as const,
            beforeText: '',
            afterText: isHebrew
              ? `✨ סיכום ותובנות סוכן AI (${instruction || 'שיפור אוטומטי'}): הוגדרו נקודות המשך וקונסולידציה של תוכן הדף.`
              : `✨ AI Agent Synthesis (${instruction || 'Page Enhancement'}): Added key takeaways and action summary block.`,
            accepted: true,
          },
        ],
      };

      setState((prev) => ({
        ...prev,
        editProposals: [proposal, ...prev.editProposals],
      }));
    },
    [state.pages]
  );

  // --- Routines & Multi-Device Claim Engine (FR-10.1 - FR-10.7) ---

  const createRoutine = useCallback(
    (input: Omit<Routine, 'id' | 'createdAt' | 'updatedAt'>): Routine => {
      const now = new Date().toISOString();
      const routine: Routine = {
        ...input,
        id: `routine-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      };
      setState((prev) => ({
        ...prev,
        routines: [routine, ...prev.routines],
      }));
      return routine;
    },
    []
  );

  const updateRoutine = useCallback((id: string, patch: Partial<Routine>) => {
    setState((prev) => ({
      ...prev,
      routines: prev.routines.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r
      ),
    }));
  }, []);

  const deleteRoutine = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      routines: prev.routines.filter((r) => r.id !== id),
    }));
  }, []);

  // FR-10.4, FR-10.5, FR-10.6, FR-10.7: Run routine with multi-device slot claiming, late-run logging, and Review Inbox diff queueing
  const executeRoutineNow = useCallback(
    async (routineId: string, simulateLateMinutes = 0, simulateDeviceName?: string) => {
      const routine = state.routines.find((r) => r.id === routineId);
      if (!routine) return;
      const now = new Date();
      const todayKey = now.toISOString().slice(0, 10);
      const slotKey = `${routine.id}_${todayKey}_${routine.scheduleTime}`;
      const deviceId = simulateDeviceName ? `dev-${simulateDeviceName}` : state.settings.deviceId;
      const deviceName = simulateDeviceName || state.settings.deviceName;

      // FR-10.4: Check if another device already claimed this scheduled run slot
      const existingClaim = state.routineClaims.find((c) => c.slotKey === slotKey);
      if (existingClaim && existingClaim.claimedByDeviceId !== deviceId && simulateLateMinutes === 0) {
        const skipLog: RoutineRunLog = {
          id: `rlog-${Date.now()}`,
          routineId: routine.id,
          routineName: routine.name,
          scheduledFor: `${todayKey} ${routine.scheduleTime}`,
          executedAt: now.toISOString(),
          wasLate: false,
          lateByMinutes: 0,
          deviceId,
          deviceName,
          status: 'skipped_already_claimed',
          actionsSummary: `Skipped duplicate run: Slot "${slotKey}" was already claimed by ${existingClaim.claimedByDeviceName}.`,
          createdTaskIds: [],
          proposedEditIds: [],
        };
        setState((prev) => ({
          ...prev,
          routineLogs: [skipLog, ...prev.routineLogs],
        }));
        return;
      }

      const newClaim: RoutineClaim = {
        slotKey,
        routineId: routine.id,
        claimedByDeviceId: deviceId,
        claimedByDeviceName: deviceName,
        claimedAt: now.toISOString(),
      };

      // Filter allowed emails if the routine uses Gmail (FR-9.2, FR-10.6)
      const allowedEmails = state.gmailMessages.filter((em) =>
        isEmailAllowedByPolicy(
          em,
          state.settings.gmailAllowlist.allowedLabels,
          state.settings.gmailAllowlist.allowedSenders
        )
      );

      const createdTask = createTask({
        projectId: routine.targetProjectId,
        title: `[Routine: ${routine.name}] Follow up on ${
          allowedEmails[0]?.subject || 'scheduled project review'
        }`,
        description: `Automated routine instruction: "${routine.instruction}"`,
        priority: 'medium',
        dueDate: todayKey,
        sourceType: 'routine',
        sourceId: routine.id,
        sourceTitle: routine.name,
      });

      // Also propose an edit to a page in the target project that waits in Review Inbox (FR-10.6)
      const targetPage = state.pages.find(
        (p) => !p.isDeleted && p.projectId === routine.targetProjectId
      );
      const proposedEditIds: string[] = [];
      const newProposals: AgentEditProposal[] = [];

      if (targetPage) {
        const propId = `prop-routine-${Date.now()}`;
        proposedEditIds.push(propId);
        newProposals.push({
          id: propId,
          targetType: 'page',
          targetId: targetPage.id,
          targetTitle: targetPage.title,
          projectId: targetPage.projectId,
          summaryOfChanges: `Routine "${routine.name}" proposed appending today's status update`,
          createdAt: now.toISOString(),
          origin: 'routine',
          routineId: routine.id,
          status: 'pending',
          blockChanges: [
            {
              blockId: `blk-routine-${Date.now()}`,
              changeType: 'added',
              beforeText: '',
              afterText: `🤖 Routine Update (${todayKey} ${routine.scheduleTime}): Processed ${allowedEmails.length} allowed emails and created task "${createdTask.title}".`,
              accepted: true,
            },
          ],
        });
      }

      const runLog: RoutineRunLog = {
        id: `rlog-${Date.now()}`,
        routineId: routine.id,
        routineName: routine.name,
        scheduledFor: `${todayKey} ${routine.scheduleTime}`,
        executedAt: now.toISOString(),
        wasLate: simulateLateMinutes > 0,
        lateByMinutes: simulateLateMinutes,
        deviceId,
        deviceName,
        status: 'success',
        actionsSummary:
          simulateLateMinutes > 0
            ? `Executed late (+${simulateLateMinutes}m catch-up after device came online). Claimed slot "${slotKey}", scanned ${allowedEmails.length} allowed emails, created 1 task, and queued ${newProposals.length} edit proposal in Review Inbox.`
            : `Claimed slot "${slotKey}" on ${deviceName}. Scanned ${allowedEmails.length} allowed emails, created 1 task, and queued ${newProposals.length} edit proposal in Review Inbox.`,
        createdTaskIds: [createdTask.id],
        proposedEditIds,
      };

      setState((prev) => ({
        ...prev,
        routines: prev.routines.map((r) =>
          r.id === routine.id
            ? { ...r, lastRunAt: now.toISOString(), lastSlotClaimed: slotKey }
            : r
        ),
        routineClaims: [
          newClaim,
          ...prev.routineClaims.filter((c) => c.slotKey !== slotKey),
        ],
        routineLogs: [runLog, ...prev.routineLogs],
        editProposals: [...newProposals, ...prev.editProposals],
      }));
    },
    [state, createTask]
  );

  // FR-9.4: Extract task from an allowed Gmail message with source backlink
  const extractTaskFromGmailMessage = useCallback(
    (emailId: string, targetProjectId: string): Task | null => {
      const email = state.gmailMessages.find((e) => e.id === emailId);
      if (!email) return null;
      if (
        !isEmailAllowedByPolicy(
          email,
          state.settings.gmailAllowlist.allowedLabels,
          state.settings.gmailAllowlist.allowedSenders
        )
      ) {
        return null;
      }
      return createTask({
        projectId: targetProjectId,
        title: email.subject,
        description: `Extracted from email by ${email.fromName} (<${email.fromEmail}>):\n\n${email.bodyText}`,
        priority: 'medium',
        dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        sourceType: 'email',
        sourceId: email.id,
        sourceTitle: `${email.fromName} — ${email.subject}`,
        sourceUrl: email.gmailWebUrl,
      });
    },
    [state.gmailMessages, state.settings.gmailAllowlist, createTask]
  );

  // FR-1.7: Restore or Permanently Purge items in Trash
  const restoreTrashItem = useCallback(
    (
      itemType: 'project' | 'subfolder' | 'task' | 'page' | 'file' | 'canvas' | 'meeting',
      id: string
    ) => {
      setState((prev) => {
        const restore = <T extends { id: string; isDeleted: boolean; deletedAt?: string }>(
          arr: T[]
        ) => arr.map((x) => (x.id === id ? { ...x, isDeleted: false, deletedAt: undefined } : x));

        if (itemType === 'project') return { ...prev, projects: restore(prev.projects) };
        if (itemType === 'subfolder') return { ...prev, subfolders: restore(prev.subfolders) };
        if (itemType === 'task') return { ...prev, tasks: restore(prev.tasks) };
        if (itemType === 'page') return { ...prev, pages: restore(prev.pages) };
        if (itemType === 'file') return { ...prev, files: restore(prev.files) };
        if (itemType === 'canvas') return { ...prev, canvases: restore(prev.canvases) };
        if (itemType === 'meeting') return { ...prev, meetings: restore(prev.meetings) };
        return prev;
      });
    },
    []
  );

  const permanentlyPurgeTrashItem = useCallback(
    (
      itemType: 'project' | 'subfolder' | 'task' | 'page' | 'file' | 'canvas' | 'meeting',
      id: string
    ) => {
      setState((prev) => {
        if (itemType === 'project')
          return { ...prev, projects: prev.projects.filter((x) => x.id !== id) };
        if (itemType === 'subfolder')
          return { ...prev, subfolders: prev.subfolders.filter((x) => x.id !== id) };
        if (itemType === 'task') return { ...prev, tasks: prev.tasks.filter((x) => x.id !== id) };
        if (itemType === 'page') return { ...prev, pages: prev.pages.filter((x) => x.id !== id) };
        if (itemType === 'file') return { ...prev, files: prev.files.filter((x) => x.id !== id) };
        if (itemType === 'canvas')
          return { ...prev, canvases: prev.canvases.filter((x) => x.id !== id) };
        if (itemType === 'meeting')
          return { ...prev, meetings: prev.meetings.filter((x) => x.id !== id) };
        return prev;
      });
    },
    []
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setState((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ...patch,
      },
    }));
  }, []);

  // ============================================================================
  // GOOGLE SIGN-IN, GOOGLE DRIVE & FIRESTORE CLOUD METHODS
  // ============================================================================
  const signInWithGoogle = useCallback(
    async (customClientId?: string): Promise<{ success: boolean; error?: string }> => {
      const clientId = customClientId || state.settings.googleAccount.clientId;
      if (!clientId || !clientId.trim()) {
        return {
          success: false,
          error: 'Please enter your Google OAuth 2.0 Web Client ID in Settings first.',
        };
      }

      const res = await signInWithGoogleOAuth(clientId);
      if (!res.success || !res.accessToken) {
        return { success: false, error: res.error || 'Google Sign-In failed.' };
      }

      let folderId = state.settings.googleAccount.driveFolderId;
      try {
        folderId = await getOrCreateDriveFolder(
          res.accessToken,
          state.settings.googleAccount.driveFolderName || 'MemoryHub'
        );
      } catch (fErr) {
        console.warn('Could not initialize Google Drive folder:', fErr);
      }

      const updatedGoogleAccount = {
        connected: true,
        email: res.user?.email || 'google-user@memoryhub.app',
        displayName: res.user?.name || 'Google Account Owner',
        avatarUrl: res.user?.picture,
        clientId: clientId.trim(),
        accessToken: res.accessToken,
        tokenExpiresAt: res.tokenExpiresAt,
        driveFolderId: folderId,
        driveFolderName: state.settings.googleAccount.driveFolderName || 'MemoryHub',
        scopes: res.scopes,
      };

      updateSettings({ googleAccount: updatedGoogleAccount });
      return { success: true };
    },
    [state.settings.googleAccount, updateSettings]
  );

  const signOutGoogle = useCallback(async () => {
    if (state.settings.googleAccount.accessToken) {
      await revokeGoogleAccessToken(state.settings.googleAccount.accessToken);
    }
    updateSettings({
      googleAccount: {
        ...state.settings.googleAccount,
        connected: false,
        accessToken: '',
        avatarUrl: undefined,
        tokenExpiresAt: undefined,
      },
    });
  }, [state.settings.googleAccount, updateSettings]);

  const testGoogleDrive = useCallback(async () => {
    const token = state.settings.googleAccount.accessToken;
    if (!token) {
      return { success: false, error: 'Google Account is not connected or token is missing.' };
    }
    const res = await testGoogleDriveConnection(
      token,
      state.settings.googleAccount.driveFolderName || 'MemoryHub'
    );
    if (res.success && res.folderId) {
      updateSettings({
        googleAccount: {
          ...state.settings.googleAccount,
          driveFolderId: res.folderId,
        },
      });
    }
    return res;
  }, [state.settings.googleAccount, updateSettings]);

  const syncDriveFiles = useCallback(async (): Promise<{
    uploaded: number;
    downloaded: number;
    errors: string[];
  }> => {
    const token = state.settings.googleAccount.accessToken;
    if (!token) {
      return { uploaded: 0, downloaded: 0, errors: ['Google Account is not connected. Please connect in Settings.'] };
    }

    const errors: string[] = [];
    let uploaded = 0;
    let downloaded = 0;

    try {
      const folderId =
        state.settings.googleAccount.driveFolderId ||
        (await getOrCreateDriveFolder(
          token,
          state.settings.googleAccount.driveFolderName || 'MemoryHub'
        ));

      // 1. Upload local files that are not synced yet
      const unsyncedFiles = state.files.filter(
        (f) => !f.isDeleted && (f.driveSyncStatus !== 'synced' || !f.driveFileId) && f.dataUrl
      );

      for (const file of unsyncedFiles) {
        try {
          const upRes = await uploadFileToDrive({
            accessToken: token,
            folderId,
            fileName: file.name,
            mimeType: file.mimeType,
            blobOrDataUrl: file.dataUrl!,
          });

          if (upRes.success && upRes.driveFileId) {
            uploaded++;
            setState((prev) => ({
              ...prev,
              files: prev.files.map((f) =>
                f.id === file.id
                  ? {
                      ...f,
                      driveFileId: upRes.driveFileId,
                      driveWebViewLink: upRes.webViewLink,
                      driveSyncStatus: 'synced',
                      updatedAt: new Date().toISOString(),
                    }
                  : f
              ),
            }));
          } else if (upRes.error) {
            errors.push(`${file.name}: ${upRes.error}`);
          }
        } catch (fErr: any) {
          errors.push(`${file.name}: ${fErr?.message || 'Upload error'}`);
        }
      }

      // 2. Fetch Drive files in the folder and download any missing into local cache
      const driveFiles = await listDriveFolderFiles(token, folderId);
      const existingDriveIds = new Set(
        state.files.filter((f) => !f.isDeleted && f.driveFileId).map((f) => f.driveFileId!)
      );

      for (const dFile of driveFiles) {
        if (!existingDriveIds.has(dFile.id)) {
          try {
            const downloadedData = await downloadFileFromDrive(token, dFile.id);
            downloaded++;
            const newFile: WorkspaceFile = {
              id: `file-drive-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              projectId: state.projects.find((p) => !p.isDeleted)?.id || 'proj-product-2026',
              folderId: null,
              name: dFile.name,
              mimeType: dFile.mimeType,
              sizeBytes: dFile.size ? parseInt(dFile.size, 10) : downloadedData.blob.size,
              dataUrl: downloadedData.dataUrl,
              extractedText: '',
              ocrStatus: 'completed',
              driveFileId: dFile.id,
              driveWebViewLink: dFile.webViewLink,
              driveSyncStatus: 'synced',
              isDeleted: false,
              createdAt: dFile.createdTime || new Date().toISOString(),
              updatedAt: dFile.modifiedTime || new Date().toISOString(),
            };

            setState((prev) => ({
              ...prev,
              files: [newFile, ...prev.files],
            }));
          } catch (dErr: any) {
            errors.push(`${dFile.name}: ${dErr?.message || 'Download error'}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(err?.message || 'Sync failed.');
    }

    return { uploaded, downloaded, errors };
  }, [state.files, state.projects, state.settings.googleAccount]);

  const testFirestore = useCallback(async () => {
    if (!state.settings.firebaseConfig.projectId || !state.settings.firebaseConfig.apiKey) {
      return { success: false, error: 'Please enter your Firebase Project ID and API Key.' };
    }
    const res = await testFirestoreConnection(state.settings.firebaseConfig);
    if (res.success) {
      updateSettings({
        firebaseConfig: {
          ...state.settings.firebaseConfig,
          connected: true,
          lastTestedAt: new Date().toISOString(),
        },
      });
    } else {
      updateSettings({
        firebaseConfig: {
          ...state.settings.firebaseConfig,
          connected: false,
        },
      });
    }
    return res;
  }, [state.settings.firebaseConfig, updateSettings]);

  const pushWorkspaceToFirestore = useCallback(async () => {
    if (!state.settings.firebaseConfig.projectId || !state.settings.firebaseConfig.apiKey) {
      return { success: false, writesCount: 0, error: 'Firebase Firestore is not configured.' };
    }
    const res = await pushFullWorkspaceToFirestore(state.settings.firebaseConfig, state);
    if (res.success) {
      setState((prev) => ({
        ...prev,
        usageStats: {
          ...prev.usageStats,
          writesToday: prev.usageStats.writesToday + res.writesCount,
          lastSyncedAt: new Date().toISOString(),
          syncState: 'synced',
        },
      }));
    }
    return res;
  }, [state, state.settings.firebaseConfig]);

  const pullWorkspaceFromFirestore = useCallback(async () => {
    if (!state.settings.firebaseConfig.projectId || !state.settings.firebaseConfig.apiKey) {
      return { success: false, readsCount: 0, error: 'Firebase Firestore is not configured.' };
    }
    const res = await pullAllWorkspaceFromFirestore(state.settings.firebaseConfig);
    if (res.success && res.data) {
      const remote = res.data;
      setState((prev) => {
        let mergedPages = [...prev.pages];
        if (remote.pages && remote.pages.length > 0) {
          const pageMap = new Map<string, PageDocument>(prev.pages.map((p) => [p.id, p]));
          for (const remPage of remote.pages) {
            const locPage = pageMap.get(remPage.id);
            if (!locPage) {
              pageMap.set(remPage.id, remPage);
            } else {
              pageMap.set(remPage.id, resolvePageConflict(locPage, remPage));
            }
          }
          mergedPages = Array.from(pageMap.values());
        }

        let mergedTasks = [...prev.tasks];
        if (remote.tasks && remote.tasks.length > 0) {
          const taskMap = new Map<string, Task>(prev.tasks.map((t) => [t.id, t]));
          for (const remTask of remote.tasks) {
            const locTask = taskMap.get(remTask.id);
            if (!locTask) {
              taskMap.set(remTask.id, remTask);
            } else {
              taskMap.set(remTask.id, resolveTaskConflict(locTask, remTask));
            }
          }
          mergedTasks = Array.from(taskMap.values());
        }

        return {
          ...prev,
          projects: remote.projects && remote.projects.length > 0 ? remote.projects : prev.projects,
          subfolders: remote.subfolders && remote.subfolders.length > 0 ? remote.subfolders : prev.subfolders,
          tasks: mergedTasks,
          pages: mergedPages,
          files: remote.files && remote.files.length > 0 ? remote.files : prev.files,
          canvases: remote.canvases && remote.canvases.length > 0 ? remote.canvases : prev.canvases,
          meetings: remote.meetings && remote.meetings.length > 0 ? remote.meetings : prev.meetings,
          routines: remote.routines && remote.routines.length > 0 ? remote.routines : prev.routines,
          usageStats: {
            ...prev.usageStats,
            readsToday: prev.usageStats.readsToday + res.readsCount,
            lastSyncedAt: new Date().toISOString(),
            syncState: 'synced',
          },
        };
      });
    }
    return { success: res.success, readsCount: res.readsCount, error: res.error };
  }, [state.settings.firebaseConfig]);

  const navigateToItem = useCallback(
    (itemType: string, itemId: string, projectId?: string) => {
      if (projectId) {
        setSelectedProjectId(projectId);
      }
      if (itemType === 'project') {
        setSelectedProjectId(itemId);
        setSelectedFolderId(null);
        const firstPage = state.pages.find((p) => !p.isDeleted && p.projectId === itemId);
        if (firstPage) {
          setSelectedPageId(firstPage.id);
          setActiveProjectFile({ type: 'page', id: firstPage.id });
        }
        setProjectSubTab('overview');
        setActiveNav('project');
      } else if (itemType === 'page') {
        const pg = state.pages.find((p) => p.id === itemId);
        if (pg) setSelectedProjectId(pg.projectId);
        setSelectedPageId(itemId);
        setActiveProjectFile({ type: 'page', id: itemId });
        setProjectSubTab('pages');
        setActiveNav('project');
      } else if (itemType === 'task') {
        const tk = state.tasks.find((t) => t.id === itemId);
        if (tk) {
          setSelectedProjectId(tk.projectId);
          setProjectSubTab('tasks');
          setActiveNav('project');
        } else {
          setActiveNav('all-tasks');
        }
      } else if (itemType === 'meeting') {
        const mt = state.meetings.find((m) => m.id === itemId);
        if (mt) setSelectedProjectId(mt.projectId);
        setSelectedMeetingId(itemId);
        setActiveProjectFile({ type: 'meeting', id: itemId });
        setProjectSubTab('meetings');
        setActiveNav('project');
      } else if (itemType === 'canvas') {
        const cv = state.canvases.find((c) => c.id === itemId);
        if (cv) setSelectedProjectId(cv.projectId);
        setSelectedCanvasId(itemId);
        setActiveProjectFile({ type: 'canvas', id: itemId });
        setProjectSubTab('canvases');
        setActiveNav('project');
      } else if (itemType === 'file') {
        const fl = state.files.find((f) => f.id === itemId);
        if (fl) setSelectedProjectId(fl.projectId);
        setSelectedFileId(itemId);
        setActiveProjectFile({ type: 'file', id: itemId });
        setProjectSubTab('files');
        setActiveNav('project');
      } else if (itemType === 'email') {
        setActiveNav('gmail');
      }
    },
    [state.pages, state.tasks, state.meetings, state.canvases, state.files]
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      state,
      isLoaded,
      activeNav,
      setActiveNav,
      selectedProjectId,
      setSelectedProjectId,
      selectedFolderId,
      setSelectedFolderId,
      projectSubTab,
      setProjectSubTab,
      selectedPageId,
      setSelectedPageId,
      selectedCanvasId,
      setSelectedCanvasId,
      selectedMeetingId,
      setSelectedMeetingId,
      selectedFileId,
      setSelectedFileId,
      activeProjectFile,
      setActiveProjectFile,
      quickCaptureMode,
      setQuickCaptureMode,
      createProject,
      updateProject,
      deleteProjectToTrash,
      createSubfolder,
      deleteSubfolderToTrash,
      moveItemToLocation,
      reorderProjectItems,
      createTask,
      updateTask,
      toggleTaskCompletion,
      deleteTaskToTrash,
      createTaskList,
      toggleTaskListWidgetVisibility,
      createTag,
      createPage,
      updatePage,
      restorePageVersion,
      deletePageToTrash,
      uploadWorkspaceFile,
      deleteFileToTrash,
      createCanvas,
      updateCanvas,
      deleteCanvasToTrash,
      createMeetingNote,
      updateMeetingNote,
      renameMeetingSpeaker,
      deleteMeetingOriginalAudio,
      handleMeetingTaskSuggestion,
      deleteMeetingToTrash,
      sendAgentPrompt,
      createNewConversation,
      clearConversationMessages,
      applyEditProposalDecision,
      createAgentProposalForPage,
      createRoutine,
      updateRoutine,
      deleteRoutine,
      executeRoutineNow,
      extractTaskFromGmailMessage,
      restoreTrashItem,
      permanentlyPurgeTrashItem,
      updateSettings,
      navigateToItem,
      signInWithGoogle,
      signOutGoogle,
      testGoogleDrive,
      syncDriveFiles,
      testFirestore,
      pushWorkspaceToFirestore,
      pullWorkspaceFromFirestore,
    }),
    [
      state,
      isLoaded,
      activeNav,
      selectedProjectId,
      selectedFolderId,
      projectSubTab,
      selectedPageId,
      selectedCanvasId,
      selectedMeetingId,
      selectedFileId,
      activeProjectFile,
      quickCaptureMode,
      createProject,
      updateProject,
      deleteProjectToTrash,
      createSubfolder,
      deleteSubfolderToTrash,
      moveItemToLocation,
      reorderProjectItems,
      createTask,
      updateTask,
      toggleTaskCompletion,
      deleteTaskToTrash,
      createTaskList,
      toggleTaskListWidgetVisibility,
      createTag,
      createPage,
      updatePage,
      restorePageVersion,
      deletePageToTrash,
      uploadWorkspaceFile,
      deleteFileToTrash,
      createCanvas,
      updateCanvas,
      deleteCanvasToTrash,
      createMeetingNote,
      updateMeetingNote,
      renameMeetingSpeaker,
      deleteMeetingOriginalAudio,
      handleMeetingTaskSuggestion,
      deleteMeetingToTrash,
      sendAgentPrompt,
      createNewConversation,
      clearConversationMessages,
      applyEditProposalDecision,
      createAgentProposalForPage,
      createRoutine,
      updateRoutine,
      deleteRoutine,
      executeRoutineNow,
      extractTaskFromGmailMessage,
      restoreTrashItem,
      permanentlyPurgeTrashItem,
      updateSettings,
      navigateToItem,
      signInWithGoogle,
      signOutGoogle,
      testGoogleDrive,
      syncDriveFiles,
      testFirestore,
      pushWorkspaceToFirestore,
      pullWorkspaceFromFirestore,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return ctx;
}
