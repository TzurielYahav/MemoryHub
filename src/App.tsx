import React, { useState, useMemo } from 'react';
import {
  Home,
  CheckSquare,
  Calendar,
  Search,
  Sparkles,
  GitCompare,
  RefreshCw,
  Mail,
  Smartphone,
  Trash2,
  Settings,
  Plus,
  Lock,
  Mic,
  Sun,
  Moon,
  Database,
  ChevronRight,
  ExternalLink,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { detectTextDirection, useTranslations } from './i18n/translations';
import { searchWorkspace } from './services/searchEngine';
import { TaskManagerView } from './components/TaskManagerView';
import { ProjectWorkspaceIdeView } from './components/ProjectWorkspaceIdeView';
import { AgentWorkspaceView } from './components/AgentWorkspaceView';
import { CalendarAndIntegrationsView } from './components/CalendarAndIntegrationsView';
import {
  AndroidWidgetPreviewView,
  QuickCaptureModal,
} from './components/AndroidWidgetAndQuickCapture';
import { SettingsAndTrashView } from './components/SettingsAndTrashView';
import { DiffReviewCard } from './components/DiffReviewCard';

const WorkspaceShell: React.FC = () => {
  const {
    state,
    activeNav,
    setActiveNav,
    selectedProjectId,
    setSelectedProjectId,
    selectedFolderId,
    setSelectedFolderId,
    setSelectedPageId,
    setActiveProjectFile,
    setQuickCaptureMode,
    createProject,
    createPage,
    updateSettings,
    navigateToItem,
    signInWithGoogle,
  } = useWorkspace();

  const t = useTranslations(state.settings.language);
  const isRtl = state.settings.language === 'he';

  // Search View State (FR-11.1 - FR-11.3)
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilterType, setSearchFilterType] = useState<string>('all');

  // New Project Modal State
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [newProjIcon, setNewProjIcon] = useState('🚀');
  const [isMainSidebarCollapsed, setIsMainSidebarCollapsed] = useState(false);

  const activeProjects = useMemo(
    () => state.projects.filter((p) => !p.isDeleted),
    [state.projects]
  );

  const currentProject = useMemo(
    () =>
      activeProjects.find((p) => p.id === selectedProjectId) || activeProjects[0],
    [activeProjects, selectedProjectId]
  );

  const projectSubfolders = useMemo(
    () =>
      state.subfolders.filter(
        (sf) => !sf.isDeleted && sf.projectId === currentProject?.id
      ),
    [state.subfolders, currentProject]
  );

  const pendingProposals = useMemo(
    () => state.editProposals.filter((p) => p.status === 'pending'),
    [state.editProposals]
  );

  const trashCount = useMemo(
    () =>
      state.projects.filter((x) => x.isDeleted).length +
      state.tasks.filter((x) => x.isDeleted).length +
      state.pages.filter((x) => x.isDeleted).length +
      state.files.filter((x) => x.isDeleted).length +
      state.canvases.filter((x) => x.isDeleted).length +
      state.meetings.filter((x) => x.isDeleted).length,
    [state]
  );

  const searchResults = useMemo(() => {
    const raw = searchWorkspace(state, {
      query: searchQuery,
      forAgent: false,
      semantic: state.settings.semanticSearchEnabled,
    });
    if (searchFilterType === 'all') return raw;
    return raw.filter((r) => r.itemType === searchFilterType);
  }, [state, searchQuery, searchFilterType]);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="min-h-screen flex bg-slate-100/80 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans"
    >
      {/* Left / Right Sidebar Navigation */}
      {!isMainSidebarCollapsed && (
        <aside className="w-64 shrink-0 bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800 flex flex-col justify-between p-3.5 select-none">
          <div className="space-y-5 overflow-y-auto">
            {/* App Brand & Quick Capture Button */}
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                  M
                </div>
                <div>
                  <h1 className="font-extrabold text-sm tracking-tight text-slate-900 dark:text-white">
                    {t.appName}
                  </h1>
                  <p className="text-[10px] text-slate-400">Windows & Android Sync</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setQuickCaptureMode('task')}
                  className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 transition"
                  title="Quick Capture (Ctrl+Shift+Space)"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsMainSidebarCollapsed(true)}
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title="Collapse Main Sidebar"
                >
                  <PanelLeftClose className="w-4 h-4" />
                </button>
              </div>
            </div>

          {/* Primary Navigation Links */}
          <nav className="space-y-1 text-xs font-medium">
            {[
              { id: 'home', label: t.nav.home, icon: Home },
              { id: 'all-tasks', label: t.nav.allTasks, icon: CheckSquare },
              { id: 'calendar', label: t.nav.calendar, icon: Calendar },
              { id: 'search', label: `${t.nav.search} (Ctrl+K)`, icon: Search },
              { id: 'agent', label: t.nav.agent, icon: Sparkles },
              {
                id: 'review-inbox',
                label: t.nav.reviewInbox,
                icon: GitCompare,
                badge: pendingProposals.length > 0 ? pendingProposals.length : undefined,
              },
              { id: 'routines', label: t.nav.routines, icon: RefreshCw },
              { id: 'gmail', label: t.nav.gmail, icon: Mail },
              { id: 'android-widget', label: t.nav.androidWidget, icon: Smartphone },
            ].map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveNav(item.id as any)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
                    active
                      ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                        active
                          ? 'bg-white text-indigo-700'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Projects Section (FR-1.1, FR-1.6) */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between px-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t.nav.projects}
              </span>
              <button
                onClick={() => setShowNewProjectModal(true)}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            <div className="space-y-1">
              {activeProjects.map((proj) => {
                const isSelected =
                  activeNav === 'project' && currentProject?.id === proj.id;
                return (
                  <button
                    key={proj.id}
                    onClick={() => {
                      setSelectedProjectId(proj.id);
                      setSelectedFolderId(null);
                      setActiveNav('project');
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition ${
                      isSelected
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span
                      dir={detectTextDirection(proj.name)}
                      className="flex items-center gap-2 truncate"
                    >
                      <span>{proj.icon}</span>
                      <span className="truncate">{proj.name}</span>
                    </span>
                    {proj.excludeFromAgent && (
                      <span title={t.project.excludeFromAgentDesc}>
                        <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bottom Utility Links: Trash, Settings & Offline-First Status */}
        <div className="space-y-1.5 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            onClick={() => setActiveNav('trash')}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl transition ${
              activeNav === 'trash'
                ? 'bg-rose-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              <span>{t.nav.trash}</span>
            </span>
            {trashCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {trashCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveNav('settings')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl transition ${
              activeNav === 'settings'
                ? 'bg-indigo-600 text-white font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>{t.nav.settings}</span>
          </button>

          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <Database className="w-3.5 h-3.5" />
              {t.sync.offlineReady}
            </span>
            <span className="font-mono text-[10px]">
              {state.usageStats.writesToday}w
            </span>
          </div>
        </div>
      </aside>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="h-14 px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 sticky top-0 z-20">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <button
              type="button"
              onClick={() => setIsMainSidebarCollapsed((v) => !v)}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title={isMainSidebarCollapsed ? 'Show Main Sidebar' : 'Collapse Main Sidebar'}
            >
              {isMainSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-indigo-600" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
            <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
              {activeNav === 'project' ? currentProject?.name : activeNav.replace('-', ' ')}
            </span>
            {activeNav === 'project' && selectedFolderId && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-indigo-600 font-medium">
                  {projectSubfolders.find((f) => f.id === selectedFolderId)?.name}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Google Account Status / Sign-In Button */}
            {state.settings.googleAccount.connected ? (
              <button
                onClick={() => setActiveNav('settings')}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs transition"
                title={`Google Account: ${state.settings.googleAccount.email} (Drive & Firestore active)`}
              >
                {state.settings.googleAccount.avatarUrl ? (
                  <img
                    src={state.settings.googleAccount.avatarUrl}
                    alt="Google"
                    className="w-4 h-4 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[9px] font-bold">
                    {state.settings.googleAccount.displayName ? state.settings.googleAccount.displayName[0].toUpperCase() : 'G'}
                  </div>
                )}
                <span className="font-medium text-slate-800 dark:text-slate-200 max-w-[130px] truncate hidden sm:inline">
                  {state.settings.googleAccount.displayName || state.settings.googleAccount.email}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Connected" />
              </button>
            ) : (
              <button
                onClick={() => setActiveNav('settings')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold transition"
                title="Connect Google Account for Drive, Calendar, Gmail & Firestore"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"/>
                  <path fill="#FBBC05" d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.14-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"/>
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"/>
                </svg>
                <span>Google Sign In</span>
              </button>
            )}

            {/* Quick Voice Agent Button */}
            <button
              onClick={() => setQuickCaptureMode('voice-agent')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-xs font-semibold hover:bg-rose-100 transition"
              title="Instant Voice to Agent (FR-12.6)"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Agent</span>
            </button>

            {/* Instant Language RTL / LTR Toggle (FR-14.1) */}
            <button
              onClick={() =>
                updateSettings({
                  language: state.settings.language === 'he' ? 'en' : 'he',
                })
              }
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Switch UI Language & RTL/LTR Layout"
            >
              {state.settings.language === 'he' ? '🇺🇸 EN' : '🇮🇱 עברית'}
            </button>

            {/* Light / Dark Theme Toggle (FR-14.3) */}
            <button
              onClick={() =>
                updateSettings({
                  theme: state.settings.theme === 'dark' ? 'light' : 'dark',
                })
              }
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Toggle Light / Dark Theme"
            >
              {state.settings.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-slate-600" />
              )}
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <main className="flex-1 p-6 overflow-y-auto">
          {/* =================================================================
              1. HOME / OVERVIEW DASHBOARD (FR-1.5)
             ================================================================= */}
          {activeNav === 'home' && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Hero Welcome & Quick Actions */}
              <div className="p-6 rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-violet-700 text-white shadow-md flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    {t.home.welcome}
                  </h2>
                  <p className="text-xs text-indigo-100 max-w-2xl">
                    {t.home.subtitle}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setQuickCaptureMode('task')}
                    className="px-3.5 py-2 rounded-xl bg-white text-indigo-700 font-bold text-xs shadow-xs hover:bg-indigo-50 transition"
                  >
                    + {t.home.quickTask}
                  </button>
                  <button
                    onClick={() => {
                      if (currentProject) {
                        const pg = createPage(
                          currentProject.id,
                          null,
                          'New Note / דף חדש'
                        );
                        setSelectedPageId(pg.id);
                        setActiveProjectFile({ type: 'page', id: pg.id });
                        setActiveNav('project');
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl bg-indigo-500/40 hover:bg-indigo-500/60 border border-indigo-400/40 text-white font-semibold text-xs transition"
                  >
                    📄 {t.home.newPage}
                  </button>
                  <button
                    onClick={() => {
                      setActiveProjectFile({
                        type: 'new-meeting',
                        id: 'new',
                        folderId: null,
                      });
                      setActiveNav('project');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs transition"
                  >
                    🎙️ {t.home.recordMeeting}
                  </button>
                  <button
                    onClick={() => setActiveNav('agent')}
                    className="px-3.5 py-2 rounded-xl bg-indigo-500/40 hover:bg-indigo-500/60 border border-indigo-400/40 text-white font-semibold text-xs transition"
                  >
                    ✨ {t.home.askAgent}
                  </button>
                </div>
              </div>

              {/* Pending Agent Diff Proposals Alert (FR-7.9, FR-10.6) */}
              {pendingProposals.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    ⚡ {t.home.pendingReviews} ({pendingProposals.length})
                  </h3>
                  {pendingProposals.slice(0, 1).map((prop) => (
                    <DiffReviewCard key={prop.id} proposal={prop} />
                  ))}
                </div>
              )}

              {/* Projects Grid (FR-1.1, FR-1.5, FR-1.6) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t.home.projectsSection} ({activeProjects.length})
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {activeProjects.map((proj) => {
                    const pTasks = state.tasks.filter(
                      (tk) => !tk.isDeleted && tk.projectId === proj.id && !tk.completed
                    ).length;
                    const pPages = state.pages.filter(
                      (pg) => !pg.isDeleted && pg.projectId === proj.id
                    ).length;
                    const pMeetings = state.meetings.filter(
                      (m) => !m.isDeleted && m.projectId === proj.id
                    ).length;

                    return (
                      <div
                        key={proj.id}
                        onClick={() => {
                          setSelectedProjectId(proj.id);
                          setSelectedFolderId(null);
                          setActiveNav('project');
                        }}
                        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 cursor-pointer transition shadow-2xs space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="text-2xl">{proj.icon}</span>
                            <h4
                              dir={detectTextDirection(proj.name)}
                              className="font-bold text-base text-slate-900 dark:text-white"
                            >
                              {proj.name}
                            </h4>
                          </div>
                          {proj.excludeFromAgent && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              <Lock className="w-3 h-3" /> {t.home.excludeFromAgentBadge}
                            </span>
                          )}
                        </div>

                        <p
                          dir={detectTextDirection(proj.description)}
                          className="text-xs text-slate-500 line-clamp-2"
                        >
                          {proj.description}
                        </p>

                        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 font-medium">
                          <span>☑️ {pTasks} open tasks</span>
                          <span>📄 {pPages} pages</span>
                          <span>🎙️ {pMeetings} meetings</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Global Tasks Due Today & Overdue */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {t.home.todayTasks}
                </h3>
                <TaskManagerView projectId={null} folderId={null} />
              </div>
            </div>
          )}

          {/* =================================================================
              2. IDE-STYLE PROJECT WORKSPACE VIEW (Tasks + Folder Tree | Editor)
             ================================================================= */}
          {activeNav === 'project' && currentProject && (
            <ProjectWorkspaceIdeView project={currentProject} />
          )}

          {/* =================================================================
              3. GLOBAL ALL TASKS VIEW
             ================================================================= */}
          {activeNav === 'all-tasks' && (
            <div className="max-w-6xl mx-auto">
              <TaskManagerView projectId={null} folderId={null} />
            </div>
          )}

          {/* =================================================================
              4. FAST FULL-TEXT & SEMANTIC SEARCH VIEW (FR-11.1 - FR-11.3)
             ================================================================= */}
          {activeNav === 'search' && (
            <div className="max-w-5xl mx-auto space-y-5">
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-2xs">
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-indigo-600 shrink-0" />
                  <input
                    type="text"
                    autoFocus
                    dir={detectTextDirection(searchQuery)}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search across all projects, pages, tasks, canvases, meetings, Gmail & OCR text (Hebrew & English)..."
                    className="w-full text-base bg-transparent focus:outline-none text-slate-900 dark:text-white"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['all', 'page', 'task', 'meeting', 'file', 'canvas', 'email'].map(
                      (flt) => (
                        <button
                          key={flt}
                          onClick={() => setSearchFilterType(flt)}
                          className={`px-2.5 py-1 rounded-lg capitalize font-medium transition ${
                            searchFilterType === flt
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {flt}
                        </button>
                      )
                    )}
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={state.settings.semanticSearchEnabled}
                      onChange={(e) =>
                        updateSettings({ semanticSearchEnabled: e.target.checked })
                      }
                      className="rounded text-indigo-600"
                    />
                    <span>Bilingual Semantic Expansion (FR-11.3)</span>
                  </label>
                </div>
              </div>

              <div className="space-y-2.5">
                {searchResults.map((res) => (
                  <div
                    key={res.id}
                    onClick={() =>
                      navigateToItem(res.itemType, res.id, res.projectId)
                    }
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 cursor-pointer transition flex items-start justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600">
                          {res.itemType}
                        </span>
                        <h4
                          dir={detectTextDirection(res.title)}
                          className="font-bold text-sm text-slate-900 dark:text-white"
                        >
                          {res.title}
                        </h4>
                      </div>
                      <p
                        dir={detectTextDirection(res.snippet)}
                        className="text-xs text-slate-500 line-clamp-2"
                      >
                        {res.snippet}
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* =================================================================
              5. AI AGENT & REVIEW INBOX VIEWS (FR-7.1 - FR-7.15, FR-10.6)
             ================================================================= */}
          {activeNav === 'agent' && <AgentWorkspaceView mode="chat" />}
          {activeNav === 'review-inbox' && <AgentWorkspaceView mode="review-inbox" />}

          {/* =================================================================
              6. CALENDAR, GMAIL & ROUTINES VIEWS (FR-8, FR-9, FR-10)
             ================================================================= */}
          {activeNav === 'calendar' && (
            <CalendarAndIntegrationsView section="calendar" />
          )}
          {activeNav === 'gmail' && <CalendarAndIntegrationsView section="gmail" />}
          {activeNav === 'routines' && (
            <CalendarAndIntegrationsView section="routines" />
          )}

          {/* =================================================================
              7. ANDROID WIDGET CONFIGURATOR & LIVE SIMULATOR (FR-12)
             ================================================================= */}
          {activeNav === 'android-widget' && <AndroidWidgetPreviewView />}

          {/* =================================================================
              8. SETTINGS & TRASH VIEWS (FR-1.7, FR-13, FR-14)
             ================================================================= */}
          {activeNav === 'trash' && <SettingsAndTrashView mode="trash" />}
          {activeNav === 'settings' && <SettingsAndTrashView mode="settings" />}
        </main>
      </div>

      {/* Floating Quick Capture & Instant Voice Modal (FR-12.3, FR-12.5, FR-12.6, FR-13.2) */}
      <QuickCaptureModal />

      {/* Create New Project Modal */}
      {showNewProjectModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-xl space-y-4">
            <h3 className="font-bold text-base">{t.nav.newProject}</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={newProjIcon}
                onChange={(e) => setNewProjIcon(e.target.value)}
                className="w-14 text-center text-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
              <input
                type="text"
                autoFocus
                dir={detectTextDirection(newProjName)}
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="Project Name / שם הפרויקט..."
                className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
              />
            </div>
            <textarea
              dir={detectTextDirection(newProjDesc)}
              value={newProjDesc}
              onChange={(e) => setNewProjDesc(e.target.value)}
              rows={2}
              placeholder="Project description..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowNewProjectModal(false)}
                className="px-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (!newProjName.trim()) return;
                  createProject(newProjName.trim(), newProjDesc.trim(), newProjIcon, '#4F46E5');
                  setNewProjName('');
                  setNewProjDesc('');
                  setShowNewProjectModal(false);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 text-white"
              >
                Create Project
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <WorkspaceProvider>
      <WorkspaceShell />
    </WorkspaceProvider>
  );
};

export default App;
