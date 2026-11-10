import React, { useState, useMemo } from 'react';
import {
  Calendar as CalendarIcon,
  Mail,
  ShieldCheck,
  Plus,
  Play,
  Clock,
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Lock,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';
import { isEmailAllowedByPolicy } from '../services/searchEngine';

interface CalendarAndIntegrationsViewProps {
  section: 'calendar' | 'gmail' | 'routines';
}

export const CalendarAndIntegrationsView: React.FC<CalendarAndIntegrationsViewProps> = ({
  section,
}) => {
  const {
    state,
    createTask,
    toggleTaskCompletion,
    extractTaskFromGmailMessage,
    createRoutine,
    updateRoutine,
    deleteRoutine,
    executeRoutineNow,
    updateSettings,
    navigateToItem,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  // --- Calendar State ---
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newQuickTaskTitle, setNewQuickTaskTitle] = useState('');
  const [syncNewToGcal, setSyncNewToGcal] = useState(true);

  // --- Gmail Filter State ---
  const [newAllowedLabel, setNewAllowedLabel] = useState('');
  const [newAllowedSender, setNewAllowedSender] = useState('');
  const [targetExtractProjectId, setTargetExtractProjectId] = useState<string>(
    state.projects.find((p) => !p.isDeleted)?.id || 'proj-product-2026'
  );

  // --- Routines State ---
  const [showNewRoutineModal, setShowNewRoutineModal] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [routineInstruction, setRoutineInstruction] = useState('');
  const [routineTime, setRoutineTime] = useState('08:30');
  const [routineTrigger, setRoutineTrigger] = useState<'schedule' | 'email_event' | 'both'>(
    'schedule'
  );
  const [routineProjectId, setRoutineProjectId] = useState<string>(
    state.projects.find((p) => !p.isDeleted && !p.excludeFromAgent)?.id || 'proj-product-2026'
  );

  // ============================================================================
  // 1. CALENDAR VIEW (FR-2.8 & FR-8.1 - FR-8.4)
  // ============================================================================
  if (section === 'calendar') {
    const activeTasksWithDates = state.tasks.filter((tk) => !tk.isDeleted && tk.dueDate);
    const allDates = Array.from(
      new Set([
        selectedDate,
        ...activeTasksWithDates.map((tk) => tk.dueDate!),
        ...state.calendarEvents.map((ev) => ev.startIso.slice(0, 10)),
      ])
    ).sort();

    const tasksForSelectedDate = activeTasksWithDates.filter(
      (tk) => tk.dueDate === selectedDate
    );
    const eventsForSelectedDate = state.calendarEvents.filter(
      (ev) => ev.startIso.slice(0, 10) === selectedDate
    );

    return (
      <div className="space-y-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600" />
              {t.nav.calendar} — Unified Tasks & Google Calendar (FR-8.1–FR-8.4)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Two-way linked with Google Calendar ({state.settings.googleAccount.email}). Completing or rescheduling a synced task updates its linked Google Calendar event automatically.
            </p>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Date Timeline Picker */}
          <div className="lg:col-span-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Upcoming & Scheduled Dates
            </h3>
            {allDates.map((dateStr) => {
              const tCount = activeTasksWithDates.filter((tk) => tk.dueDate === dateStr).length;
              const eCount = state.calendarEvents.filter(
                (ev) => ev.startIso.slice(0, 10) === dateStr
              ).length;
              const isSelected = dateStr === selectedDate;

              return (
                <button
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium border transition ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className="font-mono font-semibold">{dateStr}</span>
                  <div className="flex items-center gap-1.5">
                    {tCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px]">
                        {tCount} tasks
                      </span>
                    )}
                    {eCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px]">
                        {eCount} GCal
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Agenda for Selected Date + Quick Add Synced Task */}
          <div className="lg:col-span-8 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-base">Agenda for {selectedDate}</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  dir={detectTextDirection(newQuickTaskTitle)}
                  value={newQuickTaskTitle}
                  onChange={(e) => setNewQuickTaskTitle(e.target.value)}
                  placeholder="Schedule task on this date..."
                  className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncNewToGcal}
                    onChange={(e) => setSyncNewToGcal(e.target.checked)}
                    className="rounded text-indigo-600"
                  />
                  <span>Sync to GCal</span>
                </label>
                <button
                  onClick={() => {
                    if (!newQuickTaskTitle.trim()) return;
                    createTask({
                      projectId:
                        state.projects.find((p) => !p.isDeleted)?.id || 'proj-product-2026',
                      title: newQuickTaskTitle.trim(),
                      dueDate: selectedDate,
                      dueTime: '10:00',
                      syncToGoogleCalendar: syncNewToGcal,
                    });
                    setNewQuickTaskTitle('');
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>

            {/* Google Calendar Events */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600">
                Google Calendar Events ({eventsForSelectedDate.length})
              </h4>
              {eventsForSelectedDate.length === 0 ? (
                <p className="text-xs text-slate-400">No Google Calendar events on this date.</p>
              ) : (
                eventsForSelectedDate.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-900/50 flex items-center justify-between"
                  >
                    <div>
                      <p
                        dir={detectTextDirection(ev.title)}
                        className="text-sm font-semibold text-slate-900 dark:text-white"
                      >
                        📅 {ev.title}
                      </p>
                      <p className="text-xs text-slate-500">
                        {ev.startIso.slice(11, 16) || 'All Day'} •{' '}
                        {ev.source === 'memory_hub_task'
                          ? 'Synced from Memory Hub Task'
                          : 'Google Calendar'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Memory Hub Tasks Due on Selected Date */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                Tasks Due on {selectedDate} ({tasksForSelectedDate.length})
              </h4>
              {tasksForSelectedDate.length === 0 ? (
                <p className="text-xs text-slate-400">No tasks due on this date.</p>
              ) : (
                tasksForSelectedDate.map((tk) => (
                  <div
                    key={tk.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between"
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tk.completed}
                        onChange={() => toggleTaskCompletion(tk.id)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                      <span
                        dir={detectTextDirection(tk.title)}
                        className={`text-sm font-medium ${
                          tk.completed ? 'line-through text-slate-400' : ''
                        }`}
                      >
                        {tk.title}
                      </span>
                    </label>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {tk.dueTime && <span>⏰ {tk.dueTime}</span>}
                      {tk.syncToGoogleCalendar && (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px]">
                          GCal Linked
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. FILTERED READ-ONLY GMAIL VIEW (FR-9.1 - FR-9.4)
  // ============================================================================
  if (section === 'gmail') {
    const allowedEmails = state.gmailMessages.filter((em) =>
      isEmailAllowedByPolicy(
        em,
        state.settings.gmailAllowlist.allowedLabels,
        state.settings.gmailAllowlist.allowedSenders
      )
    );
    const blockedEmails = state.gmailMessages.filter(
      (em) =>
        !isEmailAllowedByPolicy(
          em,
          state.settings.gmailAllowlist.allowedLabels,
          state.settings.gmailAllowlist.allowedSenders
        )
    );

    return (
      <div className="space-y-5">
        {/* Privacy & Read-Only Gatekeeper Banner */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Mail className="w-5 h-5 text-indigo-600" />
                Filtered Read-Only Gmail Integration (FR-9.1–FR-9.4)
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                <strong>Strict Privacy Allowlist Gatekeeper:</strong> The app and AI Agent can ONLY read emails matching your allowed Gmail labels or sender addresses below. It has read-only scope (`gmail.readonly`) and can never send, modify, or delete emails.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
              <ShieldCheck className="w-4 h-4" />
              {allowedEmails.length} Allowed • {blockedEmails.length} Blocked by Allowlist
            </span>
          </div>

          {/* Allowlist Filter Controls (FR-9.2) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Allowed Gmail Labels
              </label>
              <div className="flex flex-wrap gap-1.5">
                {state.settings.gmailAllowlist.allowedLabels.map((lbl) => (
                  <span
                    key={lbl}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
                  >
                    🏷️ {lbl}
                    <button
                      onClick={() =>
                        updateSettings({
                          gmailAllowlist: {
                            ...state.settings.gmailAllowlist,
                            allowedLabels: state.settings.gmailAllowlist.allowedLabels.filter(
                              (l) => l !== lbl
                            ),
                          },
                        })
                      }
                      className="ml-1 text-indigo-400 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newAllowedLabel}
                  onChange={(e) => setNewAllowedLabel(e.target.value)}
                  placeholder="Add Gmail label (e.g. MemoryHub)..."
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  onClick={() => {
                    if (!newAllowedLabel.trim()) return;
                    updateSettings({
                      gmailAllowlist: {
                        ...state.settings.gmailAllowlist,
                        allowedLabels: [
                          ...state.settings.gmailAllowlist.allowedLabels,
                          newAllowedLabel.trim(),
                        ],
                      },
                    });
                    setNewAllowedLabel('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                >
                  Add Label
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                Allowed Senders / Domains
              </label>
              <div className="flex flex-wrap gap-1.5">
                {state.settings.gmailAllowlist.allowedSenders.map((snd) => (
                  <span
                    key={snd}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-300 font-medium"
                  >
                    ✉️ {snd}
                    <button
                      onClick={() =>
                        updateSettings({
                          gmailAllowlist: {
                            ...state.settings.gmailAllowlist,
                            allowedSenders: state.settings.gmailAllowlist.allowedSenders.filter(
                              (s) => s !== snd
                            ),
                          },
                        })
                      }
                      className="ml-1 text-violet-400 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newAllowedSender}
                  onChange={(e) => setNewAllowedSender(e.target.value)}
                  placeholder="Add sender email..."
                  className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <button
                  onClick={() => {
                    if (!newAllowedSender.trim()) return;
                    updateSettings({
                      gmailAllowlist: {
                        ...state.settings.gmailAllowlist,
                        allowedSenders: [
                          ...state.settings.gmailAllowlist.allowedSenders,
                          newAllowedSender.trim(),
                        ],
                      },
                    });
                    setNewAllowedSender('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium"
                >
                  Add Sender
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Allowed Emails List with One-Click Task Extraction (FR-9.3, FR-9.4) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Emails Passing Allowlist Filter ({allowedEmails.length})
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500">Extract tasks into project:</span>
              <select
                value={targetExtractProjectId}
                onChange={(e) => setTargetExtractProjectId(e.target.value)}
                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
              >
                {state.projects
                  .filter((p) => !p.isDeleted)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {allowedEmails.map((email) => (
            <div
              key={email.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 shadow-2xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4
                    dir={detectTextDirection(email.subject)}
                    className="font-bold text-base text-slate-900 dark:text-white"
                  >
                    {email.subject}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    From: <strong>{email.fromName}</strong> &lt;{email.fromEmail}&gt; •{' '}
                    {new Date(email.receivedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {email.labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="px-2 py-0.5 rounded-full text-[11px] bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium"
                    >
                      {lbl}
                    </span>
                  ))}
                  <button
                    onClick={() => extractTaskFromGmailMessage(email.id, targetExtractProjectId)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Extract Task with Source Link
                  </button>
                </div>
              </div>

              <div
                dir={detectTextDirection(email.bodyText)}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed"
              >
                {email.bodyText}
              </div>
            </div>
          ))}

          {blockedEmails.length > 0 && (
            <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-400" />
                <span>
                  {blockedEmails.length} non-matching inbox message(s) were automatically blocked by the Allowlist Gatekeeper and are invisible to the AI Agent.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. AUTOMATED ROUTINES & MULTI-DEVICE CLAIM LOCK VIEW (FR-10.1 - FR-10.7)
  // ============================================================================
  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-indigo-600" />
            {t.nav.routines} — Multi-Device Claim Lock & Late-Run Recovery (FR-10.1–FR-10.7)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Routines run on your active Windows or Android device. Before running, the device writes a slot claim to Firestore (`routineClaims`) so a routine never runs twice across your PC and phone (FR-10.4). Any edits go straight to the Review Inbox (FR-10.6).
          </p>
        </div>

        <button
          onClick={() => setShowNewRoutineModal(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition"
        >
          <Plus className="w-4 h-4" /> New Routine
        </button>
      </div>

      {/* Routines Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.routines.map((rt) => {
          const proj = state.projects.find((p) => p.id === rt.targetProjectId);
          return (
            <div
              key={rt.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      dir={detectTextDirection(rt.name)}
                      className="font-bold text-base text-slate-900 dark:text-white"
                    >
                      ⚡ {rt.name}
                    </h3>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        rt.enabled
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {rt.enabled ? 'ENABLED' : 'PAUSED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Target Project: {proj ? `${proj.icon} ${proj.name}` : 'Global'} • Schedule:{' '}
                    <span className="font-mono font-semibold">{rt.scheduleTime}</span> (
                    {rt.scheduleFrequency})
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateRoutine(rt.id, { enabled: !rt.enabled })}
                    className="px-2.5 py-1 rounded-lg text-xs border border-slate-200 dark:border-slate-700"
                  >
                    {rt.enabled ? 'Pause' : 'Enable'}
                  </button>
                  <button
                    onClick={() => deleteRoutine(rt.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p
                dir={detectTextDirection(rt.instruction)}
                className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-3 rounded-xl leading-relaxed"
              >
                {rt.instruction}
              </p>

              {/* Interactive Execution & Multi-Device Claim Testing Controls */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  onClick={() => executeRoutineNow(rt.id, 0)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition"
                >
                  <Play className="w-3.5 h-3.5" /> Run Now
                </button>
                <button
                  onClick={() => executeRoutineNow(rt.id, 47)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-100 transition"
                  title="FR-10.5: Simulate device coming online 47m after scheduled time"
                >
                  <Clock className="w-3.5 h-3.5" /> Simulate Late Run (+47m)
                </button>
                <button
                  onClick={() =>
                    executeRoutineNow(rt.id, 0, 'Pixel 9 Pro (Android Companion)')
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="FR-10.4: Test multi-device claim lock when a second device attempts the same slot"
                >
                  <Smartphone className="w-3.5 h-3.5" /> Test 2nd Device Lock
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Routine Execution Log & Multi-Device Slot Claims Table (FR-10.4, FR-10.5, FR-10.7) */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          Routine Run History & Multi-Device Claim Log (FR-10.7)
        </h3>

        <div className="space-y-2.5">
          {state.routineLogs.map((log) => (
            <div
              key={log.id}
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {log.routineName}
                  </span>
                  {log.status === 'success' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold">
                      <CheckCircle2 className="w-3 h-3" /> Executed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-100 dark:bg-indigo-950 text-indigo-800 dark:text-indigo-300 font-semibold">
                      <ShieldCheck className="w-3 h-3" /> Skipped (Already Claimed by Other Device)
                    </span>
                  )}

                  {log.wasLate && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-100 text-amber-800 font-semibold">
                      <AlertTriangle className="w-3 h-3" /> Ran Late (+{log.lateByMinutes}m after offline)
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {log.actionsSummary}
                </p>
              </div>

              <div className="text-right text-[11px] text-slate-500 space-y-0.5">
                <div className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                  <Laptop className="w-3.5 h-3.5" /> {log.deviceName}
                </div>
                <div>{new Date(log.executedAt).toLocaleString()}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create New Routine Modal */}
      {showNewRoutineModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="font-bold text-base">Create Automated Routine (FR-10.1)</h3>
            <input
              type="text"
              dir={detectTextDirection(routineName)}
              value={routineName}
              onChange={(e) => setRoutineName(e.target.value)}
              placeholder="Routine Name (e.g., Morning Action Digest / סיכום בוקר)..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <textarea
              dir={detectTextDirection(routineInstruction)}
              value={routineInstruction}
              onChange={(e) => setRoutineInstruction(e.target.value)}
              rows={3}
              placeholder="Instruction for the AI Agent (e.g., Check allowed Gmail messages, create follow-up tasks, and propose updates to the project roadmap page)..."
              className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Trigger Type (FR-10.2)</label>
                <select
                  value={routineTrigger}
                  onChange={(e) => setRoutineTrigger(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value="schedule">Daily / Weekly Schedule</option>
                  <option value="email_event">Matching Allowed Gmail</option>
                  <option value="both">Both Schedule & Email</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Scheduled Time</label>
                <input
                  type="time"
                  value={routineTime}
                  onChange={(e) => setRoutineTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowNewRoutineModal(false)}
                className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!routineName.trim()) return;
                  createRoutine({
                    name: routineName.trim(),
                    instruction:
                      routineInstruction.trim() ||
                      'Summarize new items and propose updates to Review Inbox.',
                    targetProjectId: routineProjectId,
                    enabled: true,
                    triggerType: routineTrigger,
                    scheduleTime: routineTime,
                    scheduleFrequency: 'daily',
                  });
                  setRoutineName('');
                  setRoutineInstruction('');
                  setShowNewRoutineModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white"
              >
                Save Routine
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
