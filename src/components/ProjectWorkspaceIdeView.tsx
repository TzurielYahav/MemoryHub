import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Circle,
  Plus,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Palette,
  Mic,
  Image as ImageIcon,
  Paperclip,
  Trash2,
  Lock,
  Unlock,
  Calendar,
  Repeat,
  Sparkles,
  Mail,
  Bot,
  ExternalLink,
  FolderPlus,
  Upload,
  CheckSquare,
  FolderTree,
  MoreHorizontal,
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { PriorityLevel, Project } from '../types/domain';
import { useWorkspace, ActiveProjectFile } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';
import { PageBlockEditor } from './PageBlockEditor';
import { CanvasEditorView } from './CanvasEditorView';
import { MeetingNotesView } from './MeetingNotesView';
import { FilesAndOcrView } from './FilesAndOcrView';

interface ProjectWorkspaceIdeViewProps {
  project: Project;
}

interface FolderMenuState {
  folderId: string | null; // null = Project Root
  folderName: string;
  x: number;
  y: number;
}

export const ProjectWorkspaceIdeView: React.FC<ProjectWorkspaceIdeViewProps> = ({
  project,
}) => {
  const {
    state,
    selectedFolderId,
    setSelectedFolderId,
    activeProjectFile,
    setActiveProjectFile,
    setSelectedPageId,
    setSelectedMeetingId,
    setSelectedFileId,
    updateProject,
    deleteProjectToTrash,
    createSubfolder,
    deleteSubfolderToTrash,
    createTask,
    toggleTaskCompletion,
    deleteTaskToTrash,
    createPage,
    deletePageToTrash,
    createCanvas,
    deleteCanvasToTrash,
    deleteMeetingToTrash,
    uploadWorkspaceFile,
    deleteFileToTrash,
    reorderProjectItems,
    navigateToItem,
  } = useWorkspace();

  const t = useTranslations(state.settings.language);
  const todayStr = new Date().toISOString().slice(0, 10);

  // ============================================================================
  // LEFT TOP: PROJECT TASK LIST STATE
  // ============================================================================
  const [taskFilter, setTaskFilter] = useState<'open' | 'today' | 'completed' | 'all'>('open');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityLevel>('medium');
  const [newTaskDueDate, setNewTaskDueDate] = useState(todayStr);
  const [showAddTaskDetails, setShowAddTaskDetails] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [isTasksSectionCollapsed, setIsTasksSectionCollapsed] = useState(false);
  const [isProjectSidebarCollapsed, setIsProjectSidebarCollapsed] = useState(false);

  // ============================================================================
  // LEFT BOTTOM: IDE FOLDER & FILE TREE STATE
  // ============================================================================
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [isRootCollapsed, setIsRootCollapsed] = useState(false);
  const [folderMenu, setFolderMenu] = useState<FolderMenuState | null>(null);
  const [uploadTargetFolderId, setUploadTargetFolderId] = useState<string | null>(null);
  const fileUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-drop rearranging state for files & folders in the tree
  const [draggedTreeItem, setDraggedTreeItem] = useState<{
    itemType: 'page' | 'canvas' | 'meeting' | 'file' | 'subfolder';
    itemId: string;
    folderId: string | null;
  } | null>(null);
  const [dropTargetIndicator, setDropTargetIndicator] = useState<{
    targetKey: string;
    position: 'before' | 'after' | 'inside-folder';
  } | null>(null);

  // Close context/plus menu when clicking outside
  useEffect(() => {
    if (!folderMenu) return;
    const handleClickOutside = () => setFolderMenu(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [folderMenu]);

  // Project items
  const projectSubfolders = useMemo(
    () => state.subfolders.filter((sf) => !sf.isDeleted && sf.projectId === project.id),
    [state.subfolders, project.id]
  );

  const projectPages = useMemo(
    () => state.pages.filter((pg) => !pg.isDeleted && pg.projectId === project.id),
    [state.pages, project.id]
  );

  const projectCanvases = useMemo(
    () => state.canvases.filter((cv) => !cv.isDeleted && cv.projectId === project.id),
    [state.canvases, project.id]
  );

  const projectMeetings = useMemo(
    () => state.meetings.filter((mt) => !mt.isDeleted && mt.projectId === project.id),
    [state.meetings, project.id]
  );

  const projectFiles = useMemo(
    () => state.files.filter((fl) => !fl.isDeleted && fl.projectId === project.id),
    [state.files, project.id]
  );

  // Ensure an active file belonging to this project is selected automatically
  const resolvedActiveFile = useMemo<ActiveProjectFile | null>(() => {
    if (activeProjectFile) {
      if (activeProjectFile.type === 'new-meeting') {
        return activeProjectFile;
      }
      if (
        activeProjectFile.type === 'page' &&
        projectPages.some((p) => p.id === activeProjectFile.id)
      ) {
        return activeProjectFile;
      }
      if (
        activeProjectFile.type === 'canvas' &&
        projectCanvases.some((c) => c.id === activeProjectFile.id)
      ) {
        return activeProjectFile;
      }
      if (
        activeProjectFile.type === 'meeting' &&
        projectMeetings.some((m) => m.id === activeProjectFile.id)
      ) {
        return activeProjectFile;
      }
      if (
        activeProjectFile.type === 'file' &&
        projectFiles.some((f) => f.id === activeProjectFile.id)
      ) {
        return activeProjectFile;
      }
    }

    // Fallback to the first available file in the project
    if (projectPages.length > 0) {
      return { type: 'page', id: projectPages[0].id };
    }
    if (projectCanvases.length > 0) {
      return { type: 'canvas', id: projectCanvases[0].id };
    }
    if (projectMeetings.length > 0) {
      return { type: 'meeting', id: projectMeetings[0].id };
    }
    if (projectFiles.length > 0) {
      return { type: 'file', id: projectFiles[0].id };
    }
    return null;
  }, [
    activeProjectFile,
    projectPages,
    projectCanvases,
    projectMeetings,
    projectFiles,
  ]);

  // Filtered tasks for this project
  const projectTasks = useMemo(() => {
    const priorityRank: Record<PriorityLevel, number> = {
      high: 3,
      medium: 2,
      low: 1,
      none: 0,
    };

    return state.tasks
      .filter((tItem) => {
        if (tItem.isDeleted || tItem.projectId !== project.id) return false;
        if (taskFilter === 'open') return !tItem.completed;
        if (taskFilter === 'today') return !tItem.completed && tItem.dueDate === todayStr;
        if (taskFilter === 'completed') return tItem.completed;
        return true;
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (priorityRank[b.priority] !== priorityRank[a.priority]) {
          return priorityRank[b.priority] - priorityRank[a.priority];
        }
        return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
      });
  }, [state.tasks, project.id, taskFilter, todayStr]);

  const openTasksCount = useMemo(
    () =>
      state.tasks.filter(
        (tk) => !tk.isDeleted && tk.projectId === project.id && !tk.completed
      ).length,
    [state.tasks, project.id]
  );

  const totalFilesCount =
    projectPages.length +
    projectCanvases.length +
    projectMeetings.length +
    projectFiles.length;

  // ============================================================================
  // HANDLERS: TASK CREATION & ACTIONS
  // ============================================================================
  const handleQuickAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    createTask({
      projectId: project.id,
      folderId: selectedFolderId,
      title: newTaskTitle.trim(),
      priority: newTaskPriority,
      dueDate: newTaskDueDate || undefined,
      reminderMinutesBefore: 15,
      recurrence: { frequency: 'none' },
      tagIds: [],
      syncToGoogleCalendar: false,
    });
    setNewTaskTitle('');
  };

  // ============================================================================
  // HANDLERS: FOLDER TREE & NEW FILE CREATION MENU
  // ============================================================================
  const toggleFolderCollapse = (folderId: string) => {
    setCollapsedFolders((prev) => ({
      ...prev,
      [folderId]: !prev[folderId],
    }));
  };

  const openFolderActionMenu = (
    e: React.MouseEvent,
    folderId: string | null,
    folderName: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(e.clientX || rect.left, window.innerWidth - 240);
    const y = Math.min(e.clientY || rect.bottom + 4, window.innerHeight - 260);
    setFolderMenu({
      folderId,
      folderName,
      x,
      y,
    });
  };

  const handleCreateFileInFolder = (
    fileType: 'page' | 'canvas' | 'meeting' | 'file' | 'subfolder',
    targetFolderId: string | null
  ) => {
    setFolderMenu(null);
    if (targetFolderId) {
      setCollapsedFolders((prev) => ({ ...prev, [targetFolderId]: false }));
      setSelectedFolderId(targetFolderId);
    } else {
      setIsRootCollapsed(false);
      setSelectedFolderId(null);
    }

    if (fileType === 'page') {
      const title = prompt(
        'New Page Title / שם דף חדש:',
        'Untitled Page / דף חדש'
      );
      if (!title) return;
      const created = createPage(project.id, targetFolderId, title);
      setSelectedPageId(created.id);
      setActiveProjectFile({ type: 'page', id: created.id });
    } else if (fileType === 'canvas') {
      const title = prompt(
        'New Canvas Name / שם לוח קנבס חדש:',
        'Architecture & Flow Canvas'
      );
      if (!title) return;
      const created = createCanvas(project.id, targetFolderId, title);
      setActiveProjectFile({ type: 'canvas', id: created.id });
    } else if (fileType === 'meeting') {
      setSelectedMeetingId(null);
      setActiveProjectFile({
        type: 'new-meeting',
        id: `new-${Date.now()}`,
        folderId: targetFolderId,
      });
    } else if (fileType === 'file') {
      setUploadTargetFolderId(targetFolderId);
      setTimeout(() => {
        fileUploadInputRef.current?.click();
      }, 20);
    } else if (fileType === 'subfolder') {
      const name = prompt('New Folder Name / שם תיקייה חדשה:');
      if (!name) return;
      createSubfolder(project.id, targetFolderId, name);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      const created = await uploadWorkspaceFile(
        files[i],
        project.id,
        uploadTargetFolderId
      );
      setSelectedFileId(created.id);
      setActiveProjectFile({ type: 'file', id: created.id });
    }
    e.target.value = '';
  };

  const selectFileNode = (type: ActiveProjectFile['type'], id: string, folderId: string | null) => {
    setSelectedFolderId(folderId);
    if (type === 'page') setSelectedPageId(id);
    if (type === 'meeting') setSelectedMeetingId(id);
    if (type === 'file') setSelectedFileId(id);
    setActiveProjectFile({ type, id, folderId });
  };

  // ============================================================================
  // UNIFIED SORTED FILE LIST & DRAG-AND-DROP REARRANGING IN PROJECT TREE
  // ============================================================================
  const getSortedFilesInFolder = (folderId: string | null) => {
    const combined: Array<{
      itemType: 'page' | 'canvas' | 'meeting' | 'file';
      id: string;
      title: string;
      folderId: string | null;
      order: number;
      mimeType?: string;
    }> = [];

    projectPages
      .filter((p) => (p.folderId ?? null) === folderId)
      .forEach((p, idx) => {
        combined.push({
          itemType: 'page',
          id: p.id,
          title: p.title,
          folderId: p.folderId ?? null,
          order: typeof p.order === 'number' ? p.order : idx * 10,
        });
      });

    projectCanvases
      .filter((c) => (c.folderId ?? null) === folderId)
      .forEach((c, idx) => {
        combined.push({
          itemType: 'canvas',
          id: c.id,
          title: c.title,
          folderId: c.folderId ?? null,
          order: typeof c.order === 'number' ? c.order : 1000 + idx * 10,
        });
      });

    projectMeetings
      .filter((m) => (m.folderId ?? null) === folderId)
      .forEach((m, idx) => {
        combined.push({
          itemType: 'meeting',
          id: m.id,
          title: m.title,
          folderId: m.folderId ?? null,
          order: typeof m.order === 'number' ? m.order : 2000 + idx * 10,
        });
      });

    projectFiles
      .filter((f) => (f.folderId ?? null) === folderId)
      .forEach((f, idx) => {
        combined.push({
          itemType: 'file',
          id: f.id,
          title: f.name,
          folderId: f.folderId ?? null,
          order: typeof f.order === 'number' ? f.order : 3000 + idx * 10,
          mimeType: f.mimeType,
        });
      });

    return combined.sort((a, b) => a.order - b.order);
  };

  const handleDropOnFileItem = (
    e: React.DragEvent,
    targetItem: {
      itemType: 'page' | 'canvas' | 'meeting' | 'file';
      id: string;
      folderId: string | null;
    },
    position: 'before' | 'after'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetIndicator(null);

    let source = draggedTreeItem;
    if (!source) {
      const raw = e.dataTransfer.getData('application/x-memoryhub-tree-item');
      if (raw) {
        try {
          source = JSON.parse(raw);
        } catch {
          source = null;
        }
      }
    }
    setDraggedTreeItem(null);

    if (!source || source.itemType === 'subfolder') return;
    if (source.itemType === targetItem.itemType && source.itemId === targetItem.id) return;

    const targetFolderId = targetItem.folderId;
    const itemsInTargetFolder = getSortedFilesInFolder(targetFolderId).filter(
      (it) => !(it.itemType === source!.itemType && it.id === source!.itemId)
    );

    const targetIdx = itemsInTargetFolder.findIndex(
      (it) => it.itemType === targetItem.itemType && it.id === targetItem.id
    );
    const insertIdx =
      targetIdx === -1
        ? itemsInTargetFolder.length
        : position === 'before'
        ? targetIdx
        : targetIdx + 1;

    const reordered = [...itemsInTargetFolder];
    reordered.splice(insertIdx, 0, {
      itemType: source.itemType,
      id: source.itemId,
      title: '',
      folderId: targetFolderId,
      order: 0,
    });

    reorderProjectItems(
      reordered.map((it, idx) => ({
        itemType: it.itemType,
        itemId: it.id,
        folderId: targetFolderId,
        order: (idx + 1) * 10,
      }))
    );
  };

  const handleDropOnFolderHeader = (
    e: React.DragEvent,
    targetFolderId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTargetIndicator(null);

    let source = draggedTreeItem;
    if (!source) {
      const raw = e.dataTransfer.getData('application/x-memoryhub-tree-item');
      if (raw) {
        try {
          source = JSON.parse(raw);
        } catch {
          source = null;
        }
      }
    }
    setDraggedTreeItem(null);
    if (!source) return;

    if (source.itemType === 'subfolder') {
      if (source.itemId === targetFolderId) return;
      const siblings = projectSubfolders
        .filter((sf) => sf.parentId === targetFolderId && sf.id !== source!.itemId)
        .sort((a, b) => a.order - b.order);
      reorderProjectItems([
        ...siblings.map((sf, idx) => ({
          itemType: 'subfolder' as const,
          itemId: sf.id,
          folderId: targetFolderId,
          order: (idx + 1) * 10,
        })),
        {
          itemType: 'subfolder',
          itemId: source.itemId,
          folderId: targetFolderId,
          order: (siblings.length + 1) * 10,
        },
      ]);
      if (targetFolderId) {
        setCollapsedFolders((prev) => ({ ...prev, [targetFolderId]: false }));
      }
      return;
    }

    const existing = getSortedFilesInFolder(targetFolderId).filter(
      (it) => !(it.itemType === source!.itemType && it.id === source!.itemId)
    );
    reorderProjectItems([
      ...existing.map((it, idx) => ({
        itemType: it.itemType,
        itemId: it.id,
        folderId: targetFolderId,
        order: (idx + 1) * 10,
      })),
      {
        itemType: source.itemType,
        itemId: source.itemId,
        folderId: targetFolderId,
        order: (existing.length + 1) * 10,
      },
    ]);
    if (targetFolderId) {
      setCollapsedFolders((prev) => ({ ...prev, [targetFolderId]: false }));
    } else {
      setIsRootCollapsed(false);
    }
  };

  // ============================================================================
  // RENDER FILES INSIDE A GIVEN FOLDER (OR ROOT)
  // ============================================================================
  const renderFilesForFolder = (folderId: string | null, depth: number) => {
    const sortedItems = getSortedFilesInFolder(folderId);
    const indentPx = depth * 14 + 10;

    return (
      <div className="space-y-0.5">
        {sortedItems.map((item) => {
          const itemKey = `${item.itemType}:${item.id}`;
          const isSelected =
            resolvedActiveFile?.type === item.itemType &&
            resolvedActiveFile.id === item.id;
          const isDropBefore =
            dropTargetIndicator?.targetKey === itemKey &&
            dropTargetIndicator.position === 'before';
          const isDropAfter =
            dropTargetIndicator?.targetKey === itemKey &&
            dropTargetIndicator.position === 'after';
          const isImg = item.itemType === 'file' && item.mimeType?.startsWith('image/');

          const badgeLabel =
            item.itemType === 'page'
              ? 'PAGE'
              : item.itemType === 'canvas'
              ? 'CANVAS'
              : item.itemType === 'meeting'
              ? 'MEETING'
              : 'FILE';

          return (
            <div
              key={itemKey}
              draggable={true}
              onDragStart={(e) => {
                const payload = {
                  itemType: item.itemType,
                  itemId: item.id,
                  folderId: item.folderId,
                };
                setDraggedTreeItem(payload);
                e.dataTransfer.setData(
                  'application/x-memoryhub-tree-item',
                  JSON.stringify(payload)
                );
                if (item.itemType === 'file') {
                  e.dataTransfer.setData('application/x-memoryhub-file-id', item.id);
                }
                e.dataTransfer.setData('text/plain', item.title);
                e.dataTransfer.effectAllowed = 'copyMove';
              }}
              onDragEnd={() => {
                setDraggedTreeItem(null);
                setDropTargetIndicator(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                const isTopHalf = e.clientY - rect.top < rect.height / 2;
                const pos = isTopHalf ? 'before' : 'after';
                if (
                  dropTargetIndicator?.targetKey !== itemKey ||
                  dropTargetIndicator.position !== pos
                ) {
                  setDropTargetIndicator({ targetKey: itemKey, position: pos });
                }
              }}
              onDragLeave={(e) => {
                e.stopPropagation();
                if (dropTargetIndicator?.targetKey === itemKey) {
                  setDropTargetIndicator(null);
                }
              }}
              onDrop={(e) =>
                handleDropOnFileItem(
                  e,
                  item,
                  dropTargetIndicator?.targetKey === itemKey &&
                    dropTargetIndicator.position === 'before'
                    ? 'before'
                    : 'after'
                )
              }
              style={{ paddingInlineStart: `${indentPx}px` }}
              onClick={() => selectFileNode(item.itemType, item.id, item.folderId)}
              title={`${item.title} — Drag to rearrange order or move between folders`}
              className={`group relative flex items-center justify-between gap-1.5 pe-2 py-1.5 rounded-lg text-xs cursor-grab active:cursor-grabbing transition ${
                isSelected
                  ? 'bg-indigo-600 text-white font-semibold shadow-2xs'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80'
              } ${isDropBefore ? 'border-t-2 border-indigo-500' : ''} ${
                isDropAfter ? 'border-b-2 border-indigo-500' : ''
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <GripVertical
                  className={`w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 transition ${
                    isSelected ? 'text-indigo-200' : 'text-slate-400'
                  }`}
                />
                {item.itemType === 'page' && (
                  <FileText
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-white' : 'text-indigo-500'
                    }`}
                  />
                )}
                {item.itemType === 'canvas' && (
                  <Palette
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-white' : 'text-emerald-500'
                    }`}
                  />
                )}
                {item.itemType === 'meeting' && (
                  <Mic
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isSelected ? 'text-white' : 'text-rose-500'
                    }`}
                  />
                )}
                {item.itemType === 'file' &&
                  (isImg ? (
                    <ImageIcon
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-white' : 'text-amber-500'
                      }`}
                    />
                  ) : (
                    <Paperclip
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isSelected ? 'text-white' : 'text-sky-500'
                      }`}
                    />
                  ))}
                <span
                  dir={detectTextDirection(item.title)}
                  className="truncate"
                  title={item.title}
                >
                  {item.title}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span
                  className={`text-[9px] font-mono px-1 rounded ${
                    isSelected
                      ? 'bg-indigo-500 text-indigo-100'
                      : 'text-slate-400 dark:text-slate-500'
                  }`}
                >
                  {badgeLabel}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.itemType === 'page') deletePageToTrash(item.id);
                    else if (item.itemType === 'canvas') deleteCanvasToTrash(item.id);
                    else if (item.itemType === 'meeting') deleteMeetingToTrash(item.id);
                    else if (item.itemType === 'file') deleteFileToTrash(item.id);
                  }}
                  className={`opacity-0 group-hover:opacity-100 p-0.5 rounded transition ${
                    isSelected
                      ? 'hover:bg-indigo-500 text-indigo-100'
                      : 'hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600'
                  }`}
                  title="Move to Trash"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ============================================================================
  // RECURSIVE IDE FOLDER TREE RENDERER
  // ============================================================================
  const renderSubfolderNodes = (parentId: string | null, depth: number): React.ReactNode => {
    const childFolders = projectSubfolders
      .filter((sf) => sf.parentId === parentId)
      .sort((a, b) => a.order - b.order);
    if (childFolders.length === 0) return null;

    return childFolders.map((folder) => {
      const isCollapsed = !!collapsedFolders[folder.id];
      const isFolderSelected = selectedFolderId === folder.id;
      const folderIndentPx = depth * 14 + 6;
      const folderTargetKey = `folder:${folder.id}`;
      const isDropInside =
        dropTargetIndicator?.targetKey === folderTargetKey &&
        dropTargetIndicator.position === 'inside-folder';

      return (
        <div key={folder.id} className="space-y-0.5">
          {/* Folder Header Row (supports Drag & Drop, Click to collapse/expand, Right-Click & + Button) */}
          <div
            draggable={true}
            onDragStart={(e) => {
              const payload = {
                itemType: 'subfolder' as const,
                itemId: folder.id,
                folderId: folder.parentId,
              };
              setDraggedTreeItem(payload);
              e.dataTransfer.setData(
                'application/x-memoryhub-tree-item',
                JSON.stringify(payload)
              );
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDraggedTreeItem(null);
              setDropTargetIndicator(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (dropTargetIndicator?.targetKey !== folderTargetKey) {
                setDropTargetIndicator({
                  targetKey: folderTargetKey,
                  position: 'inside-folder',
                });
              }
            }}
            onDragLeave={(e) => {
              e.stopPropagation();
              if (dropTargetIndicator?.targetKey === folderTargetKey) {
                setDropTargetIndicator(null);
              }
            }}
            onDrop={(e) => handleDropOnFolderHeader(e, folder.id)}
            style={{ paddingInlineStart: `${folderIndentPx}px` }}
            onClick={() => {
              setSelectedFolderId(folder.id);
              toggleFolderCollapse(folder.id);
            }}
            onContextMenu={(e) => openFolderActionMenu(e, folder.id, folder.name)}
            className={`group flex items-center justify-between gap-1 pe-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition ${
              isDropInside
                ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                : isFolderSelected
                ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
            title="Left-click to expand/collapse • Drag files here to move • Right-click or click + to add a file or subfolder"
          >
            <div className="flex items-center gap-1.5 min-w-0">
              {isCollapsed ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              )}
              {isCollapsed ? (
                <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              ) : (
                <FolderOpen className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              )}
              <span
                dir={detectTextDirection(folder.name)}
                className="truncate font-medium"
              >
                {folder.name}
              </span>
            </div>

            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => openFolderActionMenu(e, folder.id, folder.name)}
                className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-950/80 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                title="Add new file or subfolder inside this folder"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSubfolderToTrash(folder.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 transition"
                title="Move folder to Trash"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Nested Subfolders + All Files inside this folder */}
          {!isCollapsed && (
            <div className="space-y-0.5">
              {renderSubfolderNodes(folder.id, depth + 1)}
              {renderFilesForFolder(folder.id, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  const priorityBadgeClass = (p: PriorityLevel) => {
    switch (p) {
      case 'high':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'medium':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'low':
        return 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200 dark:border-sky-800';
      default:
        return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className={`space-y-4 mx-auto ${isProjectSidebarCollapsed ? 'w-full' : 'max-w-[1600px]'}`}>
      {/* Hidden File Upload Input triggered from Folder '+' or Right-Click Menu */}
      <input
        ref={fileUploadInputRef}
        type="file"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Compact Project Header Strip */}
      <div className="px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsProjectSidebarCollapsed((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition ${
              isProjectSidebarCollapsed
                ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={
              isProjectSidebarCollapsed
                ? 'Show Project Sidebar (Tasks & Files)'
                : 'Collapse Project Sidebar for more space'
            }
          >
            {isProjectSidebarCollapsed ? (
              <>
                <PanelLeftOpen className="w-3.5 h-3.5" />
                <span>Show Sidebar</span>
              </>
            ) : (
              <>
                <PanelLeftClose className="w-3.5 h-3.5" />
                <span>Hide Sidebar</span>
              </>
            )}
          </button>
          <span className="text-2xl">{project.icon}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                dir={detectTextDirection(project.name)}
                className="text-base font-extrabold text-slate-900 dark:text-white truncate"
              >
                {project.name}
              </h2>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-medium">
                {openTasksCount} tasks • {totalFilesCount} files
              </span>
            </div>
            <p
              dir={detectTextDirection(project.description)}
              className="text-xs text-slate-500 truncate"
            >
              {project.description}
            </p>
          </div>
        </div>

        {/* Project Privacy & Delete Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              updateProject(project.id, {
                excludeFromAgent: !project.excludeFromAgent,
              })
            }
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
              project.excludeFromAgent
                ? 'border-amber-300 bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
            title={t.project.excludeFromAgentDesc}
          >
            {project.excludeFromAgent ? (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>Excluded from AI Agent</span>
              </>
            ) : (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>AI Agent Allowed</span>
              </>
            )}
          </button>

          <button
            onClick={() => deleteProjectToTrash(project.id)}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600"
            title={t.project.deleteProject}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* =======================================================================
          MAIN TWO-COLUMN IDE PROJECT WORKSPACE LAYOUT:
          - Left Column (lg:col-span-4 xl:col-span-3):
              1) Top: Project Task List (distinct from files)
              2) Under it: Collapsible IDE Folder & File Tree
          - Right Column (lg:col-span-8 xl:col-span-9):
              Big File Display View (without any top sub-tab bar)
         ======================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: TASKS LIST (TOP) + FOLDERS & FILES TREE (BOTTOM) */}
        {!isProjectSidebarCollapsed && (
          <div className="lg:col-span-4 xl:col-span-3 space-y-4">
          {/* -------------------------------------------------------------------
              1. TOP PANEL: PROJECT TASK LIST
             ------------------------------------------------------------------- */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            {/* Tasks Panel Header */}
            <div className="px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setIsTasksSectionCollapsed((v) => !v)}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200"
              >
                {isTasksSectionCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                )}
                <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Project Tasks</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-bold">
                  {openTasksCount}
                </span>
              </button>

              {/* Filter Pills */}
              <div className="flex items-center gap-1 text-[10px] font-semibold">
                {(
                  [
                    { id: 'open', label: 'Open' },
                    { id: 'today', label: 'Today' },
                    { id: 'completed', label: 'Done' },
                    { id: 'all', label: 'All' },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTaskFilter(f.id)}
                    className={`px-1.5 py-0.5 rounded transition ${
                      taskFilter === f.id
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {!isTasksSectionCollapsed && (
              <div className="p-3 space-y-2.5">
                {/* Quick Add Task Form */}
                <form onSubmit={handleQuickAddTask} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      dir={detectTextDirection(newTaskTitle)}
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      placeholder="+ Add task to project..."
                      className="flex-1 text-xs px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/90 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddTaskDetails((v) => !v)}
                      className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      title="Set due date & priority"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="submit"
                      className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition"
                      title="Add Task"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {showAddTaskDetails && (
                    <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                      <input
                        type="date"
                        value={newTaskDueDate}
                        onChange={(e) => setNewTaskDueDate(e.target.value)}
                        className="flex-1 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      />
                      <select
                        value={newTaskPriority}
                        onChange={(e) => setNewTaskPriority(e.target.value as PriorityLevel)}
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                      >
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                        <option value="none">None</option>
                      </select>
                    </div>
                  )}
                </form>

                {/* Scrollable Project Tasks List */}
                <div className="space-y-1.5 max-h-64 overflow-y-auto pe-0.5">
                  {projectTasks.length === 0 ? (
                    <p className="text-center py-4 text-xs text-slate-400">
                      No tasks in "{taskFilter}" view.
                    </p>
                  ) : (
                    projectTasks.map((task) => {
                      const isOverdue =
                        !task.completed && !!task.dueDate && task.dueDate < todayStr;
                      const isExpanded = expandedTaskId === task.id;

                      return (
                        <div
                          key={task.id}
                          className={`group rounded-xl border p-2 text-xs transition ${
                            task.completed
                              ? 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/60 dark:border-slate-800/60 opacity-65'
                              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <button
                                type="button"
                                onClick={() => toggleTaskCompletion(task.id)}
                                className="mt-0.5 text-slate-400 hover:text-indigo-600 shrink-0"
                              >
                                {task.completed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                ) : (
                                  <Circle className="w-4 h-4" />
                                )}
                              </button>

                              <div
                                className="min-w-0 flex-1 cursor-pointer"
                                onClick={() =>
                                  setExpandedTaskId(isExpanded ? null : task.id)
                                }
                              >
                                <p
                                  dir={detectTextDirection(task.title)}
                                  className={`font-medium leading-snug break-words ${
                                    task.completed ? 'line-through text-slate-400' : ''
                                  }`}
                                >
                                  {task.title}
                                </p>

                                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                  {task.priority !== 'none' && (
                                    <span
                                      className={`text-[9px] font-bold uppercase px-1.5 py-0.2 rounded border ${priorityBadgeClass(
                                        task.priority
                                      )}`}
                                    >
                                      {task.priority}
                                    </span>
                                  )}

                                  {task.dueDate && (
                                    <span
                                      className={`inline-flex items-center gap-0.5 text-[10px] ${
                                        isOverdue
                                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                                          : 'text-slate-400'
                                      }`}
                                    >
                                      <Calendar className="w-2.5 h-2.5" />
                                      {task.dueDate}
                                    </span>
                                  )}

                                  {task.recurrence.frequency !== 'none' && (
                                    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                                      <Repeat className="w-2.5 h-2.5" />
                                    </span>
                                  )}

                                  {task.sourceType !== 'user' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (task.sourceType === 'meeting' && task.sourceId) {
                                          navigateToItem(
                                            'meeting',
                                            task.sourceId,
                                            task.projectId
                                          );
                                        } else if (task.sourceType === 'email') {
                                          navigateToItem('email', task.sourceId || '');
                                        } else if (task.sourceType === 'agent') {
                                          navigateToItem('agent', '');
                                        }
                                      }}
                                      className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 hover:underline"
                                      title="Jump to source"
                                    >
                                      {task.sourceType === 'agent' && (
                                        <Sparkles className="w-2.5 h-2.5" />
                                      )}
                                      {task.sourceType === 'meeting' && (
                                        <Mic className="w-2.5 h-2.5" />
                                      )}
                                      {task.sourceType === 'email' && (
                                        <Mail className="w-2.5 h-2.5" />
                                      )}
                                      {task.sourceType === 'routine' && (
                                        <Bot className="w-2.5 h-2.5" />
                                      )}
                                      <span>{task.sourceType}</span>
                                      <ExternalLink className="w-2 h-2" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => deleteTaskToTrash(task.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-rose-600 transition shrink-0"
                              title="Move task to Trash"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>

                          {isExpanded && task.description && (
                            <p
                              dir={detectTextDirection(task.description)}
                              className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500"
                            >
                              {task.description}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* -------------------------------------------------------------------
              2. BOTTOM PANEL (UNDER TASK LIST): IDE FOLDERS & FILES TREE
             ------------------------------------------------------------------- */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden">
            {/* Folder Explorer Header */}
            <div
              onContextMenu={(e) => openFolderActionMenu(e, null, `${project.name} (Root)`)}
              className="px-3.5 py-2.5 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between select-none"
            >
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                <FolderTree className="w-3.5 h-3.5 text-amber-500" />
                <span>Files & Folders</span>
                <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold">
                  {totalFilesCount}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => openFolderActionMenu(e, null, `${project.name} (Root)`)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold shadow-2xs transition"
                  title="Add a new file (Page, Canvas, Meeting, Upload) or Subfolder"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsProjectSidebarCollapsed(true)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition"
                  title="Collapse Sidebar for more workspace room"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* IDE Tree Body */}
            <div className="p-2.5 space-y-1 max-h-[520px] overflow-y-auto">
              {/* Root Project Folder Node */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (dropTargetIndicator?.targetKey !== 'folder:root') {
                    setDropTargetIndicator({
                      targetKey: 'folder:root',
                      position: 'inside-folder',
                    });
                  }
                }}
                onDragLeave={(e) => {
                  e.stopPropagation();
                  if (dropTargetIndicator?.targetKey === 'folder:root') {
                    setDropTargetIndicator(null);
                  }
                }}
                onDrop={(e) => handleDropOnFolderHeader(e, null)}
                onClick={() => {
                  setSelectedFolderId(null);
                  setIsRootCollapsed((v) => !v);
                }}
                onContextMenu={(e) => openFolderActionMenu(e, null, `${project.name} (Root)`)}
                className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg text-xs cursor-pointer select-none transition ${
                  dropTargetIndicator?.targetKey === 'folder:root'
                    ? 'ring-2 ring-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                    : selectedFolderId === null
                    ? 'bg-slate-200/80 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
                title="Left-click to expand/collapse • Drag files here to move to Root • Right-click or click + to add a new file of any type"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  {isRootCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="text-sm shrink-0">{project.icon}</span>
                  <span
                    dir={detectTextDirection(project.name)}
                    className="truncate font-semibold"
                  >
                    {project.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={(e) => openFolderActionMenu(e, null, `${project.name} (Root)`)}
                  className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-950/80 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                  title="Add new file or subfolder at Project Root"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Root Children: Nested Subfolders + Root-level Files */}
              {!isRootCollapsed && (
                <div className="space-y-0.5 pt-0.5">
                  {renderSubfolderNodes(null, 1)}
                  {renderFilesForFolder(null, 1)}
                </div>
              )}

              <p className="pt-2 px-2 text-[10px] text-slate-400 dark:text-slate-500">
                💡 Right-click any folder or click <kbd className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800">+</kbd> to add a Page, Canvas, Meeting, File, or Subfolder.
              </p>
            </div>
          </div>
          </div>
        )}

        {/* =====================================================================
            RIGHT COLUMN: BIG UNIFIED FILE DISPLAY & EDITOR VIEW (NO TOP BAR)
           ===================================================================== */}
        <div
          className={`${
            isProjectSidebarCollapsed
              ? 'lg:col-span-12'
              : 'lg:col-span-8 xl:col-span-9'
          } min-w-0`}
        >
          {resolvedActiveFile ? (
            <>
              {resolvedActiveFile.type === 'page' && (() => {
                const pg = projectPages.find((p) => p.id === resolvedActiveFile.id);
                return pg ? <PageBlockEditor page={pg} /> : null;
              })()}

              {resolvedActiveFile.type === 'canvas' && (
                <CanvasEditorView
                  projectId={project.id}
                  folderId={
                    projectCanvases.find((c) => c.id === resolvedActiveFile.id)?.folderId ??
                    selectedFolderId
                  }
                  canvasId={resolvedActiveFile.id}
                />
              )}

              {resolvedActiveFile.type === 'meeting' && (
                <MeetingNotesView
                  projectId={project.id}
                  folderId={
                    projectMeetings.find((m) => m.id === resolvedActiveFile.id)?.folderId ??
                    selectedFolderId
                  }
                  meetingId={resolvedActiveFile.id}
                />
              )}

              {resolvedActiveFile.type === 'new-meeting' && (
                <MeetingNotesView
                  key={resolvedActiveFile.id}
                  projectId={project.id}
                  folderId={resolvedActiveFile.folderId ?? selectedFolderId}
                  isNewRecordingMode={true}
                />
              )}

              {resolvedActiveFile.type === 'file' && (
                <FilesAndOcrView
                  projectId={project.id}
                  folderId={
                    projectFiles.find((f) => f.id === resolvedActiveFile.id)?.folderId ??
                    selectedFolderId
                  }
                  fileId={resolvedActiveFile.id}
                />
              )}
            </>
          ) : (
            /* Empty State if Project has 0 files of any type */
            <div className="p-12 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center mx-auto">
                <FolderOpen className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  No files in this project yet
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Select a file from the folder tree on the left, or right-click any folder (or click +) to create a new file.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                <button
                  onClick={() => handleCreateFileInFolder('page', selectedFolderId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  <FileText className="w-3.5 h-3.5" /> New Page
                </button>
                <button
                  onClick={() => handleCreateFileInFolder('canvas', selectedFolderId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <Palette className="w-3.5 h-3.5" /> New Canvas
                </button>
                <button
                  onClick={() => handleCreateFileInFolder('meeting', selectedFolderId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold"
                >
                  <Mic className="w-3.5 h-3.5" /> New Meeting Note
                </button>
                <button
                  onClick={() => handleCreateFileInFolder('file', selectedFolderId)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  <Upload className="w-3.5 h-3.5" /> Upload File (PDF / Image)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =======================================================================
          FLOATING RIGHT-CLICK / '+' MENU TO ADD NEW FILE OF EACH TYPE
         ======================================================================= */}
      {folderMenu && (
        <div
          style={{ top: folderMenu.y, left: folderMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-60 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-1.5 space-y-0.5 text-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">
            Add in: {folderMenu.folderName}
          </div>

          <button
            type="button"
            onClick={() => handleCreateFileInFolder('page', folderMenu.folderId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/60 text-slate-700 dark:text-slate-200 font-medium transition"
          >
            <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
            <div className="text-start">
              <div className="font-semibold">New Page</div>
              <div className="text-[10px] text-slate-400">Notion-style block document</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCreateFileInFolder('canvas', folderMenu.folderId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-950/60 text-slate-700 dark:text-slate-200 font-medium transition"
          >
            <Palette className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="text-start">
              <div className="font-semibold">New Canvas</div>
              <div className="text-[10px] text-slate-400">Freeform board & diagrams</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCreateFileInFolder('meeting', folderMenu.folderId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/60 text-slate-700 dark:text-slate-200 font-medium transition"
          >
            <Mic className="w-4 h-4 text-rose-600 shrink-0" />
            <div className="text-start">
              <div className="font-semibold">New Meeting Note</div>
              <div className="text-[10px] text-slate-400">Live audio + AI summary</div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleCreateFileInFolder('file', folderMenu.folderId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-sky-50 dark:hover:bg-sky-950/60 text-slate-700 dark:text-slate-200 font-medium transition"
          >
            <Upload className="w-4 h-4 text-sky-600 shrink-0" />
            <div className="text-start">
              <div className="font-semibold">Upload File (PDF / Image)</div>
              <div className="text-[10px] text-slate-400">Drive sync & Bilingual OCR</div>
            </div>
          </button>

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          <button
            type="button"
            onClick={() => handleCreateFileInFolder('subfolder', folderMenu.folderId)}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-amber-50 dark:hover:bg-amber-950/60 text-slate-700 dark:text-slate-200 font-medium transition"
          >
            <FolderPlus className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-start">
              <div className="font-semibold">New Subfolder</div>
              <div className="text-[10px] text-slate-400">Nested folder inside tree</div>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
