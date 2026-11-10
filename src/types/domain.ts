export type LanguageCode = 'en' | 'he';
export type ThemeMode = 'light' | 'dark' | 'system';
export type PriorityLevel = 'none' | 'low' | 'medium' | 'high';
export type AIProviderId = 'gemini' | 'claude' | 'openai';
export type TranscriptionProviderId =
  | 'gemini_audio'
  | 'openai_whisper'
  | 'elevenlabs_scribe'
  | 'groq_whisper';

export interface Project {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  order: number;
  isArchived: boolean;
  excludeFromAgent: boolean; // FR-1.6: Blocks AI agent from reading any content in this project
  isDeleted: boolean;        // FR-1.7: Trash support
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Subfolder {
  id: string;
  projectId: string;
  parentId: string | null; // FR-1.3: Nested to any depth
  name: string;
  icon: string;
  order: number;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskList {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  order: number;
  showInAndroidWidget: boolean; // FR-12.1
  createdAt: string;
  updatedAt: string;
}

export interface TaskTag {
  id: string;
  name: string;
  color: string; // Hex or tailwind color token
}

export interface RecurrenceRule {
  frequency: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  intervalDays?: number;
}

export type TaskSourceType = 'user' | 'agent' | 'meeting' | 'email' | 'routine';

export interface Task {
  id: string;
  projectId: string;
  folderId: string | null;
  taskListId: string;
  title: string;
  description: string;
  completed: boolean;
  completedAt?: string;
  dueDate?: string; // YYYY-MM-DD (FR-2.2)
  dueTime?: string; // HH:mm (FR-2.2)
  priority: PriorityLevel; // FR-2.3
  reminderMinutesBefore?: number | null; // FR-2.4 (e.g., 0, 15, 30, 60, 1440)
  reminderNotified?: boolean;
  recurrence: RecurrenceRule; // FR-2.5
  tagIds: string[]; // Extra Task Feature: Color-coded tags
  attachmentFileIds: string[]; // Extra Task Feature: Direct file attachments on tasks
  syncToGoogleCalendar?: boolean; // FR-8.4
  googleCalendarEventId?: string;
  sourceType: TaskSourceType; // FR-2.9
  sourceId?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
  fieldUpdatedAt?: Record<string, string>; // Section 6.5: Last-write-wins per field
}

export type BlockType =
  | 'paragraph'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bullet_list'
  | 'numbered_list'
  | 'checklist'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'
  | 'link'
  | 'image'
  | 'file'
  | 'simple_table';

export interface SimpleTableData {
  headers: string[];
  rows: string[][];
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface PageBlock {
  id: string;
  type: BlockType;
  content: string; // Supports bold, italic, underline, inline links, mixed RTL/LTR
  checked?: boolean;
  checklistItems?: ChecklistItem[];
  codeLanguage?: string;
  linkUrl?: string;
  linkTitle?: string;
  fileId?: string;
  imageUrl?: string;
  tableData?: SimpleTableData; // FR-3.2
  dir?: 'auto' | 'rtl' | 'ltr'; // FR-3.4
  updatedAt: string;
}

export interface PageVersionSnapshot {
  id: string;
  pageId: string;
  timestamp: string;
  reason: 'agent_edit' | 'conflict_backup' | 'manual_snapshot';
  summary: string;
  title: string;
  blocks: PageBlock[];
}

export interface PageDocument {
  id: string;
  projectId: string;
  folderId: string | null;
  order?: number;
  title: string;
  icon: string;
  blocks: PageBlock[];
  versionHistory: PageVersionSnapshot[]; // FR-7.12 & Section 6.5
  createdByAgent?: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceFile {
  id: string;
  projectId: string;
  folderId: string | null;
  order?: number;
  taskId?: string | null; // When attached directly to a task
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUrl?: string; // Cached locally for offline access (FR-4.2)
  extractedText: string; // FR-4.3: PDF text extraction & Hebrew/English OCR
  ocrStatus: 'none' | 'processing' | 'completed' | 'failed';
  driveFileId?: string;
  driveWebViewLink?: string;
  driveSyncStatus: 'local_only' | 'syncing' | 'synced' | 'error';
  createdByAgent?: boolean;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type CanvasShapeType =
  | 'rectangle'
  | 'rounded_rect'
  | 'circle'
  | 'diamond'
  | 'sticky_note'
  | 'text'
  | 'image';

export type AnchorSide = 'top' | 'right' | 'bottom' | 'left' | 'center';

export interface CanvasNode {
  id: string;
  type: CanvasShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fillColor: string;
  borderColor: string;
  borderStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  borderWidth: number;
  textColor: string;
  fontSize: number;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'center' | 'bottom';
  bold?: boolean;
  italic?: boolean;
  imageUrl?: string;
  groupId?: string | null;
  zIndex: number;
}

export interface CanvasConnector {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  fromAnchor: AnchorSide;
  toAnchor: AnchorSide;
  label?: string;
  color: string;
  style: 'solid' | 'dashed';
  lineType: 'straight' | 'curved' | 'orthogonal';
  roundness?: number;
  bendX?: number;
  bendY?: number;
  arrowStart?: boolean;
  arrowEnd: boolean;
}

export interface CanvasBoard {
  id: string;
  projectId: string;
  folderId: string | null;
  order?: number;
  title: string;
  nodes: CanvasNode[];
  connectors: CanvasConnector[];
  viewport: {
    x: number;
    y: number;
    zoom: number;
  };
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  id: string;
  speakerId: string; // e.g. 'speaker_1', 'speaker_2'
  startTimeSec: number;
  endTimeSec: number;
  text: string;
  language: 'he' | 'en' | 'mixed';
}

export interface MeetingTaskSuggestion {
  id: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  dueDate?: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdTaskId?: string;
}

export interface MeetingNote {
  id: string;
  projectId: string;
  folderId: string | null;
  order?: number;
  title: string;
  recordedAt: string;
  durationSec: number;
  captureMode: 'mic_only' | 'mic_and_system_audio'; // FR-6.1, FR-6.2
  transcriptionStatus: 'recording' | 'queued_offline' | 'transcribing' | 'completed' | 'error'; // FR-6.5
  transcriptionProvider: TranscriptionProviderId;
  speakerLabels: Record<string, string>; // FR-6.4: e.g., { speaker_1: 'Speaker 1', speaker_2: 'Speaker 2' }
  segments: TranscriptSegment[];
  userLiveNotes: string; // FR-6.9: User typed notes during meeting combined with transcript
  summary: string;       // FR-6.7
  keyPoints: string[];   // FR-6.7
  decisions: string[];   // FR-6.7
  taskSuggestions: MeetingTaskSuggestion[]; // FR-6.8
  audioDataUrl?: string;
  audioMimeType?: string;
  audioDeleted: boolean; // FR-6.6
  driveAudioFileId?: string;
  isDeleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSourceCitation {
  id: string;
  itemType: 'page' | 'task' | 'meeting' | 'file' | 'canvas' | 'email';
  itemId: string;
  projectId?: string;
  title: string;
  snippet: string;
  score?: number;
}

export interface AgentDiffBlockChange {
  blockId: string;
  changeType: 'modified' | 'added' | 'unchanged';
  beforeText: string;
  afterText: string;
  beforeBlock?: PageBlock;
  afterBlock?: PageBlock;
  accepted: boolean; // Allows partial acceptance (FR-7.9)
}

export interface AgentEditProposal {
  id: string;
  targetType: 'page' | 'task' | 'file';
  targetId: string;
  targetTitle: string;
  projectId: string;
  summaryOfChanges: string;
  createdAt: string;
  origin: 'chat' | 'routine';
  routineId?: string;
  status: 'pending' | 'accepted_all' | 'accepted_partial' | 'rejected';
  blockChanges: AgentDiffBlockChange[];
  beforeTaskState?: Partial<Task>;
  afterTaskState?: Partial<Task>;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  modelUsed?: string;
  citations?: AgentSourceCitation[];
  editProposalIds?: string[];
  createdItems?: Array<{
    type: 'task' | 'page' | 'file' | 'calendar_event' | 'move';
    id: string;
    title: string;
    projectId?: string;
  }>;
  deletionSuggestion?: {
    // FR-7.10: Agent can NEVER delete anything itself; only suggest deletion for user action
    itemType: 'task' | 'page' | 'file' | 'meeting' | 'canvas';
    itemId: string;
    itemTitle: string;
    reason: string;
    resolved?: boolean;
  };
}

export interface AgentConversation {
  id: string;
  title: string;
  scopeProjectId: string | null; // null = global across all non-excluded projects
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  googleEventId?: string;
  title: string;
  description?: string;
  startIso: string; // YYYY-MM-DDTHH:mm:ss or YYYY-MM-DD
  endIso: string;
  allDay?: boolean;
  location?: string;
  source: 'google_calendar' | 'memory_hub_task';
  linkedTaskId?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  snippet: string;
  bodyText: string;
  receivedAt: string;
  labels: string[];
  gmailWebUrl: string;
}

export interface Routine {
  id: string;
  name: string;
  instruction: string;
  targetProjectId: string;
  enabled: boolean;
  triggerType: 'schedule' | 'email_event' | 'both'; // FR-10.2
  scheduleTime: string; // HH:mm
  scheduleFrequency: 'daily' | 'weekdays' | 'weekly';
  emailFilterLabel?: string;
  emailFilterSender?: string;
  lastRunAt?: string;
  lastSlotClaimed?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineClaim {
  slotKey: string; // FR-10.4: e.g. "routine-1_2026-10-21_08:00"
  routineId: string;
  claimedByDeviceId: string;
  claimedByDeviceName: string;
  claimedAt: string;
}

export interface RoutineRunLog {
  id: string;
  routineId: string;
  routineName: string;
  scheduledFor: string;
  executedAt: string;
  wasLate: boolean; // FR-10.5
  lateByMinutes: number;
  deviceId: string; // FR-10.7
  deviceName: string;
  status: 'success' | 'skipped_already_claimed' | 'error';
  actionsSummary: string;
  createdTaskIds: string[];
  proposedEditIds: string[];
}

export interface FirestoreUsageStats {
  dateKey: string; // YYYY-MM-DD
  readsToday: number;
  writesToday: number;
  pendingBatchWrites: number;
  estimatedBytesUsed: number;
  readLimit: number;     // 50,000 / day on Spark free tier
  writeLimit: number;    // 20,000 / day on Spark free tier
  storageLimitBytes: number; // 1 GiB on Spark free tier
  lastSyncedAt?: string;
  syncState: 'offline' | 'synced' | 'syncing' | 'debouncing' | 'quota_paused';
}

export interface AppSettings {
  language: LanguageCode; // FR-14.1
  theme: ThemeMode;       // FR-14.3
  deviceId: string;
  deviceName: string;
  platform: 'windows' | 'android';
  selectedProvider: AIProviderId; // FR-7.1
  selectedModelId: string;
  transcriptionProvider: TranscriptionProviderId; // Open Decision #3
  semanticSearchEnabled: boolean; // FR-11.3
  apiKeys: {
    gemini: string;
    claude: string;
    openai: string;
    elevenlabs: string;
    groq?: string;
  };
  googleAccount: {
    connected: boolean;
    email: string;
    displayName: string;
    avatarUrl?: string;
    clientId: string;
    accessToken: string;
    tokenExpiresAt?: number;
    driveFolderId?: string;
    driveFolderName: string;
    scopes?: string[];
  };
  gmailAllowlist: {
    // FR-9.2: Strictly limit which labels and senders the app & agent may ever read
    allowedLabels: string[];
    allowedSenders: string[];
  };
  audioRetention: 'keep_forever' | '30_days' | '90_days' | 'delete_after_summary'; // Open Decision #8
  firebaseConfig: {
    enabled: boolean;
    projectId: string;
    apiKey: string;
    appId: string;
    authDomain?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    connected?: boolean;
    lastTestedAt?: string;
    syncMode?: 'realtime' | 'manual' | 'debounced';
  };
  windowsSettings: {
    // FR-13.1 - FR-13.3
    minimizeToTray: boolean;
    launchAtStartup: boolean;
    shortcutQuickTask: string;
    shortcutOpenAgent: string;
  };
  androidWidgetSettings: {
    // FR-12.1 - FR-12.7
    selectedTaskListIds: string[];
    widgetTheme: ThemeMode;
  };
}

export interface WorkspaceState {
  projects: Project[];
  subfolders: Subfolder[];
  taskLists: TaskList[];
  tags: TaskTag[];
  tasks: Task[];
  pages: PageDocument[];
  files: WorkspaceFile[];
  canvases: CanvasBoard[];
  meetings: MeetingNote[];
  conversations: AgentConversation[];
  editProposals: AgentEditProposal[];
  calendarEvents: CalendarEvent[];
  gmailMessages: GmailMessage[];
  routines: Routine[];
  routineClaims: RoutineClaim[];
  routineLogs: RoutineRunLog[];
  usageStats: FirestoreUsageStats;
  settings: AppSettings;
}
