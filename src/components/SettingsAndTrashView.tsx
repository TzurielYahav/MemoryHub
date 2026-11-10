import React, { useState } from 'react';
import {
  Settings,
  Trash2,
  RotateCcw,
  KeyRound,
  Database,
  Globe,
  Laptop,
  Mic,
  Cloud,
  CheckCircle2,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Folder,
  FolderCheck,
  Upload,
  Download,
  LogIn,
  LogOut,
  User,
  Mail,
  Calendar,
  HardDrive,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
  Code,
  FileText,
} from 'lucide-react';
import {
  AIProviderId,
  LanguageCode,
  ThemeMode,
  TranscriptionProviderId,
} from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { useTranslations } from '../i18n/translations';

function parsePastedFirebaseConfig(raw: string): {
  projectId?: string;
  apiKey?: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
} {
  const result: Record<string, string> = {};
  const pairs: Array<{ key: string; regex: RegExp }> = [
    { key: 'projectId', regex: /projectId:\s*["']([^"']+)["']/ },
    { key: 'apiKey', regex: /apiKey:\s*["']([^"']+)["']/ },
    { key: 'authDomain', regex: /authDomain:\s*["']([^"']+)["']/ },
    { key: 'storageBucket', regex: /storageBucket:\s*["']([^"']+)["']/ },
    { key: 'messagingSenderId', regex: /messagingSenderId:\s*["']([^"']+)["']/ },
    { key: 'appId', regex: /appId:\s*["']([^"']+)["']/ },
  ];

  for (const pair of pairs) {
    const match = raw.match(pair.regex);
    if (match && match[1]) {
      result[pair.key] = match[1].trim();
    }
  }

  if (Object.keys(result).length === 0) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.projectId) result.projectId = parsed.projectId;
        if (parsed.apiKey) result.apiKey = parsed.apiKey;
        if (parsed.authDomain) result.authDomain = parsed.authDomain;
        if (parsed.storageBucket) result.storageBucket = parsed.storageBucket;
        if (parsed.messagingSenderId) result.messagingSenderId = parsed.messagingSenderId;
        if (parsed.appId) result.appId = parsed.appId;
      }
    } catch {
      // Ignore
    }
  }

  return result;
}

interface SettingsAndTrashViewProps {
  mode: 'settings' | 'trash';
}

export const SettingsAndTrashView: React.FC<SettingsAndTrashViewProps> = ({ mode }) => {
  const {
    state,
    updateSettings,
    restoreTrashItem,
    permanentlyPurgeTrashItem,
    signInWithGoogle,
    signOutGoogle,
    testGoogleDrive,
    syncDriveFiles,
    testFirestore,
    pushWorkspaceToFirestore,
    pullWorkspaceFromFirestore,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  // --- Google & Firebase Action States ---
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [googleSignInError, setGoogleSignInError] = useState<string | null>(null);
  const [showGoogleHelp, setShowGoogleHelp] = useState(false);
  const [manualTokenInput, setManualTokenInput] = useState('');

  const [isTestingDrive, setIsTestingDrive] = useState(false);
  const [driveTestStatus, setDriveTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncingDrive, setIsSyncingDrive] = useState(false);
  const [driveSyncReport, setDriveSyncReport] = useState<string | null>(null);

  const [isTestingFirestore, setIsTestingFirestore] = useState(false);
  const [firestoreTestStatus, setFirestoreTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isPushingFirestore, setIsPushingFirestore] = useState(false);
  const [isPullingFirestore, setIsPullingFirestore] = useState(false);
  const [firestoreSyncReport, setFirestoreSyncReport] = useState<string | null>(null);

  const [showConfigPasteModal, setShowConfigPasteModal] = useState(false);
  const [rawPastedConfig, setRawPastedConfig] = useState('');

  // ============================================================================
  // TRASH & RESTORE VIEW (FR-1.7)
  // ============================================================================
  if (mode === 'trash') {
    const deletedItems: Array<{
      type: 'project' | 'subfolder' | 'task' | 'page' | 'file' | 'canvas' | 'meeting';
      id: string;
      title: string;
      deletedAt?: string;
    }> = [
      ...state.projects
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'project' as const, id: x.id, title: x.name, deletedAt: x.deletedAt })),
      ...state.subfolders
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'subfolder' as const, id: x.id, title: x.name, deletedAt: x.deletedAt })),
      ...state.tasks
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'task' as const, id: x.id, title: x.title, deletedAt: x.deletedAt })),
      ...state.pages
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'page' as const, id: x.id, title: x.title, deletedAt: x.deletedAt })),
      ...state.files
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'file' as const, id: x.id, title: x.name, deletedAt: x.deletedAt })),
      ...state.canvases
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'canvas' as const, id: x.id, title: x.title, deletedAt: x.deletedAt })),
      ...state.meetings
        .filter((x) => x.isDeleted)
        .map((x) => ({ type: 'meeting' as const, id: x.id, title: x.title, deletedAt: x.deletedAt })),
    ];

    return (
      <div className="space-y-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-rose-600" />
            {t.nav.trash} — Soft-Deleted Items & Recovery (FR-1.7)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Deleted projects, folders, tasks, pages, files, canvases, and meetings are safely held here so nothing is lost accidentally.
          </p>
        </div>

        {deletedItems.length === 0 ? (
          <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-slate-400 text-sm">
            Trash is empty.
          </div>
        ) : (
          <div className="space-y-2">
            {deletedItems.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {item.type}
                    </span>
                    <span className="font-semibold text-sm text-slate-900 dark:text-white">
                      {item.title}
                    </span>
                  </div>
                  {item.deletedAt && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Deleted at {new Date(item.deletedAt).toLocaleString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => restoreTrashItem(item.type, item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Restore Item
                  </button>
                  <button
                    onClick={() => permanentlyPurgeTrashItem(item.type, item.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 text-xs font-medium transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Purge Forever
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // SETTINGS VIEW (FR-14.1 - FR-14.4, FR-13.1 - FR-13.3, Section 6.4)
  // ============================================================================
  const { settings, usageStats } = state;
  const readPct = Math.min(100, (usageStats.readsToday / usageStats.readLimit) * 100);
  const writePct = Math.min(100, (usageStats.writesToday / usageStats.writeLimit) * 100);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          {t.nav.settings} — Localization, AI Providers, Cloud Sync & Native Bridges
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          All API keys and tokens are stored locally on your device (Windows DPAPI / Android EncryptedSharedPreferences / Local Vault — FR-14.4) and are never written to shared cloud documents.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Language (RTL/LTR) & Theme (FR-14.1, FR-14.3) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
            <Globe className="w-4 h-4 text-indigo-600" />
            Language (RTL / LTR) & Theme (FR-14.1–FR-14.3)
          </h3>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">
              Interface Language & Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['en', 'he'] as LanguageCode[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => updateSettings({ language: lang })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                    settings.language === lang
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {lang === 'he' ? '🇮🇱 עברית (RTL מלא)' : '🇺🇸 English (LTR)'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-500">
              Appearance Theme (FR-14.3)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['light', 'dark', 'system'] as ThemeMode[]).map((th) => (
                <button
                  key={th}
                  onClick={() => updateSettings({ theme: th })}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold capitalize border transition ${
                    settings.theme === th
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {th}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Firestore Spark Free-Tier Quota Monitor (Section 6.4) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
              <Database className="w-4 h-4 text-emerald-600" />
              {t.sync.firestoreQuota} (Section 6.4)
            </h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Spark $0 Free Tier
            </span>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-500">Daily Document Reads (Local Cache First)</span>
                <span className="font-mono font-semibold">
                  {usageStats.readsToday.toLocaleString()} / {usageStats.readLimit.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.max(2, readPct)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="text-slate-500">Daily Batched Writes (2.5s Debounced)</span>
                <span className="font-mono font-semibold">
                  {usageStats.writesToday.toLocaleString()} / {usageStats.writeLimit.toLocaleString()}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.max(2, writePct)}%` }}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500">
              <span>
                Metadata Size: {(usageStats.estimatedBytesUsed / 1024).toFixed(1)} KB / 1 GiB
              </span>
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" /> Heavy media offloaded to Google Drive
              </span>
            </div>
          </div>
        </div>

        {/* 3. AI Provider Keys & Transcription Engine (FR-7.1, FR-14.4, Open Decision #3) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            AI Provider API Keys (Local Device Vault — FR-14.4)
          </h3>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">Google Gemini API Key</label>
              <input
                type="password"
                value={settings.apiKeys.gemini}
                onChange={(e) =>
                  updateSettings({
                    apiKeys: { ...settings.apiKeys, gemini: e.target.value },
                  })
                }
                placeholder="AIzaSy... (Used for Gemini 2.5 Pro/Flash & Bilingual Audio)"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-slate-500">Groq API Key (Free Whisper Large v3)</label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5"
                >
                  Free Key ↗
                </a>
              </div>
              <input
                type="password"
                value={settings.apiKeys.groq || ''}
                onChange={(e) =>
                  updateSettings({
                    apiKeys: { ...settings.apiKeys, groq: e.target.value },
                  })
                }
                placeholder="gsk_... (Free ultra-fast Whisper Large v3 for Hebrew + English meetings)"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">Anthropic Claude API Key</label>
              <input
                type="password"
                value={settings.apiKeys.claude}
                onChange={(e) =>
                  updateSettings({
                    apiKeys: { ...settings.apiKeys, claude: e.target.value },
                  })
                }
                placeholder="sk-ant-... (Optional — for Claude 3.7 Sonnet)"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-500 mb-1">OpenAI API Key</label>
              <input
                type="password"
                value={settings.apiKeys.openai}
                onChange={(e) =>
                  updateSettings({
                    apiKeys: { ...settings.apiKeys, openai: e.target.value },
                  })
                }
                placeholder="sk-... (Optional — for GPT-4o & Whisper)"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>
        </div>

        {/* 4. Meeting Transcription & Audio Retention (FR-6.3, FR-6.4, Open Decision #3 & #8) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
            <Mic className="w-4 h-4 text-rose-600" />
            Meeting Transcription & Speaker Diarization (FR-6.3–FR-6.6)
          </h3>

          <div className="space-y-2.5 text-xs">
            <div>
              <label className="block text-slate-500 mb-1">
                Default Transcription & Diarization Engine
              </label>
              <select
                value={settings.transcriptionProvider}
                onChange={(e) =>
                  updateSettings({
                    transcriptionProvider: e.target.value as TranscriptionProviderId,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="groq_whisper">
                  Groq Whisper Large v3 (Free, Ultra-Fast Hebrew + English Acoustic ASR)
                </option>
                <option value="gemini_audio">
                  Gemini Native Multimodal Audio (Hebrew/English + Speaker Diarization)
                </option>
                <option value="openai_whisper">OpenAI Whisper + Diarization</option>
                <option value="elevenlabs_scribe">ElevenLabs Scribe v1 (Speaker Separation)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-500 mb-1">
                Meeting Raw Audio Retention Policy (FR-6.6)
              </label>
              <select
                value={settings.audioRetention}
                onChange={(e) =>
                  updateSettings({
                    audioRetention: e.target.value as any,
                  })
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                <option value="keep_forever">Keep Raw Audio Until Manually Deleted</option>
                <option value="30_days">Auto-Delete Raw Audio After 30 Days (Keep Transcript)</option>
                <option value="90_days">Auto-Delete Raw Audio After 90 Days (Keep Transcript)</option>
                <option value="delete_after_summary">
                  Auto-Delete Raw Audio Immediately After Summary
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* 5. Google Account & Google Workspace (Google Sign-In, Drive, Calendar, Gmail) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                Google Sign-In & Google Workspace Integration (PRD Section 6.2)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Single Google Account powers cross-device file & audio storage (Google Drive), two-way tasks (Calendar), and allowed read-only emails (Gmail).
              </p>
            </div>
            {settings.googleAccount.connected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Google Account Connected
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-3.5 h-3.5" />
                Not Signed In (Local Cache Only)
              </span>
            )}
          </div>

          {/* Account Profile Card & Sign-In Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Account Status
                </span>
                {settings.googleAccount.connected ? (
                  <div className="flex items-center gap-3">
                    {settings.googleAccount.avatarUrl ? (
                      <img
                        src={settings.googleAccount.avatarUrl}
                        alt="Google Avatar"
                        className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow">
                        {settings.googleAccount.displayName ? settings.googleAccount.displayName[0].toUpperCase() : 'G'}
                      </div>
                    )}
                    <div className="overflow-hidden">
                      <p className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                        {settings.googleAccount.displayName || 'Google User'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono truncate">
                        {settings.googleAccount.email}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    Sign in to connect Google Drive, Calendar, and Gmail to this workspace.
                  </div>
                )}
              </div>

              {settings.googleAccount.connected ? (
                <button
                  onClick={signOutGoogle}
                  className="w-full py-1.5 px-3 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                >
                  <LogOut className="w-3.5 h-3.5" /> Disconnect Google Account
                </button>
              ) : (
                <button
                  disabled={isSigningInGoogle}
                  onClick={async () => {
                    setIsSigningInGoogle(true);
                    setGoogleSignInError(null);
                    const res = await signInWithGoogle();
                    setIsSigningInGoogle(false);
                    if (!res.success) {
                      setGoogleSignInError(res.error || 'Google Sign-In failed.');
                    }
                  }}
                  className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-sm transition disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4" />
                  {isSigningInGoogle ? 'Signing in with Google...' : 'Sign in with Google'}
                </button>
              )}
            </div>

            {/* Google Drive Dedicated Folder & File Sync */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Folder className="w-3.5 h-3.5 text-indigo-500" /> Google Drive Dedicated Folder
                </span>
                <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-mono">
                  {settings.googleAccount.driveFolderId ? 'Folder Linked' : 'Auto-Created'}
                </span>
              </div>

              <div>
                <label className="text-[11px] text-slate-500 block mb-1">
                  Target Drive Folder Name (PRD Section 5.4 & 6.2)
                </label>
                <input
                  type="text"
                  value={settings.googleAccount.driveFolderName}
                  onChange={(e) =>
                    updateSettings({
                      googleAccount: {
                        ...settings.googleAccount,
                        driveFolderName: e.target.value,
                      },
                    })
                  }
                  placeholder="MemoryHub"
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  disabled={isTestingDrive || !settings.googleAccount.connected}
                  onClick={async () => {
                    setIsTestingDrive(true);
                    setDriveTestStatus(null);
                    const res = await testGoogleDrive();
                    setIsTestingDrive(false);
                    setDriveTestStatus({
                      success: res.success,
                      message: res.success
                        ? `Connected! Folder ID: ${res.folderId} (${res.fileCount ?? 0} files found in Drive)`
                        : res.error || 'Connection failed',
                    });
                  }}
                  className="flex-1 py-1 px-2 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-center gap-1 transition disabled:opacity-40"
                >
                  <RefreshCw className={`w-3 h-3 ${isTestingDrive ? 'animate-spin' : ''}`} />
                  Test Drive Folder
                </button>
                <button
                  disabled={isSyncingDrive || !settings.googleAccount.connected}
                  onClick={async () => {
                    setIsSyncingDrive(true);
                    setDriveSyncReport(null);
                    const res = await syncDriveFiles();
                    setIsSyncingDrive(false);
                    setDriveSyncReport(
                      `Uploaded ${res.uploaded} files, downloaded ${res.downloaded} files across devices.` +
                        (res.errors.length > 0 ? ` (${res.errors.length} skipped)` : '')
                    );
                  }}
                  className="flex-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1 transition disabled:opacity-40"
                >
                  <Upload className={`w-3 h-3 ${isSyncingDrive ? 'animate-spin' : ''}`} />
                  Sync Drive Files
                </button>
              </div>

              {driveTestStatus && (
                <p
                  className={`text-[11px] ${
                    driveTestStatus.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                  }`}
                >
                  {driveTestStatus.message}
                </p>
              )}
              {driveSyncReport && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400">{driveSyncReport}</p>
              )}
            </div>

            {/* Google Calendar & Gmail Quick Status */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                Connected Google Capabilities
              </span>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Google Calendar (FR-8.1–FR-8.4)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    2-Way Synced
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-rose-500" />
                    <span>Gmail Read-Only (FR-9.1–FR-9.4)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Allowlist Filtered
                  </span>
                </div>

                <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-3.5 h-3.5 text-blue-500" />
                    <span>Meeting Audio Offload (FR-6.6)</span>
                  </div>
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Drive /MemoryHub
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Google OAuth Client ID Configuration & Manual Token */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Google OAuth 2.0 Web Client ID
              </label>
              <button
                type="button"
                onClick={() => setShowGoogleHelp(!showGoogleHelp)}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {showGoogleHelp ? 'Hide Setup Guide' : 'How to get a Client ID (2 min)'}
              </button>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={settings.googleAccount.clientId}
                onChange={(e) =>
                  updateSettings({
                    googleAccount: {
                      ...settings.googleAccount,
                      clientId: e.target.value,
                    },
                  })
                }
                placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
              />
            </div>

            {googleSignInError && (
              <p className="text-xs text-rose-500 bg-rose-50 dark:bg-rose-950/40 p-2 rounded-lg border border-rose-200 dark:border-rose-900">
                {googleSignInError}
              </p>
            )}

            {showGoogleHelp && (
              <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-xs text-indigo-950 dark:text-indigo-200 space-y-2">
                <p className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Quick Google Cloud Setup for Personal Workspace:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px] leading-relaxed">
                  <li>
                    Open{' '}
                    <a
                      href="https://console.cloud.google.com/apis/credentials"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-semibold"
                    >
                      Google Cloud Console Credentials ↗
                    </a>
                  </li>
                  <li>Click <b>Create Credentials</b> &gt; <b>OAuth client ID</b> &gt; Application type: <b>Web application</b>.</li>
                  <li>
                    Under <b>Authorized JavaScript origins</b>, add: <code className="bg-white/60 dark:bg-black/30 px-1 py-0.5 rounded">http://localhost:5173</code> (and your production domain).
                  </li>
                  <li>Copy the Client ID and paste it above, then click <b>Sign in with Google</b>.</li>
                </ol>
              </div>
            )}

            {/* Direct Access Token for testing or offline dev */}
            <div className="pt-2">
              <details className="text-xs text-slate-500">
                <summary className="cursor-pointer hover:text-slate-800 dark:hover:text-slate-200 text-[11px]">
                  Manual Access Token (Developer Mode / Direct Token)
                </summary>
                <div className="flex gap-2 mt-2">
                  <input
                    type="password"
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                    placeholder="ya29.a0A... (Paste OAuth access token directly)"
                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                  />
                  <button
                    onClick={() => {
                      if (manualTokenInput.trim()) {
                        updateSettings({
                          googleAccount: {
                            ...settings.googleAccount,
                            connected: true,
                            accessToken: manualTokenInput.trim(),
                            displayName: settings.googleAccount.displayName || 'Authorized User',
                            email: settings.googleAccount.email || 'user@google.com',
                          },
                        });
                        setManualTokenInput('');
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-xs font-semibold hover:bg-slate-300"
                  >
                    Apply Token
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>

        {/* 6. Firebase Firestore Database & Spark Free-Tier Sync Engine */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
                <Cloud className="w-4 h-4 text-indigo-600" />
                Firebase Firestore Multi-Device Sync (Spark $0 Free Tier — PRD Section 6.1, 6.4)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Structured workspace data (projects, tasks, pages, subfolders, canvases, meetings) syncs across Windows and Android devices using Firestore with local IndexedDB offline cache.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowConfigPasteModal(!showConfigPasteModal)}
                className="py-1 px-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Code className="w-3.5 h-3.5" />
                {showConfigPasteModal ? 'Hide Config Paste' : 'Quick Paste Firebase Config'}
              </button>
              <label className="flex items-center gap-2 cursor-pointer bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  checked={settings.firebaseConfig.enabled}
                  onChange={(e) =>
                    updateSettings({
                      firebaseConfig: {
                        ...settings.firebaseConfig,
                        enabled: e.target.checked,
                      },
                    })
                  }
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Enable Firestore Cloud Sync
                </span>
              </label>
            </div>
          </div>

          {/* Quick Paste Firebase Config Helper Box */}
          {showConfigPasteModal && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-indigo-200 dark:border-indigo-900 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Paste Firebase Console Web App Config Snippet
                </span>
                <span className="text-[11px] text-slate-400">
                  Copy from Firebase Console &gt; Project Settings &gt; General &gt; Your Apps
                </span>
              </div>
              <textarea
                rows={4}
                value={rawPastedConfig}
                onChange={(e) => setRawPastedConfig(e.target.value)}
                placeholder={'const firebaseConfig = {\n  apiKey: "AIzaSy...",\n  projectId: "memory-hub-personal",\n  appId: "1:..."\n};'}
                className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const parsed = parsePastedFirebaseConfig(rawPastedConfig);
                    if (parsed.projectId || parsed.apiKey) {
                      updateSettings({
                        firebaseConfig: {
                          ...settings.firebaseConfig,
                          enabled: true,
                          projectId: parsed.projectId || settings.firebaseConfig.projectId,
                          apiKey: parsed.apiKey || settings.firebaseConfig.apiKey,
                          appId: parsed.appId || settings.firebaseConfig.appId,
                          authDomain: parsed.authDomain || settings.firebaseConfig.authDomain,
                          storageBucket: parsed.storageBucket || settings.firebaseConfig.storageBucket,
                          messagingSenderId: parsed.messagingSenderId || settings.firebaseConfig.messagingSenderId,
                        },
                      });
                      setShowConfigPasteModal(false);
                      setRawPastedConfig('');
                    }
                  }}
                  className="py-1.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" /> Parse & Apply Configuration
                </button>
              </div>
            </div>
          )}

          {/* Configuration Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-slate-500 mb-1 font-semibold">Firebase Project ID *</label>
              <input
                type="text"
                value={settings.firebaseConfig.projectId}
                onChange={(e) =>
                  updateSettings({
                    firebaseConfig: {
                      ...settings.firebaseConfig,
                      projectId: e.target.value,
                    },
                  })
                }
                placeholder="memory-hub-personal"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1 font-semibold">Firebase Web API Key *</label>
              <input
                type="password"
                value={settings.firebaseConfig.apiKey}
                onChange={(e) =>
                  updateSettings({
                    firebaseConfig: {
                      ...settings.firebaseConfig,
                      apiKey: e.target.value,
                    },
                  })
                }
                placeholder="AIzaSy..."
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Firebase App ID</label>
              <input
                type="text"
                value={settings.firebaseConfig.appId}
                onChange={(e) =>
                  updateSettings({
                    firebaseConfig: {
                      ...settings.firebaseConfig,
                      appId: e.target.value,
                    },
                  })
                }
                placeholder="1:123456789:web:abcdef"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>

            <div>
              <label className="block text-slate-500 mb-1">Auth Domain (optional)</label>
              <input
                type="text"
                value={settings.firebaseConfig.authDomain || ''}
                onChange={(e) =>
                  updateSettings({
                    firebaseConfig: {
                      ...settings.firebaseConfig,
                      authDomain: e.target.value,
                    },
                  })
                }
                placeholder="project-id.firebaseapp.com"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-mono"
              />
            </div>
          </div>

          {/* Sync Mode & Operations */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                disabled={isTestingFirestore || !settings.firebaseConfig.projectId}
                onClick={async () => {
                  setIsTestingFirestore(true);
                  setFirestoreTestStatus(null);
                  const res = await testFirestore();
                  setIsTestingFirestore(false);
                  setFirestoreTestStatus({
                    success: res.success,
                    message: res.success
                      ? `Firestore Connected! Ping latency: ${res.latencyMs}ms`
                      : res.error || 'Connection failed.',
                  });
                }}
                className="py-1.5 px-3 rounded-xl border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isTestingFirestore ? 'animate-spin' : ''}`} />
                Test Firestore Connection
              </button>

              <button
                disabled={isPushingFirestore || !settings.firebaseConfig.projectId}
                onClick={async () => {
                  setIsPushingFirestore(true);
                  setFirestoreSyncReport(null);
                  const res = await pushWorkspaceToFirestore();
                  setIsPushingFirestore(false);
                  setFirestoreSyncReport(
                    res.success
                      ? `Successfully pushed full workspace to Firestore (${res.writesCount} documents written).`
                      : `Push failed: ${res.error}`
                  );
                }}
                className="py-1.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <Upload className={`w-3.5 h-3.5 ${isPushingFirestore ? 'animate-spin' : ''}`} />
                Push Local Data to Firestore
              </button>

              <button
                disabled={isPullingFirestore || !settings.firebaseConfig.projectId}
                onClick={async () => {
                  setIsPullingFirestore(true);
                  setFirestoreSyncReport(null);
                  const res = await pullWorkspaceFromFirestore();
                  setIsPullingFirestore(false);
                  setFirestoreSyncReport(
                    res.success
                      ? `Successfully pulled cloud workspace (${res.readsCount} documents read & merged).`
                      : `Pull failed: ${res.error}`
                  );
                }}
                className="py-1.5 px-3 rounded-xl border border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-40"
              >
                <Download className={`w-3.5 h-3.5 ${isPullingFirestore ? 'animate-spin' : ''}`} />
                Pull Cloud Data from Firestore
              </button>
            </div>

            <div className="text-[11px] text-slate-400 font-mono">
              Debounced 2.5s batching &bull; Last sync: {usageStats.lastSyncedAt ? new Date(usageStats.lastSyncedAt).toLocaleTimeString() : 'Never'}
            </div>
          </div>

          {firestoreTestStatus && (
            <p
              className={`text-xs p-2 rounded-lg border ${
                firestoreTestStatus.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
              }`}
            >
              {firestoreTestStatus.message}
            </p>
          )}

          {firestoreSyncReport && (
            <p className="text-xs p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300">
              {firestoreSyncReport}
            </p>
          )}
        </div>

        {/* 7. Windows Desktop Tray & Global Shortcuts (FR-13.1 - FR-13.3) */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="font-bold text-sm flex items-center gap-2 text-slate-900 dark:text-white">
            <Laptop className="w-4 h-4 text-indigo-600" />
            Windows System Tray & Global Shortcuts (FR-13.1–FR-13.3)
          </h3>

          <div className="space-y-2.5 text-xs">
            <label className="flex items-center justify-between cursor-pointer">
              <span>Minimize to Windows System Tray on Close (FR-13.1)</span>
              <input
                type="checkbox"
                checked={settings.windowsSettings.minimizeToTray}
                onChange={(e) =>
                  updateSettings({
                    windowsSettings: {
                      ...settings.windowsSettings,
                      minimizeToTray: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>
            <label className="flex items-center justify-between cursor-pointer">
              <span>Launch Memory Hub at Windows Startup (FR-13.3)</span>
              <input
                type="checkbox"
                checked={settings.windowsSettings.launchAtStartup}
                onChange={(e) =>
                  updateSettings({
                    windowsSettings: {
                      ...settings.windowsSettings,
                      launchAtStartup: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 rounded text-indigo-600"
              />
            </label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-400">Quick-Add Task Hotkey</span>
                <span className="font-mono font-bold">
                  {settings.windowsSettings.shortcutQuickTask}
                </span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="block text-[10px] text-slate-400">Open AI Agent Hotkey</span>
                <span className="font-mono font-bold">
                  {settings.windowsSettings.shortcutOpenAgent}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
