import React, { useMemo, useState } from 'react';
import {
  Bell,
  Calendar,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
  FolderInput,
  Paperclip,
  Plus,
  Repeat,
  Sparkles,
  Tag,
  Trash2,
  Mic,
  Mail,
  Bot,
} from 'lucide-react';
import { PriorityLevel, RecurrenceRule, Task } from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';

interface TaskManagerViewProps {
  projectId?: string | null;
  folderId?: string | null;
  isGlobalView?: boolean;
}

export const TaskManagerView: React.FC<TaskManagerViewProps> = ({
  projectId = null,
  folderId = null,
  isGlobalView = false,
}) => {
  const {
    state,
    createTask,
    updateTask,
    toggleTaskCompletion,
    deleteTaskToTrash,
    createTag,
    uploadWorkspaceFile,
    moveItemToLocation,
    navigateToItem,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  // Filters & sorting (FR-2.6, FR-2.7)
  const [viewBucket, setViewBucket] = useState<'all' | 'today' | 'upcoming' | 'overdue' | 'completed'>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'createdAt'>('dueDate');

  // New task creation state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<PriorityLevel>('medium');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(15);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceRule['frequency']>('none');
  const [customIntervalDays, setCustomIntervalDays] = useState<number>(3);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [syncToCalendar, setSyncToCalendar] = useState<boolean>(false);
  const [targetProjectForNew, setTargetProjectForNew] = useState<string>(
    projectId || state.projects.find((p) => !p.isDeleted)?.id || 'proj-product-2026'
  );

  // New tag creation inline
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366F1');

  // Move modal / expanded task ID
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const todayStr = new Date().toISOString().slice(0, 10);

  const filteredTasks = useMemo(() => {
    const priorityRank: Record<PriorityLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
      none: 0,
    };

    return state.tasks
      .filter((task) => {
        if (task.isDeleted) return false;
        if (!isGlobalView && projectId && task.projectId !== projectId) return false;
        if (!isGlobalView && folderId && task.folderId !== folderId) return false;
        if (isGlobalView && projectFilter !== 'all' && task.projectId !== projectFilter) return false;
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
        if (tagFilter !== 'all' && !task.tagIds.includes(tagFilter)) return false;

        if (viewBucket === 'completed') return task.completed;
        if (viewBucket === 'today') return !task.completed && task.dueDate === todayStr;
        if (viewBucket === 'overdue')
          return !task.completed && !!task.dueDate && task.dueDate < todayStr;
        if (viewBucket === 'upcoming')
          return !task.completed && !!task.dueDate && task.dueDate > todayStr;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (sortBy === 'priority') {
          return priorityRank[b.priority] - priorityRank[a.priority];
        }
        if (sortBy === 'dueDate') {
          const da = a.dueDate || '9999-12-31';
          const db = b.dueDate || '9999-12-31';
          return da.localeCompare(db);
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [
    state.tasks,
    isGlobalView,
    projectId,
    folderId,
    projectFilter,
    priorityFilter,
    tagFilter,
    viewBucket,
    sortBy,
    todayStr,
  ]);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const effectiveProjectId = projectId || targetProjectForNew;

    if (reminderMinutes !== null && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    createTask({
      projectId: effectiveProjectId,
      folderId: projectId ? folderId : null,
      title,
      description,
      dueDate: dueDate || undefined,
      dueTime: dueTime || undefined,
      priority,
      reminderMinutesBefore: reminderMinutes,
      recurrence: {
        frequency: recurrenceFreq,
        intervalDays: recurrenceFreq === 'custom' ? customIntervalDays : undefined,
      },
      tagIds: selectedTags,
      syncToGoogleCalendar: syncToCalendar,
    });

    setTitle('');
    setDescription('');
  };

  const handleCreateNewTag = () => {
    if (!newTagName.trim()) return;
    const created = createTag(newTagName, newTagColor);
    setSelectedTags((prev) => [...prev, created.id]);
    setNewTagName('');
    setShowNewTagForm(false);
  };

  const handleAttachFileToTask = async (task: Task, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadWorkspaceFile(file, task.projectId, task.folderId, task.id);
    e.target.value = '';
  };

  const priorityBadge = (p: PriorityLevel) => {
    switch (p) {
      case 'high':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'medium':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'low':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-neutral-800 dark:text-gray-400 border-gray-200 dark:border-neutral-700';
    }
  };

  return (
    <div className="space-y-5">
      {/* Global / Bucket Filter Tabs (FR-2.7) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-notion-border dark:border-notion-darkBorder pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: t.tasks.all },
              { id: 'today', label: t.tasks.today },
              { id: 'upcoming', label: t.tasks.upcoming },
              { id: 'overdue', label: t.tasks.overdue },
              { id: 'completed', label: t.tasks.completed },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setViewBucket(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                viewBucket === tab.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-notion-sidebar dark:bg-notion-darkCard text-notion-text dark:text-notion-darkText hover:bg-notion-hover dark:hover:bg-notion-darkHover'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort & Filter Controls (FR-2.6) */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {isGlobalView && (
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              className="rounded-lg border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1.5"
            >
              <option value="all">All Projects</option>
              {state.projects
                .filter((p) => !p.isDeleted)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
            </select>
          )}

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as PriorityLevel | 'all')}
            className="rounded-lg border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1.5"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
            <option value="none">No Priority</option>
          </select>

          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-lg border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1.5"
          >
            <option value="all">All Tags</option>
            {state.tags.map((tg) => (
              <option key={tg.id} value={tg.id}>
                🏷️ {tg.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'dueDate' | 'priority' | 'createdAt')}
            className="rounded-lg border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1.5"
          >
            <option value="dueDate">Sort: Due Date</option>
            <option value="priority">Sort: Priority</option>
            <option value="createdAt">Sort: Newest</option>
          </select>
        </div>
      </div>

      {/* Rich Task Composer (FR-2.1 - FR-2.5, Tags, Calendar Sync) */}
      <form
        onSubmit={handleAddTask}
        className="rounded-xl border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard p-4 shadow-sm space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            dir={detectTextDirection(title, state.settings.language === 'he' ? 'rtl' : 'ltr')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t.tasks.addTask}
            className="flex-1 rounded-lg border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar/50 dark:bg-notion-darkBg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            Add Task
          </button>
        </div>

        <input
          type="text"
          dir={detectTextDirection(description, state.settings.language === 'he' ? 'rtl' : 'ltr')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description or context notes..."
          className="w-full rounded-lg border border-notion-border/70 dark:border-notion-darkBorder bg-transparent px-3 py-1.5 text-xs text-notion-muted dark:text-notion-darkMuted focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />

        <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs">
          {isGlobalView && (
            <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
              <span className="text-notion-muted">Project:</span>
              <select
                value={targetProjectForNew}
                onChange={(e) => setTargetProjectForNew(e.target.value)}
                className="bg-transparent font-medium focus:outline-none"
              >
                {state.projects
                  .filter((p) => !p.isDeleted)
                  .map((p) => (
                    <option key={p.id} value={p.id} className="dark:bg-notion-darkCard">
                      {p.icon} {p.name}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {/* Due Date & Time (FR-2.2) */}
          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="bg-transparent focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
            <Clock className="w-3.5 h-3.5 text-indigo-500" />
            <input
              type="time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              className="bg-transparent focus:outline-none"
            />
          </label>

          {/* Priority (FR-2.3) */}
          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
            <span className="text-notion-muted">{t.tasks.priority}:</span>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as PriorityLevel)}
              className="bg-transparent font-medium focus:outline-none"
            >
              <option value="none" className="dark:bg-notion-darkCard">{t.tasks.priorityNone}</option>
              <option value="low" className="dark:bg-notion-darkCard">{t.tasks.priorityLow}</option>
              <option value="medium" className="dark:bg-notion-darkCard">{t.tasks.priorityMedium}</option>
              <option value="high" className="dark:bg-notion-darkCard">{t.tasks.priorityHigh}</option>
            </select>
          </label>

          {/* Reminder (FR-2.4) */}
          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
            <Bell className="w-3.5 h-3.5 text-amber-500" />
            <select
              value={reminderMinutes === null ? 'none' : String(reminderMinutes)}
              onChange={(e) =>
                setReminderMinutes(e.target.value === 'none' ? null : Number(e.target.value))
              }
              className="bg-transparent focus:outline-none"
            >
              <option value="none" className="dark:bg-notion-darkCard">No Reminder</option>
              <option value="0" className="dark:bg-notion-darkCard">At due time</option>
              <option value="15" className="dark:bg-notion-darkCard">15 min before</option>
              <option value="30" className="dark:bg-notion-darkCard">30 min before</option>
              <option value="60" className="dark:bg-notion-darkCard">1 hour before</option>
              <option value="1440" className="dark:bg-notion-darkCard">1 day before</option>
            </select>
          </label>

          {/* Recurrence (FR-2.5) */}
          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder">
            <Repeat className="w-3.5 h-3.5 text-emerald-500" />
            <select
              value={recurrenceFreq}
              onChange={(e) =>
                setRecurrenceFreq(e.target.value as RecurrenceRule['frequency'])
              }
              className="bg-transparent focus:outline-none"
            >
              <option value="none" className="dark:bg-notion-darkCard">{t.tasks.repeatNone}</option>
              <option value="daily" className="dark:bg-notion-darkCard">{t.tasks.repeatDaily}</option>
              <option value="weekly" className="dark:bg-notion-darkCard">{t.tasks.repeatWeekly}</option>
              <option value="monthly" className="dark:bg-notion-darkCard">{t.tasks.repeatMonthly}</option>
              <option value="custom" className="dark:bg-notion-darkCard">{t.tasks.repeatCustom}</option>
            </select>
            {recurrenceFreq === 'custom' && (
              <input
                type="number"
                min={1}
                max={365}
                value={customIntervalDays}
                onChange={(e) => setCustomIntervalDays(Number(e.target.value))}
                className="w-12 px-1 py-0.5 rounded border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard text-center"
                title="Interval in days"
              />
            )}
          </label>

          {/* Google Calendar Sync Toggle (FR-8.4) */}
          <label className="flex items-center gap-1.5 bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5 rounded-lg border border-notion-border dark:border-notion-darkBorder cursor-pointer select-none">
            <input
              type="checkbox"
              checked={syncToCalendar}
              onChange={(e) => setSyncToCalendar(e.target.checked)}
              className="rounded text-indigo-600"
            />
            <span>{t.tasks.syncCalendar}</span>
          </label>
        </div>

        {/* Color-Coded Tags Selector */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-notion-muted flex items-center gap-1 mr-1">
            <Tag className="w-3.5 h-3.5" /> {t.tasks.tags}:
          </span>
          {state.tags.map((tg) => {
            const active = selectedTags.includes(tg.id);
            return (
              <button
                type="button"
                key={tg.id}
                onClick={() =>
                  setSelectedTags((prev) =>
                    prev.includes(tg.id) ? prev.filter((x) => x !== tg.id) : [...prev, tg.id]
                  )
                }
                style={{
                  borderColor: tg.color,
                  backgroundColor: active ? tg.color : 'transparent',
                  color: active ? '#FFFFFF' : tg.color,
                }}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium border transition"
              >
                {tg.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowNewTagForm((v) => !v)}
            className="px-2 py-0.5 rounded-full text-[11px] border border-dashed border-notion-border dark:border-notion-darkBorder hover:border-indigo-500 text-notion-muted"
          >
            + New Tag
          </button>

          {showNewTagForm && (
            <div className="flex items-center gap-1.5 ml-2 bg-notion-sidebar dark:bg-notion-darkBg px-2 py-1 rounded-lg border border-notion-border dark:border-notion-darkBorder">
              <input
                type="text"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name..."
                className="text-xs bg-transparent w-24 focus:outline-none"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-5 h-5 rounded cursor-pointer border-0"
              />
              <button
                type="button"
                onClick={handleCreateNewTag}
                className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[11px]"
              >
                Save
              </button>
            </div>
          )}
        </div>
      </form>

      {/* Task List Items */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <div className="text-center py-10 rounded-xl border border-dashed border-notion-border dark:border-notion-darkBorder text-notion-muted dark:text-notion-darkMuted text-sm">
            No tasks match the selected filters. Add a task above or ask the AI Agent to extract tasks from your notes or meetings!
          </div>
        ) : (
          filteredTasks.map((task) => {
            const proj = state.projects.find((p) => p.id === task.projectId);
            const taskTags = state.tags.filter((tg) => task.tagIds.includes(tg.id));
            const taskAttachments = state.files.filter(
              (f) => !f.isDeleted && (task.attachmentFileIds.includes(f.id) || f.taskId === task.id)
            );
            const isOverdue = !task.completed && !!task.dueDate && task.dueDate < todayStr;
            const isExpanded = expandedTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`rounded-xl border transition p-3.5 ${
                  task.completed
                    ? 'bg-notion-sidebar/50 dark:bg-notion-darkCard/40 border-notion-border/60 dark:border-notion-darkBorder/60 opacity-75'
                    : 'bg-white dark:bg-notion-darkCard border-notion-border dark:border-notion-darkBorder hover:border-indigo-300 dark:hover:border-indigo-800 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => toggleTaskCompletion(task.id)}
                      className="mt-0.5 text-notion-muted hover:text-indigo-600 transition flex-shrink-0"
                      title={
                        task.recurrence.frequency !== 'none'
                          ? 'Completing this recurring task will automatically create the next occurrence!'
                          : 'Toggle completion'
                      }
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          dir={detectTextDirection(task.title)}
                          onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                          className={`text-sm font-medium cursor-pointer ${
                            task.completed ? 'line-through text-notion-muted' : ''
                          }`}
                        >
                          {task.title}
                        </span>

                        {/* Priority Badge */}
                        {task.priority !== 'none' && (
                          <span
                            className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${priorityBadge(
                              task.priority
                            )}`}
                          >
                            {task.priority}
                          </span>
                        )}

                        {/* Recurrence Badge (FR-2.5) */}
                        {task.recurrence.frequency !== 'none' && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                            <Repeat className="w-3 h-3" />
                            {task.recurrence.frequency === 'custom'
                              ? `Every ${task.recurrence.intervalDays}d`
                              : task.recurrence.frequency}
                          </span>
                        )}

                        {/* Source Attribution & Backlink Badge (FR-2.9) */}
                        {task.sourceType !== 'user' && (
                          <button
                            onClick={() => {
                              if (task.sourceType === 'meeting' && task.sourceId) {
                                navigateToItem('meeting', task.sourceId, task.projectId);
                              } else if (task.sourceType === 'email') {
                                navigateToItem('email', task.sourceId || '');
                              } else if (task.sourceType === 'agent') {
                                navigateToItem('agent', '');
                              }
                            }}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 hover:underline"
                            title="Click to jump to source (FR-2.9)"
                          >
                            {task.sourceType === 'agent' && <Sparkles className="w-3 h-3" />}
                            {task.sourceType === 'meeting' && <Mic className="w-3 h-3" />}
                            {task.sourceType === 'email' && <Mail className="w-3 h-3" />}
                            {task.sourceType === 'routine' && <Bot className="w-3 h-3" />}
                            <span>
                              {task.sourceType === 'agent' && t.tasks.sourceAgent}
                              {task.sourceType === 'meeting' &&
                                `${t.tasks.sourceMeeting}: ${task.sourceTitle || ''}`}
                              {task.sourceType === 'email' &&
                                `${t.tasks.sourceEmail}: ${task.sourceTitle || ''}`}
                              {task.sourceType === 'routine' &&
                                `${t.tasks.sourceRoutine}: ${task.sourceTitle || ''}`}
                            </span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </button>
                        )}
                      </div>

                      {task.description && (
                        <p
                          dir={detectTextDirection(task.description)}
                          className="text-xs text-notion-muted dark:text-notion-darkMuted mt-1"
                        >
                          {task.description}
                        </p>
                      )}

                      {/* Meta Row: Project, Due Date, Tags, Attachments, Calendar Sync */}
                      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
                        {isGlobalView && proj && (
                          <button
                            onClick={() => navigateToItem('project', proj.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-notion-sidebar dark:bg-notion-darkBg text-notion-text dark:text-notion-darkText hover:underline"
                          >
                            <span>{proj.icon}</span>
                            <span>{proj.name}</span>
                          </button>
                        )}

                        {task.dueDate && (
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                              isOverdue
                                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold'
                                : 'bg-notion-sidebar dark:bg-notion-darkBg text-notion-muted dark:text-notion-darkMuted'
                            }`}
                          >
                            <Calendar className="w-3 h-3" />
                            {task.dueDate}
                            {task.dueTime ? ` • ${task.dueTime}` : ''}
                            {isOverdue ? ' (Overdue)' : ''}
                          </span>
                        )}

                        {task.reminderMinutesBefore != null && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                            <Bell className="w-3 h-3" />
                            {task.reminderMinutesBefore === 0
                              ? 'At due time'
                              : `${task.reminderMinutesBefore}m before`}
                          </span>
                        )}

                        {task.syncToGoogleCalendar && (
                          <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300">
                            📅 Synced to Google Calendar
                          </span>
                        )}

                        {/* Color-coded Tags */}
                        {taskTags.map((tg) => (
                          <span
                            key={tg.id}
                            style={{
                              backgroundColor: `${tg.color}18`,
                              color: tg.color,
                              borderColor: `${tg.color}50`,
                            }}
                            className="px-2 py-0.5 rounded-full text-[11px] font-medium border"
                          >
                            #{tg.name}
                          </span>
                        ))}

                        {/* Direct Task File Attachments */}
                        {taskAttachments.map((att) => (
                          <button
                            key={att.id}
                            onClick={() => navigateToItem('file', att.id, task.projectId)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 text-[11px] hover:underline"
                          >
                            <Paperclip className="w-3 h-3" />
                            {att.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions: Attach File, Move, Delete */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <label
                      className="p-1.5 rounded-lg hover:bg-notion-hover dark:hover:bg-notion-darkHover text-notion-muted cursor-pointer"
                      title="Attach file directly to this task"
                    >
                      <Paperclip className="w-4 h-4" />
                      <input
                        type="file"
                        onChange={(e) => handleAttachFileToTask(task, e)}
                        className="hidden"
                      />
                    </label>
                    <button
                      onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                      className="p-1.5 rounded-lg hover:bg-notion-hover dark:hover:bg-notion-darkHover text-notion-muted"
                      title="Edit / Move task between projects & folders (FR-1.4)"
                    >
                      <FolderInput className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteTaskToTrash(task.id)}
                      className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-notion-muted hover:text-rose-600"
                      title="Move task to Trash"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Task Drawer: Edit fields or Move to another Project / Subfolder (FR-1.4) */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-notion-border dark:border-notion-darkBorder flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-notion-muted">Move Task (FR-1.4):</span>
                      <select
                        value={task.projectId}
                        onChange={(e) =>
                          moveItemToLocation('task', task.id, e.target.value, null)
                        }
                        className="rounded border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar dark:bg-notion-darkBg px-2 py-1"
                      >
                        {state.projects
                          .filter((p) => !p.isDeleted)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              Project: {p.icon} {p.name}
                            </option>
                          ))}
                      </select>

                      <select
                        value={task.folderId || ''}
                        onChange={(e) =>
                          moveItemToLocation(
                            'task',
                            task.id,
                            task.projectId,
                            e.target.value || null
                          )
                        }
                        className="rounded border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar dark:bg-notion-darkBg px-2 py-1"
                      >
                        <option value="">(Root of Project)</option>
                        {state.subfolders
                          .filter((sf) => !sf.isDeleted && sf.projectId === task.projectId)
                          .map((sf) => (
                            <option key={sf.id} value={sf.id}>
                              Folder: {sf.icon} {sf.name}
                            </option>
                          ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!task.syncToGoogleCalendar}
                          onChange={(e) =>
                            updateTask(task.id, { syncToGoogleCalendar: e.target.checked })
                          }
                        />
                        <span>Sync to Google Calendar (FR-8.4)</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
