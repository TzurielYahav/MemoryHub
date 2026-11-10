import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Bold,
  CheckSquare,
  Code,
  Download,
  Edit3,
  Eye,
  ExternalLink,
  FileText,
  FolderInput,
  GripVertical,
  History,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Paperclip,
  Plus,
  Quote,
  RotateCcw,
  Sparkles,
  Strikethrough,
  Highlighter,
  Palette,
  Table,
  Trash2,
  Type,
  Underline,
  Upload,
  AlignRight,
  AlignLeft,
  X,
} from 'lucide-react';
import {
  BlockType,
  ChecklistItem,
  PageBlock,
  PageDocument,
  SimpleTableData,
  WorkspaceFile,
} from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';
import { DiffReviewCard } from './DiffReviewCard';

const BLOCK_TYPE_OPTIONS: Array<{ type: BlockType; label: string }> = [
  { type: 'paragraph', label: 'Paragraph' },
  { type: 'heading1', label: 'Heading 1' },
  { type: 'heading2', label: 'Heading 2' },
  { type: 'heading3', label: 'Heading 3' },
  { type: 'bullet_list', label: 'Bulleted List' },
  { type: 'numbered_list', label: 'Numbered List' },
  { type: 'checklist', label: 'Checklist' },
  { type: 'quote', label: 'Quote' },
  { type: 'callout', label: 'Callout' },
  { type: 'code', label: 'Code Block' },
  { type: 'simple_table', label: 'Simple Table (Grid)' },
  { type: 'divider', label: 'Divider' },
  { type: 'link', label: 'Web Link' },
  { type: 'image', label: 'Image Block' },
  { type: 'file', label: 'File Attachment Block' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getChecklistItems(block: PageBlock): ChecklistItem[] {
  if (block.checklistItems && block.checklistItems.length > 0) {
    return block.checklistItems;
  }
  const lines = (block.content || '').split('\n');
  return lines.map((line, idx) => ({
    id: `${block.id}-chk-${idx}`,
    text: line,
    checked: !!block.checked,
  }));
}

function buildFallbackImageDataUrl(file: WorkspaceFile): string {
  if (file.dataUrl) return file.dataUrl;
  const safeName = file.name.replace(/[<>&"']/g, '');
  const safeSnippet = (file.extractedText || '').slice(0, 90).replace(/[<>&"']/g, '');
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><rect width="600" height="240" rx="16" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2"/><text x="28" y="52" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1E293B">${safeName}</text><text x="28" y="88" font-family="sans-serif" font-size="12" fill="#475569">${safeSnippet}</text></svg>`
    )
  );
}

const TEXT_COLOR_SWATCHES = [
  { id: 'red', label: 'Red', hex: '#E11D48', className: 'text-rose-600 dark:text-rose-400' },
  { id: 'blue', label: 'Blue', hex: '#2563EB', className: 'text-blue-600 dark:text-blue-400' },
  { id: 'green', label: 'Green', hex: '#059669', className: 'text-emerald-600 dark:text-emerald-400' },
  { id: 'purple', label: 'Purple', hex: '#7C3AED', className: 'text-violet-600 dark:text-violet-400' },
  { id: 'orange', label: 'Orange', hex: '#D97706', className: 'text-amber-600 dark:text-amber-400' },
  { id: 'teal', label: 'Teal', hex: '#0D9488', className: 'text-teal-600 dark:text-teal-400' },
];

const HIGHLIGHT_COLOR_SWATCHES = [
  {
    id: 'yellow',
    label: 'Yellow Highlight',
    hex: '#FEF08A',
    className: 'bg-yellow-200/90 dark:bg-yellow-500/30 text-slate-900 dark:text-yellow-100 px-1 rounded',
  },
  {
    id: 'green',
    label: 'Green Highlight',
    hex: '#BBF7D0',
    className: 'bg-emerald-200/80 dark:bg-emerald-500/30 text-slate-900 dark:text-emerald-100 px-1 rounded',
  },
  {
    id: 'blue',
    label: 'Blue Highlight',
    hex: '#BAE6FD',
    className: 'bg-sky-200/80 dark:bg-sky-500/30 text-slate-900 dark:text-sky-100 px-1 rounded',
  },
  {
    id: 'pink',
    label: 'Pink Highlight',
    hex: '#FBCFE8',
    className: 'bg-pink-200/80 dark:bg-pink-500/30 text-slate-900 dark:text-pink-100 px-1 rounded',
  },
  {
    id: 'purple',
    label: 'Purple Highlight',
    hex: '#E9D5FF',
    className: 'bg-purple-200/80 dark:bg-purple-500/30 text-slate-900 dark:text-purple-100 px-1 rounded',
  },
];

/**
 * Recursive inline Markdown renderer for Display View:
 * Supports **bold**, *italic*, __underline__, ~~strikethrough~~, ==highlight==,
 * {color:name}text{/color}, {hl:name}text{/hl}, `code`, [label](url), and nested combinations.
 */
function renderFormattedInlineText(text: string, keyPrefix = 'fmt'): React.ReactNode {
  if (!text) return null;

  // Tokenize earliest match among:
  // 1. Links: [label](url)
  // 2. Inline code: `code`
  // 3. Colored text: {color:name}text{/color}
  // 4. Colored highlight: {hl:name}text{/hl}
  // 5. Standard Markdown highlight: ==text==
  // 6. Strikethrough: ~~text~~
  // 7. Bold + Italic: ***text***
  // 8. Bold: **text**
  // 9. Underline: __text__
  // 10. Italic: *text* (where not **)
  const pattern =
    /(\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^\s)]+)\))|(`([^`]+)`)|(\{color:([a-zA-Z0-9#]+)\}([\s\S]+?)\{\/color\})|(\{hl:([a-zA-Z0-9#]+)\}([\s\S]+?)\{\/hl\})|(==([\s\S]+?)==)|(~~([\s\S]+?)~~)|(\*\*\*([\s\S]+?)\*\*\*)|(\*\*([\s\S]+?)\*\*)|(__(.+?)__)|(\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*)/g;

  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let partIdx = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const currentKey = `${keyPrefix}-${partIdx++}`;

    if (match[1]) {
      // [label](url)
      const label = match[2];
      const url = match[3];
      nodes.push(
        <a
          key={currentKey}
          href={url}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-700 font-medium"
        >
          {renderFormattedInlineText(label, `${currentKey}-lnk`)}
        </a>
      );
    } else if (match[4]) {
      // `code`
      nodes.push(
        <code
          key={currentKey}
          className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.88em] text-indigo-600 dark:text-indigo-300"
        >
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      // {color:name}text{/color}
      const colorId = match[7].toLowerCase();
      const inner = match[8];
      const preset = TEXT_COLOR_SWATCHES.find((c) => c.id === colorId);
      nodes.push(
        <span
          key={currentKey}
          className={preset ? `${preset.className} font-medium` : 'font-medium'}
          style={!preset ? { color: colorId } : undefined}
        >
          {renderFormattedInlineText(inner, `${currentKey}-col`)}
        </span>
      );
    } else if (match[9]) {
      // {hl:name}text{/hl}
      const hlId = match[10].toLowerCase();
      const inner = match[11];
      const preset =
        HIGHLIGHT_COLOR_SWATCHES.find((h) => h.id === hlId) || HIGHLIGHT_COLOR_SWATCHES[0];
      nodes.push(
        <mark key={currentKey} className={preset.className}>
          {renderFormattedInlineText(inner, `${currentKey}-hl`)}
        </mark>
      );
    } else if (match[12]) {
      // ==highlight==
      nodes.push(
        <mark key={currentKey} className={HIGHLIGHT_COLOR_SWATCHES[0].className}>
          {renderFormattedInlineText(match[13], `${currentKey}-eqhl`)}
        </mark>
      );
    } else if (match[14]) {
      // ~~strikethrough~~
      nodes.push(
        <del key={currentKey} className="line-through opacity-75">
          {renderFormattedInlineText(match[15], `${currentKey}-del`)}
        </del>
      );
    } else if (match[16]) {
      // ***bold italic***
      nodes.push(
        <strong key={currentKey} className="font-bold text-slate-900 dark:text-white">
          <em className="italic">
            {renderFormattedInlineText(match[17], `${currentKey}-bi`)}
          </em>
        </strong>
      );
    } else if (match[18]) {
      // **bold**
      nodes.push(
        <strong key={currentKey} className="font-bold text-slate-900 dark:text-white">
          {renderFormattedInlineText(match[19], `${currentKey}-b`)}
        </strong>
      );
    } else if (match[20]) {
      // __underline__
      nodes.push(
        <u key={currentKey} className="underline underline-offset-2 decoration-indigo-500/70">
          {renderFormattedInlineText(match[21], `${currentKey}-u`)}
        </u>
      );
    } else if (match[22]) {
      // *italic*
      nodes.push(
        <em key={currentKey} className="italic">
          {renderFormattedInlineText(match[23], `${currentKey}-i`)}
        </em>
      );
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 1 ? nodes[0] : nodes;
}

/**
 * Toggles '**' (Bold), '*' (Italic), or '__' (Underline) on the marked/selected range
 * inside `text` without repeatedly adding markers or formatting the entire paragraph when
 * a substring is selected.
 */
function toggleInlineFormatRange(
  text: string,
  rawStart: number,
  rawEnd: number,
  marker: '**' | '*' | '__'
): { nextText: string; nextSelStart: number; nextSelEnd: number } {
  let start = Math.max(0, Math.min(rawStart, text.length));
  let end = Math.max(start, Math.min(rawEnd, text.length));

  // If no characters are selected, check if cursor is inside a word or inside existing markers
  if (start === end) {
    if (text.length === 0) {
      const placeholder = 'text';
      const nextText = `${marker}${placeholder}${marker}`;
      return {
        nextText,
        nextSelStart: marker.length,
        nextSelEnd: marker.length + placeholder.length,
      };
    }

    // Find word boundaries around the cursor (including surrounding * or _)
    let wStart = start;
    let wEnd = end;
    while (wStart > 0 && !/\s/.test(text[wStart - 1])) {
      wStart--;
    }
    while (wEnd < text.length && !/\s/.test(text[wEnd])) {
      wEnd++;
    }

    if (wStart < wEnd) {
      start = wStart;
      end = wEnd;
    } else {
      // Cursor is on whitespace; toggle entire text if non-empty
      start = 0;
      end = text.length;
    }
  } else {
    // If user selected text with leading/trailing spaces (and not starting with markers), trim selection bounds
    const rawSlice = text.slice(start, end);
    if (
      rawSlice.trim().length > 0 &&
      !rawSlice.startsWith('*') &&
      !rawSlice.startsWith('_') &&
      !rawSlice.endsWith('*') &&
      !rawSlice.endsWith('_')
    ) {
      const leadingSpaces = rawSlice.length - rawSlice.trimStart().length;
      const trailingSpaces = rawSlice.length - rawSlice.trimEnd().length;
      if (start + leadingSpaces < end - trailingSpaces) {
        start += leadingSpaces;
        end -= trailingSpaces;
      }
    }
  }

  // Expand outward to capture any immediately adjacent formatting markers (* or _)
  let outerStart = start;
  let outerEnd = end;
  while (outerStart > 0 && (text[outerStart - 1] === '*' || text[outerStart - 1] === '_')) {
    outerStart--;
  }
  while (outerEnd < text.length && (text[outerEnd] === '*' || text[outerEnd] === '_')) {
    outerEnd++;
  }

  // Shrink inward to isolate the core text inside any leading/trailing * or _ markers
  let innerStart = start;
  let innerEnd = end;
  while (
    innerStart < innerEnd &&
    (text[innerStart] === '*' || text[innerStart] === '_')
  ) {
    innerStart++;
  }
  while (
    innerEnd > innerStart &&
    (text[innerEnd - 1] === '*' || text[innerEnd - 1] === '_')
  ) {
    innerEnd--;
  }

  const prefix = text.slice(outerStart, innerStart);
  const suffix = text.slice(innerEnd, outerEnd);
  const coreText = text.slice(innerStart, innerEnd);

  const prefixStars = (prefix.match(/\*/g) || []).length;
  const suffixStars = (suffix.match(/\*/g) || []).length;
  const matchedStars = Math.min(prefixStars, suffixStars);

  const prefixUnderscores = (prefix.match(/_/g) || []).length;
  const suffixUnderscores = (suffix.match(/_/g) || []).length;
  const matchedUnderscores = Math.min(prefixUnderscores, suffixUnderscores);

  const isSymmetricWrapper =
    prefixStars === suffixStars &&
    prefixUnderscores === suffixUnderscores &&
    (prefixUnderscores === 0 || prefixUnderscores === 2) &&
    prefixStars <= 3;

  if (isSymmetricWrapper) {
    let isBold = matchedStars === 2 || matchedStars === 3;
    let isItalic = matchedStars === 1 || matchedStars === 3;
    let isUnderline = matchedUnderscores === 2;

    if (marker === '**') isBold = !isBold;
    else if (marker === '*') isItalic = !isItalic;
    else if (marker === '__') isUnderline = !isUnderline;

    const openMarker =
      (isUnderline ? '__' : '') + (isBold ? '**' : '') + (isItalic ? '*' : '');
    const closeMarker =
      (isItalic ? '*' : '') + (isBold ? '**' : '') + (isUnderline ? '__' : '');

    const nextText =
      text.slice(0, outerStart) + openMarker + coreText + closeMarker + text.slice(outerEnd);
    const nextSelStart = outerStart + openMarker.length;
    const nextSelEnd = nextSelStart + coreText.length;

    return { nextText, nextSelStart, nextSelEnd };
  }

  // Fallback direct check on selected text or immediate neighbours
  const selected = text.slice(start, end);
  const mLen = marker.length;
  if (
    selected.startsWith(marker) &&
    selected.endsWith(marker) &&
    selected.length >= mLen * 2
  ) {
    const inner = selected.slice(mLen, selected.length - mLen);
    return {
      nextText: text.slice(0, start) + inner + text.slice(end),
      nextSelStart: start,
      nextSelEnd: start + inner.length,
    };
  }

  if (
    start >= mLen &&
    text.slice(start - mLen, start) === marker &&
    text.slice(end, end + mLen) === marker
  ) {
    return {
      nextText: text.slice(0, start - mLen) + selected + text.slice(end + mLen),
      nextSelStart: start - mLen,
      nextSelEnd: end - mLen,
    };
  }

  return {
    nextText: text.slice(0, start) + marker + selected + marker + text.slice(end),
    nextSelStart: start + mLen,
    nextSelEnd: end + mLen,
  };
}

interface ActiveInputRecord {
  itemIdx: number;
  selectionStart: number;
  selectionEnd: number;
}

export const PageBlockEditor: React.FC<{ page: PageDocument }> = ({ page }) => {
  const {
    state,
    updatePage,
    restorePageVersion,
    createAgentProposalForPage,
    moveItemToLocation,
    deletePageToTrash,
    uploadWorkspaceFile,
    setSelectedFileId,
    setActiveProjectFile,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);
  const isHe = state.settings.language === 'he';

  // 1. Distinguish between Display View (default) and Edit Mode
  const [isEditMode, setIsEditMode] = useState(false);

  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [agentEditPrompt, setAgentEditPrompt] = useState('');
  const [showAgentEditBox, setShowAgentEditBox] = useState(false);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const [openStylePicker, setOpenStylePicker] = useState<{
    blockId: string;
    kind: 'color' | 'highlight';
  } | null>(null);

  // Refs to inputs/textareas inside blocks (keyed by `${blockId}:${itemIdx}`)
  const inputRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});
  // Last active item index & selection range for each blockId
  const activeSelectionByBlockRef = useRef<Record<string, ActiveInputRecord>>({});
  // Hidden computer file inputs for image & file blocks
  const blockFileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Reset to Display View when switching to a different page
  useEffect(() => {
    setIsEditMode(false);
  }, [page.id]);

  const pendingProposals = state.editProposals.filter(
    (ep) => ep.targetType === 'page' && ep.targetId === page.id && ep.status === 'pending'
  );

  // Available files in the current project (and fallback to all non-deleted workspace files)
  const projectFiles = useMemo(
    () => state.files.filter((f) => !f.isDeleted && f.projectId === page.projectId),
    [state.files, page.projectId]
  );

  const allAvailableFiles = useMemo(() => {
    const others = state.files.filter(
      (f) => !f.isDeleted && f.projectId !== page.projectId
    );
    return [...projectFiles, ...others];
  }, [projectFiles, state.files, page.projectId]);

  const recordInputSelection = (
    blockId: string,
    itemIdx: number,
    el: HTMLInputElement | HTMLTextAreaElement | null
  ) => {
    if (!el) return;
    activeSelectionByBlockRef.current[blockId] = {
      itemIdx,
      selectionStart: el.selectionStart ?? 0,
      selectionEnd: el.selectionEnd ?? 0,
    };
  };

  const focusBlockItem = (
    blockId: string,
    itemIdx: number,
    selStart?: number,
    selEnd?: number
  ) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[`${blockId}:${itemIdx}`];
      if (el) {
        el.focus();
        if (typeof selStart === 'number') {
          const endPos = typeof selEnd === 'number' ? selEnd : selStart;
          el.setSelectionRange(selStart, endPos);
          activeSelectionByBlockRef.current[blockId] = {
            itemIdx,
            selectionStart: selStart,
            selectionEnd: endPos,
          };
        }
      }
    });
  };

  const updateBlock = (blockId: string, patch: Partial<PageBlock>) => {
    const now = new Date().toISOString();
    const nextBlocks = page.blocks.map((b) =>
      b.id === blockId ? { ...b, ...patch, updatedAt: now } : b
    );
    updatePage(page.id, { blocks: nextBlocks });
  };

  const addBlockAfter = (afterIndex: number, type: BlockType = 'paragraph') => {
    const now = new Date().toISOString();
    const newBlockId = `blk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newBlock: PageBlock = {
      id: newBlockId,
      type,
      content: type === 'simple_table' ? 'Table' : '',
      checked: type === 'checklist' ? false : undefined,
      checklistItems:
        type === 'checklist'
          ? [{ id: `${newBlockId}-chk-0`, text: '', checked: false }]
          : undefined,
      codeLanguage: type === 'code' ? 'typescript' : undefined,
      tableData:
        type === 'simple_table'
          ? {
              headers: ['Column 1', 'Column 2', 'Column 3'],
              rows: [
                ['Cell 1', 'Cell 2', 'Cell 3'],
                ['Cell 4', 'Cell 5', 'Cell 6'],
              ],
            }
          : undefined,
      dir: 'auto',
      updatedAt: now,
    };
    const nextBlocks = [...page.blocks];
    nextBlocks.splice(afterIndex + 1, 0, newBlock);
    updatePage(page.id, { blocks: nextBlocks });
    focusBlockItem(newBlockId, 0, 0, 0);
  };

  const removeBlock = (blockId: string) => {
    if (page.blocks.length <= 1) return;
    updatePage(page.id, {
      blocks: page.blocks.filter((b) => b.id !== blockId),
    });
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= page.blocks.length) return;
    const nextBlocks = [...page.blocks];
    const [moved] = nextBlocks.splice(index, 1);
    nextBlocks.splice(targetIdx, 0, moved);
    updatePage(page.id, { blocks: nextBlocks });
  };

  /**
   * 2. Toggle Bold (**), Italic (*), Underline (__), Strikethrough (~~),
   * Inline Code (`), Highlight (== / {hl:color}), Text Color ({color:name}), or Link on marked text.
   */
  const applyInlineFormat = (
    block: PageBlock,
    wrapper:
      | '**'
      | '*'
      | '__'
      | '~~'
      | '`'
      | '=='
      | 'link'
      | `color:${string}`
      | `hl:${string}`
  ) => {
    const activeRecord = activeSelectionByBlockRef.current[block.id] || {
      itemIdx: 0,
      selectionStart: 0,
      selectionEnd: 0,
    };
    const itemIdx = activeRecord.itemIdx;
    const activeEl = inputRefs.current[`${block.id}:${itemIdx}`];

    // Get up-to-date selection directly from the DOM element if available
    const selStart =
      activeEl && typeof activeEl.selectionStart === 'number'
        ? activeEl.selectionStart
        : activeRecord.selectionStart;
    const selEnd =
      activeEl && typeof activeEl.selectionEnd === 'number'
        ? activeEl.selectionEnd
        : activeRecord.selectionEnd;

    // Determine the target text string (either a specific list/checklist item or block.content)
    const isMultiLineList =
      block.type === 'bullet_list' || block.type === 'numbered_list';
    const isChecklist = block.type === 'checklist';

    let currentItemText = block.content;
    if (isChecklist) {
      const chkItems = getChecklistItems(block);
      currentItemText = chkItems[itemIdx]?.text ?? '';
    } else if (isMultiLineList) {
      const lines = (block.content || '').split('\n');
      currentItemText = lines[itemIdx] ?? '';
    }

    const commitFormattedItemText = (
      nextItemText: string,
      nextSelStart: number,
      nextSelEnd: number
    ) => {
      if (isChecklist) {
        const chkItems = [...getChecklistItems(block)];
        if (chkItems[itemIdx]) {
          chkItems[itemIdx] = { ...chkItems[itemIdx], text: nextItemText };
        }
        updateBlock(block.id, {
          checklistItems: chkItems,
          content: chkItems.map((it) => it.text).join('\n'),
          checked: chkItems.every((it) => it.checked),
        });
      } else if (isMultiLineList) {
        const lines = (block.content || '').split('\n');
        lines[itemIdx] = nextItemText;
        updateBlock(block.id, { content: lines.join('\n') });
      } else {
        updateBlock(block.id, { content: nextItemText });
      }
      focusBlockItem(block.id, itemIdx, nextSelStart, nextSelEnd);
    };

    if (wrapper === 'link') {
      const selectedSlice = currentItemText.slice(selStart, selEnd);
      const existingLinkMatch = selectedSlice.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (existingLinkMatch) {
        const label = existingLinkMatch[1];
        const nextText =
          currentItemText.slice(0, selStart) + label + currentItemText.slice(selEnd);
        commitFormattedItemText(nextText, selStart, selStart + label.length);
        return;
      }

      const url = window.prompt('Enter link URL:', 'https://');
      if (!url) return;
      const label = selectedSlice || 'Link';
      const markdownLink = `[${label}](${url})`;
      const nextText =
        selStart !== selEnd
          ? currentItemText.slice(0, selStart) +
            markdownLink +
            currentItemText.slice(selEnd)
          : `${currentItemText}${currentItemText ? ' ' : ''}${markdownLink}`;
      const newStart = selStart !== selEnd ? selStart : nextText.length - markdownLink.length;
      commitFormattedItemText(nextText, newStart, newStart + markdownLink.length);
      return;
    }

    // Handle Text Color ({color:name}text{/color}) or Highlight Color ({hl:name}text{/hl})
    if (wrapper.startsWith('color:') || wrapper.startsWith('hl:')) {
      const isColor = wrapper.startsWith('color:');
      const tagType = isColor ? 'color' : 'hl';
      const chosenValue = wrapper.slice(tagType.length + 1);

      let tStart = selStart;
      let tEnd = selEnd;
      if (tStart === tEnd) {
        while (tStart > 0 && !/\s/.test(currentItemText[tStart - 1])) tStart--;
        while (tEnd < currentItemText.length && !/\s/.test(currentItemText[tEnd])) tEnd++;
      }

      // Check if selection is inside an existing {color:...}...{/color} or {hl:...}...{/hl}
      const openRegex = new RegExp(`\\{${tagType}:([a-zA-Z0-9#]+)\\}$`);
      const closeTag = `{/${tagType}}`;
      const beforeText = currentItemText.slice(0, tStart);
      const afterText = currentItemText.slice(tEnd);
      const selectedText = currentItemText.slice(tStart, tEnd);

      // Case 1: Selected text itself includes {tag:val}inner{/tag}
      const fullTagRegex = new RegExp(
        `^\\{${tagType}:([a-zA-Z0-9#]+)\\}([\\s\\S]*?)\\{\\/${tagType}\\}$`
      );
      const selfMatch = selectedText.match(fullTagRegex);
      if (selfMatch) {
        const existingVal = selfMatch[1];
        const inner = selfMatch[2];
        if (chosenValue === 'none' || existingVal === chosenValue) {
          const nextText = beforeText + inner + afterText;
          commitFormattedItemText(nextText, tStart, tStart + inner.length);
        } else {
          const newOpen = `{${tagType}:${chosenValue}}`;
          const nextText = beforeText + newOpen + inner + closeTag + afterText;
          commitFormattedItemText(
            nextText,
            tStart + newOpen.length,
            tStart + newOpen.length + inner.length
          );
        }
        setOpenStylePicker(null);
        return;
      }

      // Case 2: Surrounding text immediately wraps selection with {tag:val} and {/tag}
      const beforeMatch = beforeText.match(openRegex);
      if (beforeMatch && afterText.startsWith(closeTag)) {
        const existingVal = beforeMatch[1];
        const openLen = beforeMatch[0].length;
        const cleanBefore = beforeText.slice(0, beforeText.length - openLen);
        const cleanAfter = afterText.slice(closeTag.length);

        if (chosenValue === 'none' || existingVal === chosenValue) {
          const nextText = cleanBefore + selectedText + cleanAfter;
          commitFormattedItemText(
            nextText,
            cleanBefore.length,
            cleanBefore.length + selectedText.length
          );
        } else {
          const newOpen = `{${tagType}:${chosenValue}}`;
          const nextText = cleanBefore + newOpen + selectedText + closeTag + cleanAfter;
          commitFormattedItemText(
            nextText,
            cleanBefore.length + newOpen.length,
            cleanBefore.length + newOpen.length + selectedText.length
          );
        }
        setOpenStylePicker(null);
        return;
      }

      if (chosenValue === 'none') {
        setOpenStylePicker(null);
        return;
      }

      const targetContent = selectedText || 'text';
      const newOpen = `{${tagType}:${chosenValue}}`;
      const nextText = beforeText + newOpen + targetContent + closeTag + afterText;
      const newSelStart = beforeText.length + newOpen.length;
      commitFormattedItemText(nextText, newSelStart, newSelStart + targetContent.length);
      setOpenStylePicker(null);
      return;
    }

    // Handle symmetric markers '~~', '`', '=='
    if (wrapper === '~~' || wrapper === '`' || wrapper === '==') {
      let tStart = selStart;
      let tEnd = selEnd;
      if (tStart === tEnd) {
        while (tStart > 0 && !/\s/.test(currentItemText[tStart - 1])) tStart--;
        while (tEnd < currentItemText.length && !/\s/.test(currentItemText[tEnd])) tEnd++;
      }
      const mLen = wrapper.length;
      const selected = currentItemText.slice(tStart, tEnd);
      if (
        selected.startsWith(wrapper) &&
        selected.endsWith(wrapper) &&
        selected.length >= mLen * 2
      ) {
        const inner = selected.slice(mLen, selected.length - mLen);
        const nextText =
          currentItemText.slice(0, tStart) + inner + currentItemText.slice(tEnd);
        commitFormattedItemText(nextText, tStart, tStart + inner.length);
        return;
      }
      if (
        tStart >= mLen &&
        currentItemText.slice(tStart - mLen, tStart) === wrapper &&
        currentItemText.slice(tEnd, tEnd + mLen) === wrapper
      ) {
        const nextText =
          currentItemText.slice(0, tStart - mLen) +
          selected +
          currentItemText.slice(tEnd + mLen);
        commitFormattedItemText(nextText, tStart - mLen, tEnd - mLen);
        return;
      }
      const targetContent = selected || 'text';
      const nextText =
        currentItemText.slice(0, tStart) +
        wrapper +
        targetContent +
        wrapper +
        currentItemText.slice(tEnd);
      commitFormattedItemText(
        nextText,
        tStart + mLen,
        tStart + mLen + targetContent.length
      );
      return;
    }

    const { nextText, nextSelStart, nextSelEnd } = toggleInlineFormatRange(
      currentItemText,
      selStart,
      selEnd,
      wrapper as '**' | '*' | '__'
    );
    commitFormattedItemText(nextText, nextSelStart, nextSelEnd);
  };

  // Keyboard shortcuts Ctrl+B, Ctrl+I, Ctrl+U for inline formatting inside any block input
  const handleFormattingShortcutKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    block: PageBlock
  ) => {
    if (e.ctrlKey || e.metaKey) {
      const key = e.key.toLowerCase();
      if (key === 'b') {
        e.preventDefault();
        applyInlineFormat(block, '**');
      } else if (key === 'i') {
        e.preventDefault();
        applyInlineFormat(block, '*');
      } else if (key === 'u') {
        e.preventDefault();
        applyInlineFormat(block, '__');
      }
    }
  };

  /**
   * 3. Handle Enter & Backspace in Bulleted List & Numbered List blocks
   */
  const handleListItemKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    block: PageBlock,
    itemIdx: number
  ) => {
    handleFormattingShortcutKeyDown(e, block);
    if (e.defaultPrevented) return;

    const lines = (block.content || '').split('\n');
    const currentText = lines[itemIdx] ?? '';
    const cursorStart = e.currentTarget.selectionStart ?? currentText.length;
    const cursorEnd = e.currentTarget.selectionEnd ?? currentText.length;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const beforeCursor = currentText.slice(0, cursorStart);
      const afterCursor = currentText.slice(cursorEnd);
      const nextLines = [...lines];
      nextLines[itemIdx] = beforeCursor;
      nextLines.splice(itemIdx + 1, 0, afterCursor);
      updateBlock(block.id, { content: nextLines.join('\n') });
      focusBlockItem(block.id, itemIdx + 1, 0, 0);
    } else if (
      e.key === 'Backspace' &&
      cursorStart === 0 &&
      cursorEnd === 0 &&
      lines.length > 1
    ) {
      e.preventDefault();
      if (itemIdx > 0) {
        const prevText = lines[itemIdx - 1];
        const mergePos = prevText.length;
        const nextLines = [...lines];
        nextLines[itemIdx - 1] = prevText + currentText;
        nextLines.splice(itemIdx, 1);
        updateBlock(block.id, { content: nextLines.join('\n') });
        focusBlockItem(block.id, itemIdx - 1, mergePos, mergePos);
      } else if (currentText === '') {
        const nextLines = lines.slice(1);
        updateBlock(block.id, { content: nextLines.join('\n') });
        focusBlockItem(block.id, 0, 0, 0);
      }
    } else if (e.key === 'ArrowUp' && itemIdx > 0) {
      e.preventDefault();
      focusBlockItem(block.id, itemIdx - 1, cursorStart, cursorStart);
    } else if (e.key === 'ArrowDown' && itemIdx < lines.length - 1) {
      e.preventDefault();
      focusBlockItem(block.id, itemIdx + 1, cursorStart, cursorStart);
    }
  };

  /**
   * 3. Handle Enter & Backspace in Checklist blocks
   */
  const handleChecklistItemKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    block: PageBlock,
    itemIdx: number
  ) => {
    handleFormattingShortcutKeyDown(e, block);
    if (e.defaultPrevented) return;

    const items = getChecklistItems(block);
    const currentItem = items[itemIdx] || {
      id: `${block.id}-chk-${itemIdx}`,
      text: '',
      checked: false,
    };
    const cursorStart = e.currentTarget.selectionStart ?? currentItem.text.length;
    const cursorEnd = e.currentTarget.selectionEnd ?? currentItem.text.length;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const beforeCursor = currentItem.text.slice(0, cursorStart);
      const afterCursor = currentItem.text.slice(cursorEnd);
      const nextItems = [...items];
      nextItems[itemIdx] = { ...currentItem, text: beforeCursor };
      nextItems.splice(itemIdx + 1, 0, {
        id: `${block.id}-chk-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        text: afterCursor,
        checked: false,
      });
      updateBlock(block.id, {
        checklistItems: nextItems,
        content: nextItems.map((it) => it.text).join('\n'),
        checked: nextItems.every((it) => it.checked),
      });
      focusBlockItem(block.id, itemIdx + 1, 0, 0);
    } else if (
      e.key === 'Backspace' &&
      cursorStart === 0 &&
      cursorEnd === 0 &&
      items.length > 1
    ) {
      e.preventDefault();
      if (itemIdx > 0) {
        const prevItem = items[itemIdx - 1];
        const mergePos = prevItem.text.length;
        const nextItems = [...items];
        nextItems[itemIdx - 1] = {
          ...prevItem,
          text: prevItem.text + currentItem.text,
        };
        nextItems.splice(itemIdx, 1);
        updateBlock(block.id, {
          checklistItems: nextItems,
          content: nextItems.map((it) => it.text).join('\n'),
          checked: nextItems.every((it) => it.checked),
        });
        focusBlockItem(block.id, itemIdx - 1, mergePos, mergePos);
      } else if (currentItem.text === '') {
        const nextItems = items.slice(1);
        updateBlock(block.id, {
          checklistItems: nextItems,
          content: nextItems.map((it) => it.text).join('\n'),
          checked: nextItems.every((it) => it.checked),
        });
        focusBlockItem(block.id, 0, 0, 0);
      }
    } else if (e.key === 'ArrowUp' && itemIdx > 0) {
      e.preventDefault();
      focusBlockItem(block.id, itemIdx - 1, cursorStart, cursorStart);
    } else if (e.key === 'ArrowDown' && itemIdx < items.length - 1) {
      e.preventDefault();
      focusBlockItem(block.id, itemIdx + 1, cursorStart, cursorStart);
    }
  };

  const toggleChecklistItemChecked = (block: PageBlock, itemIdx: number) => {
    const items = [...getChecklistItems(block)];
    if (!items[itemIdx]) return;
    items[itemIdx] = { ...items[itemIdx], checked: !items[itemIdx].checked };
    updateBlock(block.id, {
      checklistItems: items,
      content: items.map((it) => it.text).join('\n'),
      checked: items.every((it) => it.checked),
    });
  };

  const updateChecklistItemText = (block: PageBlock, itemIdx: number, text: string) => {
    const items = [...getChecklistItems(block)];
    if (!items[itemIdx]) return;
    items[itemIdx] = { ...items[itemIdx], text };
    updateBlock(block.id, {
      checklistItems: items,
      content: items.map((it) => it.text).join('\n'),
      checked: items.every((it) => it.checked),
    });
  };

  /**
   * 4. Attach a Project File or Computer File to an Image Block or File Attachment Block
   */
  const attachProjectFileToBlock = (block: PageBlock, wsFile: WorkspaceFile) => {
    if (block.type === 'image') {
      const resolvedUrl = buildFallbackImageDataUrl(wsFile);
      updateBlock(block.id, {
        fileId: wsFile.id,
        imageUrl: resolvedUrl,
        linkTitle: wsFile.name,
        content: block.content || wsFile.name,
      });
    } else {
      updateBlock(block.id, {
        fileId: wsFile.id,
        linkTitle: wsFile.name,
        linkUrl: wsFile.driveWebViewLink || wsFile.dataUrl || '',
        content: block.content || wsFile.name,
      });
    }
  };

  const handleComputerFilesForBlock = async (block: PageBlock, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    setUploadingBlockId(block.id);
    try {
      const uploaded = await uploadWorkspaceFile(file, page.projectId, page.folderId);
      attachProjectFileToBlock(block, uploaded);
    } finally {
      setUploadingBlockId(null);
    }
  };

  const handleBlockDrop = async (e: React.DragEvent, block: PageBlock) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverBlockId(null);

    // 1. Check if dragged from Project Files (sidebar tree or project file chip)
    const projectFileId = e.dataTransfer.getData('application/x-memoryhub-file-id');
    if (projectFileId) {
      const found = state.files.find((f) => f.id === projectFileId);
      if (found) {
        attachProjectFileToBlock(block, found);
        return;
      }
    }

    // 2. Check if dragged from Computer (OS File Explorer)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleComputerFilesForBlock(block, e.dataTransfer.files);
      return;
    }

    // 3. Check if an image URL / link was dragged
    const uri =
      e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri && (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:'))) {
      if (block.type === 'image') {
        updateBlock(block.id, { imageUrl: uri.trim() });
      } else if (block.type === 'file') {
        updateBlock(block.id, { linkUrl: uri.trim(), linkTitle: uri.trim() });
      }
    }
  };

  // Simple Table Helpers (FR-3.2: add, remove, reorder rows and columns)
  const updateTableCell = (
    block: PageBlock,
    rowIdx: number | 'header',
    colIdx: number,
    value: string
  ) => {
    const td: SimpleTableData = block.tableData || { headers: ['Col 1'], rows: [['']] };
    if (rowIdx === 'header') {
      const nextHeaders = [...td.headers];
      nextHeaders[colIdx] = value;
      updateBlock(block.id, { tableData: { ...td, headers: nextHeaders } });
    } else {
      const nextRows = td.rows.map((r, rIdx) =>
        rIdx === rowIdx ? r.map((c, cIdx) => (cIdx === colIdx ? value : c)) : r
      );
      updateBlock(block.id, { tableData: { ...td, rows: nextRows } });
    }
  };

  const addTableRow = (block: PageBlock) => {
    const td: SimpleTableData = block.tableData || { headers: ['Col 1'], rows: [] };
    const emptyRow = td.headers.map(() => '');
    updateBlock(block.id, {
      tableData: { ...td, rows: [...td.rows, emptyRow] },
    });
  };

  const removeTableRow = (block: PageBlock, rowIdx: number) => {
    const td = block.tableData;
    if (!td || td.rows.length <= 1) return;
    updateBlock(block.id, {
      tableData: { ...td, rows: td.rows.filter((_, idx) => idx !== rowIdx) },
    });
  };

  const moveTableRow = (block: PageBlock, rowIdx: number, dir: -1 | 1) => {
    const td = block.tableData;
    if (!td) return;
    const target = rowIdx + dir;
    if (target < 0 || target >= td.rows.length) return;
    const nextRows = [...td.rows];
    const [moved] = nextRows.splice(rowIdx, 1);
    nextRows.splice(target, 0, moved);
    updateBlock(block.id, { tableData: { ...td, rows: nextRows } });
  };

  const addTableColumn = (block: PageBlock) => {
    const td: SimpleTableData = block.tableData || { headers: [], rows: [] };
    const nextHeaders = [...td.headers, `Column ${td.headers.length + 1}`];
    const nextRows = td.rows.map((r) => [...r, '']);
    updateBlock(block.id, {
      tableData: { headers: nextHeaders, rows: nextRows },
    });
  };

  const removeTableColumn = (block: PageBlock, colIdx: number) => {
    const td = block.tableData;
    if (!td || td.headers.length <= 1) return;
    updateBlock(block.id, {
      tableData: {
        headers: td.headers.filter((_, i) => i !== colIdx),
        rows: td.rows.map((r) => r.filter((_, i) => i !== colIdx)),
      },
    });
  };

  const exportPageAsMarkdown = () => {
    const lines: string[] = [`# ${page.title}\n`];
    page.blocks.forEach((b) => {
      if (b.type === 'heading1') lines.push(`# ${b.content}\n`);
      else if (b.type === 'heading2') lines.push(`## ${b.content}\n`);
      else if (b.type === 'heading3') lines.push(`### ${b.content}\n`);
      else if (b.type === 'bullet_list') {
        (b.content || '').split('\n').forEach((item) => lines.push(`- ${item}`));
        lines.push('');
      } else if (b.type === 'numbered_list') {
        (b.content || '')
          .split('\n')
          .forEach((item, idx) => lines.push(`${idx + 1}. ${item}`));
        lines.push('');
      } else if (b.type === 'checklist') {
        getChecklistItems(b).forEach((item) =>
          lines.push(`- [${item.checked ? 'x' : ' '}] ${item.text}`)
        );
        lines.push('');
      } else if (b.type === 'quote') lines.push(`> ${b.content}\n`);
      else if (b.type === 'code')
        lines.push(`\`\`\`${b.codeLanguage || ''}\n${b.content}\n\`\`\`\n`);
      else if (b.type === 'divider') lines.push(`---\n`);
      else if (b.type === 'image') {
        lines.push(`![${b.content || 'Image'}](${b.imageUrl || ''})\n`);
      } else if (b.type === 'file') {
        const attached = b.fileId ? state.files.find((f) => f.id === b.fileId) : undefined;
        lines.push(
          `📎 [${attached?.name || b.linkTitle || b.content || 'File'}](${
            b.linkUrl || b.fileId || ''
          })\n`
        );
      } else if (b.type === 'simple_table' && b.tableData) {
        lines.push(`| ${b.tableData.headers.join(' | ')} |`);
        lines.push(`| ${b.tableData.headers.map(() => '---').join(' | ')} |`);
        b.tableData.rows.forEach((r) => lines.push(`| ${r.join(' | ')} |`));
        lines.push('');
      } else {
        lines.push(`${b.content}\n`);
      }
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title.replace(/\s+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Compute starting number for numbered_list blocks if there are consecutive numbered_list blocks
  const getNumberedListStartNumber = (blockIndex: number): number => {
    let startNum = 1;
    for (let i = blockIndex - 1; i >= 0; i--) {
      if (page.blocks[i].type === 'numbered_list') {
        startNum += (page.blocks[i].content || '').split('\n').length;
      } else {
        break;
      }
    }
    return startNum;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Page Header & Action Bar */}
      <div className="rounded-xl border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-notion-border dark:border-notion-darkBorder">
          <div className="flex items-center gap-3 flex-1 min-w-[240px]">
            {isEditMode ? (
              <input
                type="text"
                value={page.icon}
                onChange={(e) => updatePage(page.id, { icon: e.target.value })}
                className="w-11 h-11 text-2xl text-center rounded-xl bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder"
                title="Page emoji icon"
              />
            ) : (
              <div className="w-11 h-11 text-2xl flex items-center justify-center rounded-xl bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder select-none">
                {page.icon}
              </div>
            )}

            <div className="flex-1 min-w-0">
              {isEditMode ? (
                <input
                  type="text"
                  dir={detectTextDirection(page.title)}
                  value={page.title}
                  onChange={(e) => updatePage(page.id, { title: e.target.value })}
                  className="w-full text-xl font-bold bg-transparent focus:outline-none border-b border-dashed border-indigo-300 dark:border-indigo-700 pb-0.5"
                  placeholder="Page Title..."
                />
              ) : (
                <h1
                  dir={detectTextDirection(page.title)}
                  className="text-xl font-bold text-slate-900 dark:text-white truncate"
                >
                  {page.title}
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs text-notion-muted dark:text-notion-darkMuted mt-1">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    isEditMode
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300'
                  }`}
                >
                  {isEditMode
                    ? isHe
                      ? 'מצב עריכה'
                      : 'Edit Mode'
                    : isHe
                    ? 'תצוגת קריאה'
                    : 'Display View'}
                </span>
                <span>•</span>
                <span>Updated {new Date(page.updatedAt).toLocaleTimeString()}</span>
                <span>•</span>
                <span>{page.blocks.length} blocks</span>
                {page.createdByAgent && (
                  <span className="px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 font-medium">
                    ✨ Created by AI Agent
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Toggle: Display View <-> Edit Mode */}
            <button
              type="button"
              onClick={() => setIsEditMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-2xs transition ${
                isEditMode
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title={
                isEditMode
                  ? 'Switch to clean Markdown Display View'
                  : 'Switch to Block Edit Mode'
              }
            >
              {isEditMode ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  <span>{isHe ? 'סיום עריכה (תצוגה)' : 'Done Editing'}</span>
                </>
              ) : (
                <>
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isHe ? 'עריכת דף' : 'Edit Page'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAgentEditBox((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {t.pages.proposeAgentEdit}
            </button>

            <button
              type="button"
              onClick={() =>
                updatePage(
                  page.id,
                  {},
                  { reason: 'manual_snapshot', summary: 'Manual checkpoint saved by user' }
                )
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover dark:hover:bg-notion-darkHover border border-notion-border dark:border-notion-darkBorder"
              title="Save a checkpoint in Version History"
            >
              + Checkpoint
            </button>

            <button
              type="button"
              onClick={() => setShowVersionHistory((v) => !v)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover dark:hover:bg-notion-darkHover border border-notion-border dark:border-notion-darkBorder"
            >
              <History className="w-3.5 h-3.5" />
              {t.pages.versionHistory} ({page.versionHistory?.length || 0})
            </button>

            <button
              type="button"
              onClick={exportPageAsMarkdown}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover dark:hover:bg-notion-darkHover border border-notion-border dark:border-notion-darkBorder"
            >
              <Download className="w-3.5 h-3.5" />
              .MD
            </button>

            <button
              type="button"
              onClick={() => setShowMoveMenu((v) => !v)}
              className="p-1.5 rounded-lg bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder text-notion-muted"
              title="Move page to another project or subfolder (FR-1.4)"
            >
              <FolderInput className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => deletePageToTrash(page.id)}
              className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-notion-muted hover:text-rose-600"
              title="Move page to Trash"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Move Page Bar (FR-1.4) */}
        {showMoveMenu && (
          <div className="mt-3 p-3 rounded-lg bg-notion-sidebar dark:bg-notion-darkBg flex flex-wrap items-center gap-3 text-xs">
            <span className="font-semibold">Move Page to:</span>
            <select
              value={page.projectId}
              onChange={(e) => moveItemToLocation('page', page.id, e.target.value, null)}
              className="rounded border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1"
            >
              {state.projects
                .filter((p) => !p.isDeleted)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.icon} {p.name}
                  </option>
                ))}
            </select>
            <select
              value={page.folderId || ''}
              onChange={(e) =>
                moveItemToLocation('page', page.id, page.projectId, e.target.value || null)
              }
              className="rounded border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard px-2.5 py-1"
            >
              <option value="">(Root of Project)</option>
              {state.subfolders
                .filter((sf) => !sf.isDeleted && sf.projectId === page.projectId)
                .map((sf) => (
                  <option key={sf.id} value={sf.id}>
                    {sf.icon} {sf.name}
                  </option>
                ))}
            </select>
          </div>
        )}

        {/* Propose Agent Edit Prompt Bar (FR-7.8, FR-7.9) */}
        {showAgentEditBox && (
          <div className="mt-3 p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              dir={detectTextDirection(agentEditPrompt)}
              value={agentEditPrompt}
              onChange={(e) => setAgentEditPrompt(e.target.value)}
              placeholder="Tell the AI Agent how to edit or expand this page (creates a Side-by-Side Diff Proposal for your approval)..."
              className="flex-1 w-full rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-notion-darkCard px-3 py-1.5 text-xs focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                createAgentProposalForPage(
                  page.id,
                  agentEditPrompt || 'Refine page structure and add executive summary'
                );
                setAgentEditPrompt('');
                setShowAgentEditBox(false);
              }}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold whitespace-nowrap"
            >
              Generate Diff Proposal
            </button>
          </div>
        )}

        {/* Version History Drawer (FR-7.12 & Section 6.5) */}
        {showVersionHistory && (
          <div className="mt-3 p-3.5 rounded-xl bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder space-y-2">
            <div className="text-xs font-semibold flex items-center justify-between">
              <span>Page Version History (FR-7.12 — Undo Agent Edits & Conflict Backups)</span>
              <button
                type="button"
                onClick={() => setShowVersionHistory(false)}
                className="text-notion-muted hover:underline"
              >
                Close
              </button>
            </div>
            {!page.versionHistory || page.versionHistory.length === 0 ? (
              <p className="text-xs text-notion-muted">
                No snapshots yet. Accepting an AI Agent edit or clicking "+ Checkpoint" saves a snapshot here.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {page.versionHistory.map((ver) => (
                  <div
                    key={ver.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-notion-darkCard border border-notion-border dark:border-notion-darkBorder text-xs"
                  >
                    <div>
                      <span className="font-semibold">{ver.summary}</span>
                      <div className="text-[11px] text-notion-muted">
                        {new Date(ver.timestamp).toLocaleString()} • {ver.blocks.length} blocks •{' '}
                        <span className="uppercase">{ver.reason}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => restorePageVersion(page.id, ver.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pending Diff Proposals for this Page (FR-7.9) */}
      {pendingProposals.map((prop) => (
        <DiffReviewCard key={prop.id} proposal={prop} />
      ))}

      {/* =====================================================================
          1. DISPLAY VIEW (Rendered Markdown Page without Block Edit Options)
         ===================================================================== */}
      {!isEditMode ? (
        <article className="rounded-xl border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard p-8 shadow-sm space-y-4">
          {page.blocks.map((block, index) => {
            const computedDir =
              block.dir && block.dir !== 'auto'
                ? block.dir
                : detectTextDirection(
                    block.content,
                    state.settings.language === 'he' ? 'rtl' : 'ltr'
                  );

            if (block.type === 'divider') {
              return (
                <div key={block.id} className="my-5 py-1 flex items-center">
                  <div className="w-full h-[2.5px] rounded-full bg-slate-300 dark:bg-slate-600" />
                </div>
              );
            }

            if (block.type === 'heading1') {
              return (
                <h1
                  key={block.id}
                  dir={computedDir}
                  className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight pt-2 pb-1 border-b border-slate-100 dark:border-slate-800/80"
                >
                  {renderFormattedInlineText(block.content, block.id)}
                </h1>
              );
            }

            if (block.type === 'heading2') {
              return (
                <h2
                  key={block.id}
                  dir={computedDir}
                  className="text-xl font-bold text-slate-800 dark:text-slate-100 pt-2"
                >
                  {renderFormattedInlineText(block.content, block.id)}
                </h2>
              );
            }

            if (block.type === 'heading3') {
              return (
                <h3
                  key={block.id}
                  dir={computedDir}
                  className="text-lg font-semibold text-slate-800 dark:text-slate-200 pt-1"
                >
                  {renderFormattedInlineText(block.content, block.id)}
                </h3>
              );
            }

            if (block.type === 'bullet_list') {
              const items = (block.content || '').split('\n');
              return (
                <ul key={block.id} dir={computedDir} className="space-y-1.5 ps-2">
                  {items.map((item, i) => (
                    <li
                      key={`${block.id}-li-${i}`}
                      dir={detectTextDirection(item, computedDir)}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                    >
                      <span className="text-indigo-500 font-bold select-none mt-0.5">•</span>
                      <span className="flex-1">
                        {renderFormattedInlineText(item, `${block.id}-${i}`)}
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }

            if (block.type === 'numbered_list') {
              const items = (block.content || '').split('\n');
              const startNum = getNumberedListStartNumber(index);
              return (
                <ol key={block.id} dir={computedDir} className="space-y-1.5 ps-2">
                  {items.map((item, i) => (
                    <li
                      key={`${block.id}-oli-${i}`}
                      dir={detectTextDirection(item, computedDir)}
                      className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
                    >
                      <span className="text-xs font-bold text-indigo-500 select-none mt-0.5 min-w-[1.25rem]">
                        {startNum + i}.
                      </span>
                      <span className="flex-1">
                        {renderFormattedInlineText(item, `${block.id}-${i}`)}
                      </span>
                    </li>
                  ))}
                </ol>
              );
            }

            if (block.type === 'checklist') {
              const items = getChecklistItems(block);
              return (
                <div key={block.id} dir={computedDir} className="space-y-1.5 ps-1">
                  {items.map((item, i) => (
                    <label
                      key={item.id}
                      dir={detectTextDirection(item.text, computedDir)}
                      className="flex items-start gap-2.5 text-sm leading-relaxed cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => toggleChecklistItemChecked(block, i)}
                        className="mt-1 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span
                        className={
                          item.checked
                            ? 'line-through text-notion-muted dark:text-notion-darkMuted'
                            : 'text-slate-700 dark:text-slate-200'
                        }
                      >
                        {renderFormattedInlineText(item.text, item.id)}
                      </span>
                    </label>
                  ))}
                </div>
              );
            }

            if (block.type === 'quote') {
              return (
                <blockquote
                  key={block.id}
                  dir={computedDir}
                  className="border-s-4 border-indigo-500 ps-4 py-1.5 italic text-sm text-slate-600 dark:text-slate-300 bg-slate-50/60 dark:bg-slate-800/30 rounded-e-lg whitespace-pre-wrap leading-relaxed"
                >
                  {renderFormattedInlineText(block.content, block.id)}
                </blockquote>
              );
            }

            if (block.type === 'callout') {
              return (
                <div
                  key={block.id}
                  dir={computedDir}
                  className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap"
                >
                  {renderFormattedInlineText(block.content, block.id)}
                </div>
              );
            }

            if (block.type === 'code') {
              return (
                <div
                  key={block.id}
                  dir="ltr"
                  className="rounded-xl bg-neutral-900 text-neutral-100 p-4 font-mono text-xs overflow-x-auto"
                >
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-neutral-400 pb-2 mb-2 border-b border-neutral-800">
                    <span>{block.codeLanguage || 'code'}</span>
                  </div>
                  <pre className="leading-relaxed whitespace-pre-wrap">
                    <code>{block.content}</code>
                  </pre>
                </div>
              );
            }

            if (block.type === 'simple_table' && block.tableData) {
              return (
                <div key={block.id} dir={computedDir} className="space-y-2 overflow-x-auto my-2">
                  {block.content && (
                    <div className="text-xs font-semibold text-notion-muted dark:text-notion-darkMuted">
                      {renderFormattedInlineText(block.content, `${block.id}-cap`)}
                    </div>
                  )}
                  <table className="w-full border-collapse text-xs rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-notion-sidebar dark:bg-notion-darkBg">
                        {block.tableData.headers.map((header, colIdx) => (
                          <th
                            key={colIdx}
                            dir={detectTextDirection(header, computedDir)}
                            className="border border-notion-border dark:border-notion-darkBorder px-3 py-2 text-start font-semibold text-slate-800 dark:text-slate-100"
                          >
                            {renderFormattedInlineText(header, `${block.id}-th-${colIdx}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.tableData.rows.map((row, rowIdx) => (
                        <tr
                          key={rowIdx}
                          className="even:bg-slate-50/40 dark:even:bg-slate-800/20"
                        >
                          {row.map((cell, colIdx) => (
                            <td
                              key={colIdx}
                              dir={detectTextDirection(cell, computedDir)}
                              className="border border-notion-border dark:border-notion-darkBorder px-3 py-2 text-slate-700 dark:text-slate-300"
                            >
                              {renderFormattedInlineText(
                                cell,
                                `${block.id}-td-${rowIdx}-${colIdx}`
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }

            if (block.type === 'image') {
              const linkedFile = block.fileId
                ? state.files.find((f) => f.id === block.fileId)
                : undefined;
              const imgSrc =
                block.imageUrl || (linkedFile ? buildFallbackImageDataUrl(linkedFile) : '');
              return (
                <figure key={block.id} dir={computedDir} className="my-3 space-y-2">
                  {imgSrc ? (
                    <img
                      src={imgSrc}
                      alt={block.content || linkedFile?.name || 'Embedded image'}
                      className="max-h-96 rounded-xl border border-notion-border dark:border-notion-darkBorder object-contain"
                    />
                  ) : (
                    <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-400 text-center">
                      No image attached (switch to Edit Mode to drag or upload an image)
                    </div>
                  )}
                  {block.content && (
                    <figcaption className="text-xs text-notion-muted dark:text-notion-darkMuted">
                      {renderFormattedInlineText(block.content, `${block.id}-fig`)}
                    </figcaption>
                  )}
                </figure>
              );
            }

            if (block.type === 'file') {
              const attachedFile = block.fileId
                ? state.files.find((f) => f.id === block.fileId)
                : undefined;
              return (
                <div
                  key={block.id}
                  dir={computedDir}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-indigo-100/80 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Paperclip className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {attachedFile?.name || block.linkTitle || block.content || 'File Attachment'}
                      </div>
                      {attachedFile && (
                        <div className="text-[11px] text-slate-500">
                          {attachedFile.mimeType} • {formatFileSize(attachedFile.sizeBytes)}
                        </div>
                      )}
                      {block.content &&
                        attachedFile &&
                        block.content !== attachedFile.name && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                            {renderFormattedInlineText(block.content, `${block.id}-fdesc`)}
                          </div>
                        )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {attachedFile && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedFileId(attachedFile.id);
                          setActiveProjectFile({ type: 'file', id: attachedFile.id });
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Open File</span>
                      </button>
                    )}
                    {attachedFile?.dataUrl && (
                      <a
                        href={attachedFile.dataUrl}
                        download={attachedFile.name}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 transition"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            }

            if (block.type === 'link') {
              return (
                <div
                  key={block.id}
                  dir={computedDir}
                  className="p-3 rounded-xl bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <LinkIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                      {renderFormattedInlineText(
                        block.content || block.linkUrl || 'Web Link',
                        block.id
                      )}
                    </span>
                  </div>
                  {block.linkUrl && (
                    <a
                      href={block.linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold shrink-0"
                    >
                      <span>{block.linkUrl}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              );
            }

            // Default: Paragraph
            return (
              <p
                key={block.id}
                dir={computedDir}
                className="text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap"
              >
                {renderFormattedInlineText(block.content, block.id)}
              </p>
            );
          })}
        </article>
      ) : (
        /* =====================================================================
           2. EDIT MODE (Interactive Blocks with Formatting, Lists & Drag-Drop)
           ===================================================================== */
        <div className="rounded-xl border border-notion-border dark:border-notion-darkBorder bg-white dark:bg-notion-darkCard p-6 shadow-sm space-y-4">
          {page.blocks.map((block, index) => {
            const computedDir =
              block.dir && block.dir !== 'auto'
                ? block.dir
                : detectTextDirection(
                    block.content,
                    state.settings.language === 'he' ? 'rtl' : 'ltr'
                  );

            return (
              <div
                key={block.id}
                className="group relative rounded-lg border border-notion-border/60 dark:border-notion-darkBorder/60 hover:border-indigo-300 dark:hover:border-indigo-800 p-3 transition"
              >
                {/* Block Top Mini Toolbar: Type Converter, Inline Formatting, RTL/LTR Toggle, Reorder, Delete */}
                <div className="flex flex-wrap items-center justify-between gap-1 mb-2 opacity-90 group-hover:opacity-100 transition text-xs">
                  <div className="flex flex-wrap items-center gap-1">
                    <select
                      value={block.type}
                      onChange={(e) => {
                        const nextType = e.target.value as BlockType;
                        updateBlock(block.id, {
                          type: nextType,
                          checklistItems:
                            nextType === 'checklist' ? getChecklistItems(block) : block.checklistItems,
                          tableData:
                            nextType === 'simple_table' && !block.tableData
                              ? {
                                  headers: ['Column 1', 'Column 2'],
                                  rows: [['', '']],
                                }
                              : block.tableData,
                        });
                      }}
                      className="rounded border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar dark:bg-notion-darkBg px-2 py-0.5 text-[11px] font-medium"
                    >
                      {BLOCK_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.type} value={opt.type}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Rich Text Formatting Buttons (FR-3.3) - Toggle on Marked Text */}
                    {block.type !== 'divider' &&
                      block.type !== 'simple_table' &&
                      block.type !== 'image' &&
                      block.type !== 'file' && (
                        <div className="relative flex items-center gap-0.5 bg-notion-sidebar dark:bg-notion-darkBg rounded border border-notion-border dark:border-notion-darkBorder px-1 py-0.5">
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, '**')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Toggle Bold on marked text (Ctrl+B)"
                          >
                            <Bold className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, '*')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Toggle Italic on marked text (Ctrl+I)"
                          >
                            <Italic className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, '__')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Toggle Underline on marked text (Ctrl+U)"
                          >
                            <Underline className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, '~~')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Toggle Strikethrough (~~text~~)"
                          >
                            <Strikethrough className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, '`')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Toggle Inline Code (`code`)"
                          >
                            <Code className="w-3 h-3" />
                          </button>

                          {/* Text Color Picker Button */}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              setOpenStylePicker((prev) =>
                                prev?.blockId === block.id && prev.kind === 'color'
                                  ? null
                                  : { blockId: block.id, kind: 'color' }
                              )
                            }
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded text-indigo-600 dark:text-indigo-400"
                            title="Text Color on marked text"
                          >
                            <Palette className="w-3 h-3" />
                          </button>

                          {/* Highlight Picker Button */}
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() =>
                              setOpenStylePicker((prev) =>
                                prev?.blockId === block.id && prev.kind === 'highlight'
                                  ? null
                                  : { blockId: block.id, kind: 'highlight' }
                              )
                            }
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded text-amber-600 dark:text-amber-400"
                            title="Highlight marked text (==text== or colored highlight)"
                          >
                            <Highlighter className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => applyInlineFormat(block, 'link')}
                            className="p-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                            title="Insert or unwrap Link on marked text"
                          >
                            <LinkIcon className="w-3 h-3" />
                          </button>

                          {/* Floating Popover for Text Color or Highlight Color */}
                          {openStylePicker?.blockId === block.id && (
                            <div
                              onMouseDown={(e) => e.preventDefault()}
                              className="absolute top-full start-0 mt-1 z-30 flex items-center gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-lg"
                            >
                              {openStylePicker.kind === 'color' ? (
                                <>
                                  <span className="text-[10px] font-bold text-slate-400 pe-1">
                                    Color:
                                  </span>
                                  {TEXT_COLOR_SWATCHES.map((sw) => (
                                    <button
                                      key={sw.id}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() =>
                                        applyInlineFormat(block, `color:${sw.id}`)
                                      }
                                      className="w-4 h-4 rounded-full border border-black/15 hover:scale-125 transition"
                                      style={{ backgroundColor: sw.hex }}
                                      title={sw.label}
                                    />
                                  ))}
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyInlineFormat(block, 'color:none')}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                    title="Remove text color"
                                  >
                                    Reset
                                  </button>
                                </>
                              ) : (
                                <>
                                  <span className="text-[10px] font-bold text-slate-400 pe-1">
                                    Highlight:
                                  </span>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => {
                                      applyInlineFormat(block, '==');
                                      setOpenStylePicker(null);
                                    }}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-yellow-200 text-slate-900 hover:scale-105 transition"
                                    title="Standard Markdown Highlight (==text==)"
                                  >
                                    ==MD==
                                  </button>
                                  {HIGHLIGHT_COLOR_SWATCHES.map((sw) => (
                                    <button
                                      key={sw.id}
                                      type="button"
                                      onMouseDown={(e) => e.preventDefault()}
                                      onClick={() =>
                                        applyInlineFormat(block, `hl:${sw.id}`)
                                      }
                                      className="w-4 h-4 rounded border border-black/15 hover:scale-125 transition"
                                      style={{ backgroundColor: sw.hex }}
                                      title={sw.label}
                                    />
                                  ))}
                                  <button
                                    type="button"
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={() => applyInlineFormat(block, 'hl:none')}
                                    className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-slate-200"
                                    title="Remove highlight"
                                  >
                                    Reset
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                    {/* RTL / LTR Direction Switcher per block (FR-3.4) */}
                    <button
                      type="button"
                      onClick={() =>
                        updateBlock(block.id, {
                          dir: computedDir === 'rtl' ? 'ltr' : 'rtl',
                        })
                      }
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar dark:bg-notion-darkBg text-[10px] font-mono"
                      title="Toggle RTL (Hebrew) / LTR (English) direction for this block"
                    >
                      {computedDir === 'rtl' ? (
                        <>
                          <AlignRight className="w-3 h-3" /> RTL
                        </>
                      ) : (
                        <>
                          <AlignLeft className="w-3 h-3" /> LTR
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveBlock(index, -1)}
                      disabled={index === 0}
                      className="p-1 rounded hover:bg-notion-hover dark:hover:bg-notion-darkHover disabled:opacity-30"
                      title="Move block up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveBlock(index, 1)}
                      disabled={index === page.blocks.length - 1}
                      className="p-1 rounded hover:bg-notion-hover dark:hover:bg-notion-darkHover disabled:opacity-30"
                      title="Move block down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => addBlockAfter(index, 'paragraph')}
                      className="p-1 rounded hover:bg-notion-hover dark:hover:bg-notion-darkHover text-indigo-600"
                      title="Insert block below"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBlock(block.id)}
                      className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500"
                      title="Delete block"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Block Body Renderer by BlockType */}
                {block.type === 'divider' ? (
                  <div className="my-3 py-1 flex items-center">
                    <div className="w-full h-[2.5px] rounded-full bg-slate-300 dark:bg-slate-600" />
                  </div>
                ) : block.type === 'simple_table' ? (
                  /* FR-3.2: Simple Table */
                  <div className="space-y-2 overflow-x-auto" dir={computedDir}>
                    <input
                      type="text"
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      className="text-xs font-semibold text-notion-muted bg-transparent focus:outline-none"
                      placeholder="Table caption..."
                    />
                    <table className="w-full border-collapse text-xs">
                      <thead>
                        <tr className="bg-notion-sidebar dark:bg-notion-darkBg">
                          {(block.tableData?.headers || []).map((header, colIdx) => (
                            <th
                              key={colIdx}
                              className="border border-notion-border dark:border-notion-darkBorder p-1.5 min-w-[120px]"
                            >
                              <div className="flex items-center justify-between gap-1">
                                <input
                                  type="text"
                                  dir={detectTextDirection(header, computedDir)}
                                  value={header}
                                  onChange={(e) =>
                                    updateTableCell(block, 'header', colIdx, e.target.value)
                                  }
                                  className="w-full font-semibold bg-transparent focus:outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeTableColumn(block, colIdx)}
                                  className="text-notion-muted hover:text-rose-500 text-[10px] px-1"
                                  title="Remove column"
                                >
                                  ×
                                </button>
                              </div>
                            </th>
                          ))}
                          <th className="border border-notion-border dark:border-notion-darkBorder p-1 w-20 text-center">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(block.tableData?.rows || []).map((row, rowIdx) => (
                          <tr key={rowIdx}>
                            {row.map((cell, colIdx) => (
                              <td
                                key={colIdx}
                                className="border border-notion-border dark:border-notion-darkBorder p-1.5"
                              >
                                <input
                                  type="text"
                                  dir={detectTextDirection(cell, computedDir)}
                                  value={cell}
                                  onChange={(e) =>
                                    updateTableCell(block, rowIdx, colIdx, e.target.value)
                                  }
                                  className="w-full bg-transparent focus:outline-none"
                                />
                              </td>
                            ))}
                            <td className="border border-notion-border dark:border-notion-darkBorder p-1 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveTableRow(block, rowIdx, -1)}
                                  className="px-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                                  title="Move row up"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveTableRow(block, rowIdx, 1)}
                                  className="px-1 hover:bg-notion-hover dark:hover:bg-notion-darkHover rounded"
                                  title="Move row down"
                                >
                                  ↓
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeTableRow(block, rowIdx)}
                                  className="px-1 text-rose-500 hover:bg-rose-50 rounded"
                                  title="Remove row"
                                >
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addTableRow(block)}
                        className="px-2.5 py-1 rounded bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover text-xs font-medium border border-notion-border dark:border-notion-darkBorder"
                      >
                        {t.pages.tableAddRow}
                      </button>
                      <button
                        type="button"
                        onClick={() => addTableColumn(block)}
                        className="px-2.5 py-1 rounded bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover text-xs font-medium border border-notion-border dark:border-notion-darkBorder"
                      >
                        {t.pages.tableAddCol}
                      </button>
                    </div>
                  </div>
                ) : block.type === 'checklist' ? (
                  /* 3. Multi-item Checklist Block — Pressing Enter adds a new checklist item */
                  <div className="space-y-1.5" dir={computedDir}>
                    {getChecklistItems(block).map((item, itemIdx) => (
                      <div key={item.id} className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={!!item.checked}
                          onChange={() => toggleChecklistItemChecked(block, itemIdx)}
                          className="rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
                        />
                        <input
                          ref={(el) => {
                            inputRefs.current[`${block.id}:${itemIdx}`] = el;
                          }}
                          type="text"
                          dir={detectTextDirection(item.text, computedDir)}
                          value={item.text}
                          onChange={(e) =>
                            updateChecklistItemText(block, itemIdx, e.target.value)
                          }
                          onSelect={(e) =>
                            recordInputSelection(block.id, itemIdx, e.currentTarget)
                          }
                          onKeyUp={(e) =>
                            recordInputSelection(block.id, itemIdx, e.currentTarget)
                          }
                          onMouseUp={(e) =>
                            recordInputSelection(block.id, itemIdx, e.currentTarget)
                          }
                          onKeyDown={(e) => handleChecklistItemKeyDown(e, block, itemIdx)}
                          className={`w-full bg-transparent text-sm focus:outline-none ${
                            item.checked ? 'line-through text-notion-muted' : ''
                          }`}
                          placeholder="Checklist item (press Enter for next item)..."
                        />
                      </div>
                    ))}
                  </div>
                ) : block.type === 'bullet_list' || block.type === 'numbered_list' ? (
                  /* 3. Multi-item Bulleted & Numbered Lists — Pressing Enter adds a new bullet / number */
                  <div className="space-y-1.5" dir={computedDir}>
                    {(block.content || '').split('\n').map((lineText, itemIdx) => {
                      const startNum =
                        block.type === 'numbered_list'
                          ? getNumberedListStartNumber(index)
                          : 1;
                      return (
                        <div
                          key={`${block.id}-item-${itemIdx}`}
                          className="flex items-center gap-2"
                        >
                          {block.type === 'bullet_list' ? (
                            <span className="text-indigo-500 font-bold select-none w-4 text-center shrink-0">
                              •
                            </span>
                          ) : (
                            <span className="text-xs font-bold text-indigo-500 select-none min-w-[1.4rem] shrink-0">
                              {startNum + itemIdx}.
                            </span>
                          )}
                          <input
                            ref={(el) => {
                              inputRefs.current[`${block.id}:${itemIdx}`] = el;
                            }}
                            type="text"
                            dir={detectTextDirection(lineText, computedDir)}
                            value={lineText}
                            onChange={(e) => {
                              const lines = (block.content || '').split('\n');
                              lines[itemIdx] = e.target.value;
                              updateBlock(block.id, { content: lines.join('\n') });
                            }}
                            onSelect={(e) =>
                              recordInputSelection(block.id, itemIdx, e.currentTarget)
                            }
                            onKeyUp={(e) =>
                              recordInputSelection(block.id, itemIdx, e.currentTarget)
                            }
                            onMouseUp={(e) =>
                              recordInputSelection(block.id, itemIdx, e.currentTarget)
                            }
                            onKeyDown={(e) => handleListItemKeyDown(e, block, itemIdx)}
                            placeholder={
                              block.type === 'bullet_list'
                                ? 'Bullet item (press Enter for next bullet)...'
                                : 'Numbered item (press Enter for next number)...'
                            }
                            className="w-full bg-transparent text-sm focus:outline-none leading-relaxed"
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : block.type === 'code' ? (
                  <div
                    className="rounded-lg bg-neutral-900 text-neutral-100 p-3 font-mono text-xs space-y-1.5"
                    dir="ltr"
                  >
                    <div className="flex items-center justify-between text-[11px] text-neutral-400">
                      <span>Code Block</span>
                      <input
                        type="text"
                        value={block.codeLanguage || 'typescript'}
                        onChange={(e) =>
                          updateBlock(block.id, { codeLanguage: e.target.value })
                        }
                        className="bg-neutral-800 px-2 py-0.5 rounded text-neutral-200 w-28 text-right focus:outline-none"
                      />
                    </div>
                    <textarea
                      ref={(el) => {
                        inputRefs.current[`${block.id}:0`] = el;
                      }}
                      rows={Math.max(3, block.content.split('\n').length)}
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      onSelect={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onKeyUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onMouseUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      className="w-full bg-transparent focus:outline-none resize-y leading-relaxed"
                      placeholder="// Write code here..."
                    />
                  </div>
                ) : block.type === 'image' || block.type === 'file' ? (
                  /* 4. Image & File Attachment Blocks with Drag-and-Drop from Project Files or Computer */
                  (() => {
                    const isImageBlock = block.type === 'image';
                    const attachedFile = block.fileId
                      ? state.files.find((f) => f.id === block.fileId)
                      : undefined;
                    const resolvedImageUrl =
                      block.imageUrl ||
                      (attachedFile && isImageBlock
                        ? buildFallbackImageDataUrl(attachedFile)
                        : '');
                    const isDragActive = dragOverBlockId === block.id;
                    const candidateProjectFiles = isImageBlock
                      ? allAvailableFiles.filter(
                          (f) => f.mimeType.startsWith('image/') || f.projectId === page.projectId
                        )
                      : allAvailableFiles;

                    return (
                      <div className="space-y-3" dir={computedDir}>
                        <input
                          ref={(el) => {
                            blockFileInputRefs.current[block.id] = el;
                          }}
                          type="file"
                          accept={isImageBlock ? 'image/*' : undefined}
                          onChange={(e) => {
                            handleComputerFilesForBlock(block, e.target.files);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />

                        {/* Drag & Drop Zone (Computer Files OR Project Files) */}
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragOverBlockId !== block.id) {
                              setDragOverBlockId(block.id);
                            }
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDragOverBlockId(null);
                          }}
                          onDrop={(e) => handleBlockDrop(e, block)}
                          className={`rounded-xl border-2 border-dashed p-4 text-center transition ${
                            isDragActive
                              ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 scale-[1.01]'
                              : 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 hover:border-indigo-400'
                          }`}
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            {isImageBlock ? (
                              <ImageIcon className="w-6 h-6 text-indigo-500" />
                            ) : (
                              <Paperclip className="w-6 h-6 text-sky-500" />
                            )}
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                              {uploadingBlockId === block.id
                                ? 'Uploading & indexing file...'
                                : isImageBlock
                                ? 'Drag & drop an image here (from Project Files or your Computer)'
                                : 'Drag & drop any file here (from Project Files or your Computer)'}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              Or click below to browse your computer or drag from the Project Files list
                            </p>
                            <div className="flex flex-wrap items-center justify-center gap-2 mt-1">
                              <button
                                type="button"
                                onClick={() => blockFileInputRefs.current[block.id]?.click()}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-2xs transition"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {isImageBlock
                                    ? 'Browse Image from Computer'
                                    : 'Browse File from Computer'}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Draggable & Clickable Project Files Picker Strip */}
                        {candidateProjectFiles.length > 0 && (
                          <div className="rounded-lg bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder p-2.5 space-y-1.5">
                            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                              <span>
                                Project Files (Drag into dropzone above or click to attach):
                              </span>
                              <span>{candidateProjectFiles.length} available</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {candidateProjectFiles.map((pf) => {
                                const isSelectedFile = block.fileId === pf.id;
                                return (
                                  <div
                                    key={pf.id}
                                    draggable={true}
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData(
                                        'application/x-memoryhub-file-id',
                                        pf.id
                                      );
                                      e.dataTransfer.setData('text/plain', pf.name);
                                      e.dataTransfer.effectAllowed = 'copyLink';
                                    }}
                                    onClick={() => attachProjectFileToBlock(block, pf)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs cursor-grab active:cursor-grabbing border transition ${
                                      isSelectedFile
                                        ? 'bg-indigo-600 text-white border-indigo-600 font-semibold'
                                        : 'bg-white dark:bg-notion-darkCard border-notion-border dark:border-notion-darkBorder hover:border-indigo-400 text-slate-700 dark:text-slate-200'
                                    }`}
                                    title="Drag onto the dropzone or click to attach to this block"
                                  >
                                    <GripVertical className="w-3 h-3 opacity-50" />
                                    {pf.mimeType.startsWith('image/') ? (
                                      <ImageIcon className="w-3 h-3 text-amber-500 shrink-0" />
                                    ) : (
                                      <FileText className="w-3 h-3 text-sky-500 shrink-0" />
                                    )}
                                    <span className="truncate max-w-[180px]">{pf.name}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Preview for Image Block */}
                        {isImageBlock && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={block.imageUrl || ''}
                              onChange={(e) =>
                                updateBlock(block.id, { imageUrl: e.target.value })
                              }
                              placeholder="Or paste direct image URL (https://... or data:image/...)"
                              className="w-full text-xs rounded border border-notion-border dark:border-notion-darkBorder bg-notion-sidebar dark:bg-notion-darkBg px-2.5 py-1.5"
                            />
                            {resolvedImageUrl && (
                              <div className="relative inline-block">
                                <img
                                  src={resolvedImageUrl}
                                  alt={block.content || 'Embedded block image'}
                                  className="max-h-72 rounded-lg border border-notion-border dark:border-notion-darkBorder object-contain"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateBlock(block.id, {
                                      imageUrl: '',
                                      fileId: undefined,
                                    })
                                  }
                                  className="absolute top-2 end-2 p-1 rounded-full bg-black/60 hover:bg-black/80 text-white"
                                  title="Remove image"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Preview for File Attachment Block */}
                        {!isImageBlock && (attachedFile || block.linkTitle) && (
                          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <Paperclip className="w-4 h-4 text-indigo-600 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold truncate">
                                  {attachedFile?.name || block.linkTitle}
                                </div>
                                {attachedFile && (
                                  <div className="text-[11px] text-slate-400">
                                    {attachedFile.mimeType} •{' '}
                                    {formatFileSize(attachedFile.sizeBytes)}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {attachedFile && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFileId(attachedFile.id);
                                    setActiveProjectFile({
                                      type: 'file',
                                      id: attachedFile.id,
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 text-xs font-medium hover:underline"
                                >
                                  Open
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  updateBlock(block.id, {
                                    fileId: undefined,
                                    linkTitle: undefined,
                                    linkUrl: undefined,
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-rose-500"
                                title="Detach file"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        <input
                          type="text"
                          value={block.content}
                          onChange={(e) =>
                            updateBlock(block.id, { content: e.target.value })
                          }
                          placeholder={
                            isImageBlock
                              ? 'Image caption or description...'
                              : 'File attachment note or description...'
                          }
                          className="w-full text-xs text-notion-muted bg-transparent focus:outline-none border-b border-transparent focus:border-notion-border pb-1"
                        />
                      </div>
                    );
                  })()
                ) : block.type === 'link' ? (
                  <div className="flex flex-col sm:flex-row gap-2 items-center p-2.5 rounded-lg bg-notion-sidebar dark:bg-notion-darkBg border border-notion-border dark:border-notion-darkBorder">
                    <LinkIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                    <input
                      ref={(el) => {
                        inputRefs.current[`${block.id}:0`] = el;
                      }}
                      type="text"
                      dir={computedDir}
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      onSelect={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onKeyUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onMouseUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onKeyDown={(e) => handleFormattingShortcutKeyDown(e, block)}
                      placeholder="Link title or description..."
                      className="flex-1 text-sm bg-transparent focus:outline-none"
                    />
                    <input
                      type="url"
                      dir="ltr"
                      value={block.linkUrl || ''}
                      onChange={(e) => updateBlock(block.id, { linkUrl: e.target.value })}
                      placeholder="https://..."
                      className="flex-1 text-xs font-mono bg-white dark:bg-notion-darkCard px-2.5 py-1 rounded border border-notion-border dark:border-notion-darkBorder"
                    />
                    {block.linkUrl && (
                      <a
                        href={block.linkUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-indigo-600 hover:underline font-medium px-2"
                      >
                        Open ↗
                      </a>
                    )}
                  </div>
                ) : (
                  /* Paragraph, Headings, Quote, Callout */
                  <div
                    dir={computedDir}
                    className={`flex items-start gap-2 ${
                      block.type === 'quote'
                        ? 'border-s-4 border-indigo-500 ps-3 italic text-notion-muted dark:text-notion-darkMuted'
                        : block.type === 'callout'
                        ? 'p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50'
                        : ''
                    }`}
                  >
                    <textarea
                      ref={(el) => {
                        inputRefs.current[`${block.id}:0`] = el;
                      }}
                      rows={Math.max(1, block.content.split('\n').length)}
                      dir={computedDir}
                      value={block.content}
                      onChange={(e) => updateBlock(block.id, { content: e.target.value })}
                      onSelect={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onKeyUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onMouseUp={(e) => recordInputSelection(block.id, 0, e.currentTarget)}
                      onKeyDown={(e) => handleFormattingShortcutKeyDown(e, block)}
                      placeholder="Type content in Hebrew or English..."
                      className={`w-full bg-transparent focus:outline-none resize-y ${
                        block.type === 'heading1'
                          ? 'text-2xl font-bold'
                          : block.type === 'heading2'
                          ? 'text-xl font-semibold'
                          : block.type === 'heading3'
                          ? 'text-lg font-semibold'
                          : 'text-sm leading-relaxed'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}

          {/* Quick Add Block Palette at Bottom of Page (Only in Edit Mode) */}
          <div className="pt-4 border-t border-notion-border dark:border-notion-darkBorder flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-notion-muted mr-1">
              {t.pages.addBlock}:
            </span>
            {[
              { type: 'paragraph' as const, icon: Type, label: 'Text' },
              { type: 'heading2' as const, icon: Type, label: 'Heading' },
              { type: 'checklist' as const, icon: CheckSquare, label: 'Checklist' },
              { type: 'bullet_list' as const, icon: List, label: 'Bullets' },
              { type: 'numbered_list' as const, icon: ListOrdered, label: 'Numbered' },
              { type: 'simple_table' as const, icon: Table, label: 'Simple Table' },
              { type: 'callout' as const, icon: Sparkles, label: 'Callout' },
              { type: 'quote' as const, icon: Quote, label: 'Quote' },
              { type: 'code' as const, icon: Code, label: 'Code' },
              { type: 'link' as const, icon: LinkIcon, label: 'Link' },
              { type: 'image' as const, icon: ImageIcon, label: 'Image' },
              { type: 'file' as const, icon: FileText, label: 'File' },
              { type: 'divider' as const, icon: Minus, label: 'Divider' },
            ].map((btn) => {
              const Icon = btn.icon;
              return (
                <button
                  key={btn.type}
                  type="button"
                  onClick={() => addBlockAfter(page.blocks.length - 1, btn.type)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-notion-sidebar dark:bg-notion-darkBg hover:bg-notion-hover dark:hover:bg-notion-darkHover border border-notion-border dark:border-notion-darkBorder transition"
                >
                  <Icon className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{btn.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
