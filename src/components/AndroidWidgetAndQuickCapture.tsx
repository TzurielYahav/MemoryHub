import React, { useState, useMemo } from 'react';
import {
  Smartphone,
  Plus,
  Mic,
  MessageSquare,
  Check,
  Sparkles,
  X,
  Volume2,
  Send,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';

export const AndroidWidgetPreviewView: React.FC = () => {
  const {
    state,
    toggleTaskCompletion,
    toggleTaskListWidgetVisibility,
    setQuickCaptureMode,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  const visibleListIds = useMemo(
    () => state.taskLists.filter((l) => l.showInAndroidWidget).map((l) => l.id),
    [state.taskLists]
  );

  const widgetTasks = useMemo(
    () =>
      state.tasks.filter(
        (tk) =>
          !tk.isDeleted &&
          !tk.completed &&
          (visibleListIds.length === 0 || visibleListIds.includes(tk.taskListId))
      ),
    [state.tasks, visibleListIds]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left: Widget Configuration & Native Bridge Details */}
      <div className="lg:col-span-6 space-y-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-2xs">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-600" />
            Android Home-Screen Widget & Quick-Entry (FR-12.1–FR-12.7)
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            The native Android <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">MemoryHubTaskWidgetProvider.kt</code> reads your selected task lists from shared offline storage. You can check off tasks directly on your Android home screen, or tap the quick-action buttons to open the lightweight overlay for adding a task or speaking to the AI Agent (ChatGPT-style).
          </p>

          <div className="pt-2 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Select Task Lists to Display in Widget (FR-12.1)
            </h3>
            {state.taskLists.map((list) => {
              const proj = state.projects.find((p) => p.id === list.projectId);
              return (
                <label
                  key={list.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {list.name}
                    </p>
                    <p className="text-xs text-slate-500">
                      Project: {proj ? `${proj.icon} ${proj.name}` : list.projectId}
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={list.showInAndroidWidget}
                    onChange={() => toggleTaskListWidgetVisibility(list.id)}
                    className="w-4 h-4 rounded text-indigo-600"
                  />
                </label>
              );
            })}
          </div>
        </div>

        {/* Test Quick-Entry Overlays Directly */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Test Widget Quick-Entry Overlays (FR-12.3, FR-12.5, FR-12.6)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              onClick={() => setQuickCaptureMode('task')}
              className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex flex-col items-center gap-1.5 hover:bg-indigo-100 transition"
            >
              <Plus className="w-5 h-5" />
              <span>Quick Add Task</span>
            </button>
            <button
              onClick={() => setQuickCaptureMode('text-agent')}
              className="p-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50/70 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 text-xs font-semibold flex flex-col items-center gap-1.5 hover:bg-violet-100 transition"
            >
              <MessageSquare className="w-5 h-5" />
              <span>Quick Text to Agent</span>
            </button>
            <button
              onClick={() => setQuickCaptureMode('voice-agent')}
              className="p-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-semibold flex flex-col items-center gap-1.5 hover:bg-rose-100 transition"
            >
              <Mic className="w-5 h-5" />
              <span>Instant Voice Mode</span>
            </button>
          </div>
        </div>
      </div>

      {/* Right: Interactive Live Android Home Screen Widget Simulator */}
      <div className="lg:col-span-6 flex justify-center">
        <div className="w-full max-w-sm rounded-[38px] p-4 bg-gradient-to-b from-slate-800 via-slate-900 to-black border-4 border-slate-700 shadow-2xl text-white space-y-4">
          {/* Android Status Bar */}
          <div className="flex items-center justify-between px-3 pt-1 text-[11px] text-slate-300 font-mono">
            <span>09:41</span>
            <div className="w-16 h-4 rounded-full bg-black" />
            <span>5G • 98%</span>
          </div>

          {/* Home Screen Widget Card (FR-12.1 - FR-12.7) */}
          <div className="rounded-3xl bg-slate-900/95 border border-slate-700/80 p-4 shadow-lg space-y-3">
            {/* Widget Top Bar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-xs">
                  M
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white leading-tight">
                    Memory Hub Tasks
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    {widgetTasks.length} pending • Offline Synced
                  </p>
                </div>
              </div>

              {/* Widget Quick Action Buttons (FR-12.3, FR-12.5, FR-12.6) */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setQuickCaptureMode('task')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-indigo-600 text-white transition"
                  title="FR-12.3: Quick Add Task"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setQuickCaptureMode('text-agent')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-violet-600 text-white transition"
                  title="FR-12.5: Quick Text to Agent"
                >
                  <MessageSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setQuickCaptureMode('voice-agent')}
                  className="p-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition shadow-sm"
                  title="FR-12.6: Instant Voice to Agent (ChatGPT-Style)"
                >
                  <Mic className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Widget Checklist Items (FR-12.2: Directly check off from widget) */}
            <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {widgetTasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  All tasks completed! Tap + to add a task.
                </div>
              ) : (
                widgetTasks.map((tk) => (
                  <div
                    key={tk.id}
                    onClick={() => toggleTaskCompletion(tk.id)}
                    className="flex items-center justify-between gap-2.5 p-2.5 rounded-2xl bg-slate-800/90 hover:bg-slate-800 border border-slate-700/60 cursor-pointer group transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-4 h-4 rounded-md border-2 border-indigo-400 group-hover:bg-indigo-600 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 opacity-0 group-hover:opacity-100 text-white" />
                      </div>
                      <span
                        dir={detectTextDirection(tk.title)}
                        className="text-xs font-medium text-slate-100 truncate"
                      >
                        {tk.title}
                      </span>
                    </div>

                    {tk.dueDate && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 shrink-0">
                        {tk.dueDate.slice(5)}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <p className="text-center text-[11px] text-slate-400 px-3 pb-2">
            Interactive Android Home-Screen Widget Preview — click any checkbox or action button above!
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// QUICK CAPTURE & INSTANT VOICE MODAL (FR-12.3, FR-12.5, FR-12.6 & FR-13.2)
// ============================================================================
export const QuickCaptureModal: React.FC = () => {
  const {
    state,
    quickCaptureMode,
    setQuickCaptureMode,
    createTask,
    sendAgentPrompt,
    setActiveNav,
  } = useWorkspace();

  const [taskTitle, setTaskTitle] = useState('');
  const [taskProjectId, setTaskProjectId] = useState(
    state.projects.find((p) => !p.isDeleted)?.id || 'proj-product-2026'
  );
  const [taskDueDate, setTaskDueDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [agentText, setAgentText] = useState('');
  const [voiceActive, setVoiceActive] = useState(true);
  const [voiceReply, setVoiceReply] = useState<string | null>(null);

  if (quickCaptureMode === 'none') return null;

  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    createTask({
      projectId: taskProjectId,
      title: taskTitle.trim(),
      dueDate: taskDueDate,
      priority: 'medium',
    });
    setTaskTitle('');
    setQuickCaptureMode('none');
  };

  const handleQuickAgentSend = async (promptToUse: string) => {
    const clean = promptToUse.trim();
    if (!clean) return;
    const convId = state.conversations[0]?.id || 'conv-main';
    await sendAgentPrompt(clean, convId, null);
    if (quickCaptureMode === 'voice-agent') {
      setVoiceReply(
        'בוצע! עיבדתי את הבקשה שלך מול בסיס הידע ושמרתי את התשובה בצ׳אט הסוכן. / Done! Processed against your workspace.'
      );
    } else {
      setAgentText('');
      setQuickCaptureMode('none');
      setActiveNav('agent');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-4 h-4" />
            {quickCaptureMode === 'task'
              ? 'Quick Add Task (Widget / Ctrl+Shift+Space)'
              : quickCaptureMode === 'voice-agent'
              ? 'Instant Voice to Agent (FR-12.6)'
              : 'Quick Text to Agent (FR-12.5)'}
          </span>
          <button
            onClick={() => {
              setVoiceReply(null);
              setQuickCaptureMode('none');
            }}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {quickCaptureMode === 'task' && (
          <form onSubmit={handleQuickAddTask} className="space-y-3">
            <input
              type="text"
              autoFocus
              dir={detectTextDirection(taskTitle)}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="What needs to be done? / מה צריך לבצע?"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              >
                {state.projects
                  .filter((p) => !p.isDeleted)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
              </select>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
            >
              Save Task Immediately
            </button>
          </form>
        )}

        {quickCaptureMode === 'text-agent' && (
          <div className="space-y-3">
            <textarea
              autoFocus
              dir={detectTextDirection(agentText)}
              value={agentText}
              onChange={(e) => setAgentText(e.target.value)}
              rows={3}
              placeholder="Ask the AI Agent or give an instruction (Hebrew or English)..."
              className="w-full p-3 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <button
              onClick={() => handleQuickAgentSend(agentText)}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" /> Send to Agent
            </button>
          </div>
        )}

        {quickCaptureMode === 'voice-agent' && (
          <div className="py-4 text-center space-y-4">
            <div className="relative mx-auto w-20 h-20 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-lg">
              {voiceActive && (
                <span className="absolute inset-0 rounded-full bg-rose-500 animate-ping opacity-40" />
              )}
              <Mic className="w-8 h-8 relative z-10" />
            </div>

            <div>
              <p className="font-bold text-base text-slate-900 dark:text-white">
                {voiceActive
                  ? 'Listening (Hebrew & English)...'
                  : 'Voice Command Captured'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Speak naturally or tap a sample voice command below:
              </p>
            </div>

            <div className="space-y-2">
              {[
                'תוסיף משימה חדשה למחר בבוקר לעבור על סיכום הפגישה',
                'Summarize what we decided in our bilingual sync meeting',
              ].map((cmd, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setVoiceActive(false);
                    handleQuickAgentSend(cmd);
                  }}
                  dir={detectTextDirection(cmd)}
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 font-medium"
                >
                  🎙️ "{cmd}"
                </button>
              ))}
            </div>

            {voiceReply && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                <Volume2 className="w-4 h-4 shrink-0" />
                <span>{voiceReply}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
