import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  ArrowDown,
  Group,
  Ungroup,
  Square,
  Circle,
  Diamond,
  StickyNote,
  Type,
  Image as ImageIcon,
  FolderInput,
  Bold,
  Italic,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  Hand,
  MousePointerSquareDashed,
  Upload,
  CheckSquare,
  RotateCcw,
  ArrowLeftRight,
} from 'lucide-react';
import {
  AnchorSide,
  CanvasBoard,
  CanvasConnector,
  CanvasNode,
  CanvasShapeType,
} from '../types/domain';
import { useWorkspace } from '../context/WorkspaceContext';
import { detectTextDirection, useTranslations } from '../i18n/translations';

interface CanvasEditorViewProps {
  projectId: string;
  folderId: string | null;
  canvasId?: string;
}

interface HistorySnapshot {
  nodes: CanvasNode[];
  connectors: CanvasConnector[];
}

interface ClipboardData {
  nodes: CanvasNode[];
  connectors: CanvasConnector[];
  pasteCount: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
  targetType: 'node' | 'connector' | 'canvas';
  targetId?: string;
}

interface AlignmentGuide {
  type: 'vertical' | 'horizontal';
  pos: number; // x for vertical, y for horizontal
  start: number; // minY for vertical, minX for horizontal
  end: number; // maxY for vertical, maxX for horizontal
}

const SHAPE_COLORS = [
  { label: 'Indigo', fill: '#EEF2FF', border: '#4F46E5', text: '#1E1B4B' },
  { label: 'Emerald', fill: '#ECFDF5', border: '#10B981', text: '#064E3B' },
  { label: 'Amber Sticky', fill: '#FEF3C7', border: '#F59E0B', text: '#78350F' },
  { label: 'Sky', fill: '#F0F9FF', border: '#0284C7', text: '#0C4A6E' },
  { label: 'Rose', fill: '#FFF1F2', border: '#E11D48', text: '#881337' },
  { label: 'Purple', fill: '#FAF5FF', border: '#9333EA', text: '#3B0764' },
  { label: 'Slate', fill: '#F8FAFC', border: '#475569', text: '#0F172A' },
];

const ANCHOR_SIDES: AnchorSide[] = ['top', 'right', 'bottom', 'left'];

function getAnchorCoordinates(node: CanvasNode, anchor: AnchorSide): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: node.x + node.width / 2, y: node.y };
    case 'right':
      return { x: node.x + node.width, y: node.y + node.height / 2 };
    case 'bottom':
      return { x: node.x + node.width / 2, y: node.y + node.height };
    case 'left':
      return { x: node.x, y: node.y + node.height / 2 };
    case 'center':
    default:
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
  }
}

function getAnchorOutwardVector(anchor: AnchorSide): { x: number; y: number } {
  switch (anchor) {
    case 'top':
      return { x: 0, y: -1 };
    case 'right':
      return { x: 1, y: 0 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    default:
      return { x: 1, y: 0 };
  }
}

/**
 * Helper to build a polyline SVG path with optional rounded corners (quadratic bezier bends).
 */
function buildRoundedPolylinePath(
  points: { x: number; y: number }[],
  cornerRadius: number
): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (cornerRadius <= 0.5 || points.length === 2) {
    return points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
  }

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y);

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y);

    if (len1 < 1 || len2 < 1) {
      d += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const r = Math.min(cornerRadius, len1 * 0.48, len2 * 0.48);
    const startCorner = {
      x: curr.x - (v1x / len1) * r,
      y: curr.y - (v1y / len1) * r,
    };
    const endCorner = {
      x: curr.x + (v2x / len2) * r,
      y: curr.y + (v2y / len2) * r,
    };

    d += ` L ${startCorner.x} ${startCorner.y} Q ${curr.x} ${curr.y} ${endCorner.x} ${endCorner.y}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

/**
 * Builds an SVG path and exact curve midpoint from p1 (exiting outward along fromAnchor)
 * to p2 (entering inward into toAnchor), taking into account `roundness` (0..100)
 * and manual drag offsets (`bendX`, `bendY`).
 */
function computeConnectorGeometry(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  lineType: 'straight' | 'curved' | 'orthogonal',
  fromAnchor: AnchorSide = 'right',
  toAnchor?: AnchorSide,
  roundness?: number,
  bendX: number = 0,
  bendY: number = 0
): { pathData: string; midPoint: { x: number; y: number } } {
  const out1 = getAnchorOutwardVector(fromAnchor);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const effectiveRoundness =
    roundness !== undefined
      ? roundness
      : lineType === 'straight'
      ? 0
      : lineType === 'orthogonal'
      ? 40
      : 50;

  // 1. Straight line (unless bent or given roundness)
  if (lineType === 'straight' && effectiveRoundness <= 0) {
    if (Math.abs(bendX) > 1 || Math.abs(bendY) > 1) {
      const ctrl = {
        x: (p1.x + p2.x) / 2 + bendX * 2,
        y: (p1.y + p2.y) / 2 + bendY * 2,
      };
      const midPoint = {
        x: 0.25 * p1.x + 0.5 * ctrl.x + 0.25 * p2.x,
        y: 0.25 * p1.y + 0.5 * ctrl.y + 0.25 * p2.y,
      };
      return {
        pathData: `M ${p1.x} ${p1.y} Q ${ctrl.x} ${ctrl.y} ${p2.x} ${p2.y}`,
        midPoint,
      };
    }

    const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    if (!toAnchor) {
      return { pathData: `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`, midPoint };
    }
    const stub = Math.min(14, Math.max(5, dist * 0.12));
    const out2 = getAnchorOutwardVector(toAnchor);
    const s1 = { x: p1.x + out1.x * stub, y: p1.y + out1.y * stub };
    const s2 = { x: p2.x + out2.x * stub, y: p2.y + out2.y * stub };
    return {
      pathData: `M ${p1.x} ${p1.y} L ${s1.x} ${s1.y} L ${s2.x} ${s2.y} L ${p2.x} ${p2.y}`,
      midPoint,
    };
  }

  // 2. Orthogonal (Elbow) connector with adjustable corner roundness & draggable middle segment
  if (lineType === 'orthogonal') {
    const stub = Math.min(28, Math.max(14, dist * 0.2));
    const s1 = { x: p1.x + out1.x * stub, y: p1.y + out1.y * stub };
    const cornerRadius = (effectiveRoundness / 100) * 34;

    if (!toAnchor) {
      const midX = (s1.x + p2.x) / 2 + bendX;
      const pts = [
        p1,
        s1,
        { x: midX, y: s1.y },
        { x: midX, y: p2.y },
        p2,
      ];
      return {
        pathData: buildRoundedPolylinePath(pts, cornerRadius),
        midPoint: { x: midX, y: (s1.y + p2.y) / 2 },
      };
    }

    const out2 = getAnchorOutwardVector(toAnchor);
    const s2 = { x: p2.x + out2.x * stub, y: p2.y + out2.y * stub };

    if (Math.abs(out1.x) > 0 && Math.abs(out2.x) > 0) {
      const midX = (s1.x + s2.x) / 2 + bendX;
      const pts = [
        p1,
        s1,
        { x: midX, y: s1.y },
        { x: midX, y: s2.y },
        s2,
        p2,
      ];
      return {
        pathData: buildRoundedPolylinePath(pts, cornerRadius),
        midPoint: { x: midX, y: (s1.y + s2.y) / 2 },
      };
    }

    const midY = (s1.y + s2.y) / 2 + bendY;
    const pts = [
      p1,
      s1,
      { x: s1.x, y: midY },
      { x: s2.x, y: midY },
      s2,
      p2,
    ];
    return {
      pathData: buildRoundedPolylinePath(pts, cornerRadius),
      midPoint: { x: (s1.x + s2.x) / 2, y: midY },
    };
  }

  // 3. Curved Cubic Bezier: `effectiveRoundness` (0..100) controls the tangent arc depth
  const baseOffset = Math.max(32, Math.min(180, dist * 0.48));
  const offset = baseOffset * (effectiveRoundness / 50);

  const c1 = {
    x: p1.x + out1.x * offset + bendX * 1.35,
    y: p1.y + out1.y * offset + bendY * 1.35,
  };

  let c2: { x: number; y: number };
  if (toAnchor) {
    const out2 = getAnchorOutwardVector(toAnchor);
    c2 = {
      x: p2.x + out2.x * offset + bendX * 1.35,
      y: p2.y + out2.y * offset + bendY * 1.35,
    };
  } else {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    c2 = {
      x: p2.x - dx * 0.25 + bendX * 1.35,
      y: p2.y - dy * 0.25 + bendY * 1.35,
    };
  }

  const midPoint = {
    x: 0.125 * p1.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p2.x,
    y: 0.125 * p1.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p2.y,
  };

  return {
    pathData: `M ${p1.x} ${p1.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${p2.x} ${p2.y}`,
    midPoint,
  };
}

export const CanvasEditorView: React.FC<CanvasEditorViewProps> = ({
  projectId,
  folderId,
  canvasId,
}) => {
  const {
    state,
    selectedCanvasId,
    createCanvas,
    updateCanvas,
    deleteCanvasToTrash,
    moveItemToLocation,
    uploadWorkspaceFile,
  } = useWorkspace();
  const t = useTranslations(state.settings.language);

  const projectCanvases = useMemo(
    () => state.canvases.filter((c) => !c.isDeleted && c.projectId === projectId),
    [state.canvases, projectId]
  );

  const targetCanvasId = canvasId || selectedCanvasId;

  const activeCanvas: CanvasBoard | undefined = useMemo(
    () => projectCanvases.find((c) => c.id === targetCanvasId) || projectCanvases[0],
    [projectCanvases, targetCanvasId]
  );

  const projectImageFiles = useMemo(
    () => state.files.filter((f) => !f.isDeleted && f.mimeType.startsWith('image/')),
    [state.files]
  );

  // Selection & Tool Mode
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [hoveredConnectorId, setHoveredConnectorId] = useState<string | null>(null);
  const [canvasTool, setCanvasTool] = useState<'pan' | 'select'>('pan');
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Smart Alignment Guides State (Requirement 4)
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);

  // Undo / Redo Stacks
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Clipboard for Copy / Cut / Paste
  const clipboardRef = useRef<ClipboardData | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);

  // Right-click Context Menu
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Dragging Nodes State
  const [draggingNode, setDraggingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    initialPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  // Resizing Node State
  const [resizingNode, setResizingNode] = useState<{
    nodeId: string;
    startX: number;
    startY: number;
    initW: number;
    initH: number;
  } | null>(null);

  // Panning Canvas State
  const [isPanning, setIsPanning] = useState<{
    startX: number;
    startY: number;
    initVpX: number;
    initVpY: number;
  } | null>(null);

  // Box Selection (Marquee) State
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    additive: boolean;
    initialSelectedIds: string[];
  } | null>(null);

  // Live Dragging NEW Arrow Connector from an Anchor Dot
  const [draggingConnector, setDraggingConnector] = useState<{
    fromNodeId: string;
    fromAnchor: AnchorSide;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    hoveredTarget: { nodeId: string; anchor: AnchorSide } | null;
  } | null>(null);

  // Dragging an EXISTING Arrow's Start or End Point to another Anchor (Requirement 3)
  const [reconnectingConnector, setReconnectingConnector] = useState<{
    connectorId: string;
    end: 'from' | 'to';
    fixedNodeId: string;
    fixedAnchor: AnchorSide;
    fixedX: number;
    fixedY: number;
    currentX: number;
    currentY: number;
    hoveredTarget: { nodeId: string; anchor: AnchorSide } | null;
  } | null>(null);

  // Dragging an EXISTING Arrow's Middle / Body to bend or move its path (Requirement 3)
  const [bendingConnector, setBendingConnector] = useState<{
    connectorId: string;
    startX: number;
    startY: number;
    initBendX: number;
    initBendY: number;
  } | null>(null);

  const [showMoveModal, setShowMoveModal] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageUploadInputRef = useRef<HTMLInputElement | null>(null);

  // Convert screen (clientX, clientY) to canvas world coordinates
  const screenToWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      if (!containerRef.current || !activeCanvas) return { x: 0, y: 0 };
      const rect = containerRef.current.getBoundingClientRect();
      const zoom = activeCanvas.viewport.zoom || 1;
      return {
        x: (clientX - rect.left - activeCanvas.viewport.x) / zoom,
        y: (clientY - rect.top - activeCanvas.viewport.y) / zoom,
      };
    },
    [activeCanvas]
  );

  const pushUndoSnapshot = useCallback((board: CanvasBoard) => {
    setUndoStack((prev) => [
      ...prev.slice(-29),
      {
        nodes: JSON.parse(JSON.stringify(board.nodes)),
        connectors: JSON.parse(JSON.stringify(board.connectors)),
      },
    ]);
    setRedoStack([]);
  }, []);

  const handleUndo = useCallback(() => {
    if (!activeCanvas || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        nodes: JSON.parse(JSON.stringify(activeCanvas.nodes)),
        connectors: JSON.parse(JSON.stringify(activeCanvas.connectors)),
      },
    ]);
    setUndoStack((prev) => prev.slice(0, -1));
    updateCanvas(activeCanvas.id, {
      nodes: last.nodes,
      connectors: last.connectors,
    });
  }, [activeCanvas, undoStack, updateCanvas]);

  const handleRedo = useCallback(() => {
    if (!activeCanvas || redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [
      ...prev,
      {
        nodes: JSON.parse(JSON.stringify(activeCanvas.nodes)),
        connectors: JSON.parse(JSON.stringify(activeCanvas.connectors)),
      },
    ]);
    setRedoStack((prev) => prev.slice(0, -1));
    updateCanvas(activeCanvas.id, {
      nodes: next.nodes,
      connectors: next.connectors,
    });
  }, [activeCanvas, redoStack, updateCanvas]);

  const addShape = useCallback(
    (type: CanvasShapeType, customPos?: { x: number; y: number }) => {
      if (!activeCanvas) return;
      pushUndoSnapshot(activeCanvas);
      const palette =
        type === 'sticky_note'
          ? SHAPE_COLORS[2]
          : SHAPE_COLORS[activeCanvas.nodes.length % SHAPE_COLORS.length];

      const width =
        type === 'circle' || type === 'diamond'
          ? 160
          : type === 'sticky_note'
          ? 200
          : type === 'image'
          ? 240
          : 220;
      const height =
        type === 'circle' || type === 'diamond'
          ? 160
          : type === 'sticky_note'
          ? 160
          : type === 'image'
          ? 180
          : 105;

      const defaultX = Math.round(140 + ((activeCanvas.nodes.length * 35) % 350));
      const defaultY = Math.round(120 + ((activeCanvas.nodes.length * 30) % 240));

      const newNode: CanvasNode = {
        id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type,
        x: customPos ? Math.round(customPos.x - width / 2) : defaultX,
        y: customPos ? Math.round(customPos.y - height / 2) : defaultY,
        width,
        height,
        text:
          type === 'image'
            ? ''
            : type === 'sticky_note'
            ? 'פתקית חדשה / Sticky Note'
            : type === 'text'
            ? 'Label / כותרת'
            : 'New Shape / צורה חדשה',
        fillColor: type === 'text' ? 'transparent' : type === 'image' ? '#FFFFFF' : palette.fill,
        borderColor: type === 'text' ? 'transparent' : palette.border,
        borderStyle: 'solid',
        borderWidth: type === 'text' ? 0 : 2,
        textColor: palette.text,
        fontSize: 14,
        textAlign: 'center',
        verticalAlign: 'center',
        bold: false,
        italic: false,
        imageUrl:
          type === 'image'
            ? 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=500&q=80'
            : undefined,
        zIndex: activeCanvas.nodes.length + 1,
      };

      updateCanvas(activeCanvas.id, {
        nodes: [...activeCanvas.nodes, newNode],
      });
      setSelectedNodeIds([newNode.id]);
      setSelectedConnectorId(null);
    },
    [activeCanvas, pushUndoSnapshot, updateCanvas]
  );

  // Copy selected shapes (and connectors between them) to clipboard
  const copySelectedNodes = useCallback(() => {
    if (!activeCanvas || selectedNodeIds.length === 0) return;
    const nodesToCopy: CanvasNode[] = JSON.parse(
      JSON.stringify(activeCanvas.nodes.filter((n) => selectedNodeIds.includes(n.id)))
    );
    const connsToCopy: CanvasConnector[] = JSON.parse(
      JSON.stringify(
        activeCanvas.connectors.filter(
          (c) =>
            selectedNodeIds.includes(c.fromNodeId) &&
            selectedNodeIds.includes(c.toNodeId)
        )
      )
    );
    clipboardRef.current = {
      nodes: nodesToCopy,
      connectors: connsToCopy,
      pasteCount: 0,
    };
    setHasClipboard(true);
  }, [activeCanvas, selectedNodeIds]);

  const deleteConnectorById = useCallback(
    (connId: string) => {
      if (!activeCanvas) return;
      pushUndoSnapshot(activeCanvas);
      updateCanvas(activeCanvas.id, {
        connectors: activeCanvas.connectors.filter((c) => c.id !== connId),
      });
      if (selectedConnectorId === connId) {
        setSelectedConnectorId(null);
      }
      if (hoveredConnectorId === connId) {
        setHoveredConnectorId(null);
      }
    },
    [activeCanvas, selectedConnectorId, hoveredConnectorId, pushUndoSnapshot, updateCanvas]
  );

  const deleteSelection = useCallback(() => {
    if (!activeCanvas) return;
    if (selectedNodeIds.length === 0 && !selectedConnectorId) return;
    pushUndoSnapshot(activeCanvas);
    const remainingNodes = activeCanvas.nodes.filter((n) => !selectedNodeIds.includes(n.id));
    const remainingConnectors = activeCanvas.connectors.filter(
      (c) =>
        c.id !== selectedConnectorId &&
        !selectedNodeIds.includes(c.fromNodeId) &&
        !selectedNodeIds.includes(c.toNodeId)
    );
    updateCanvas(activeCanvas.id, {
      nodes: remainingNodes,
      connectors: remainingConnectors,
    });
    setSelectedNodeIds([]);
    setSelectedConnectorId(null);
  }, [activeCanvas, selectedNodeIds, selectedConnectorId, pushUndoSnapshot, updateCanvas]);

  const cutSelectedNodes = useCallback(() => {
    if (!activeCanvas || selectedNodeIds.length === 0) return;
    copySelectedNodes();
    deleteSelection();
  }, [activeCanvas, selectedNodeIds, copySelectedNodes, deleteSelection]);

  const pasteFromClipboard = useCallback(
    (targetWorldPos?: { x: number; y: number }) => {
      if (!activeCanvas || !clipboardRef.current || clipboardRef.current.nodes.length === 0)
        return;
      pushUndoSnapshot(activeCanvas);

      clipboardRef.current.pasteCount += 1;
      const count = clipboardRef.current.pasteCount;

      const minX = Math.min(...clipboardRef.current.nodes.map((n) => n.x));
      const minY = Math.min(...clipboardRef.current.nodes.map((n) => n.y));

      const offsetX = targetWorldPos ? Math.round(targetWorldPos.x - minX) : 30 * count;
      const offsetY = targetWorldPos ? Math.round(targetWorldPos.y - minY) : 30 * count;

      const idMap = new Map<string, string>();
      const groupMap = new Map<string, string>();
      const baseZ = Math.max(0, ...activeCanvas.nodes.map((n) => n.zIndex));

      const newNodes: CanvasNode[] = clipboardRef.current.nodes.map((n, idx) => {
        const newId = `node-${Date.now()}-pst-${idx}-${Math.random().toString(36).slice(2, 5)}`;
        idMap.set(n.id, newId);
        let nextGroupId = n.groupId;
        if (n.groupId) {
          if (!groupMap.has(n.groupId)) {
            groupMap.set(n.groupId, `grp-${Date.now()}-${idx}`);
          }
          nextGroupId = groupMap.get(n.groupId);
        }
        return {
          ...n,
          id: newId,
          x: n.x + offsetX,
          y: n.y + offsetY,
          groupId: nextGroupId,
          zIndex: baseZ + idx + 1,
        };
      });

      const newConnectors: CanvasConnector[] = clipboardRef.current.connectors
        .map((c, idx) => {
          const fromId = idMap.get(c.fromNodeId);
          const toId = idMap.get(c.toNodeId);
          if (!fromId || !toId) return null;
          return {
            ...c,
            id: `conn-${Date.now()}-pst-${idx}`,
            fromNodeId: fromId,
            toNodeId: toId,
          };
        })
        .filter((c): c is CanvasConnector => c !== null);

      updateCanvas(activeCanvas.id, {
        nodes: [...activeCanvas.nodes, ...newNodes],
        connectors: [...activeCanvas.connectors, ...newConnectors],
      });
      setSelectedNodeIds(newNodes.map((n) => n.id));
      setSelectedConnectorId(null);
    },
    [activeCanvas, pushUndoSnapshot, updateCanvas]
  );

  const duplicateSelectedNodes = useCallback(() => {
    if (!activeCanvas || selectedNodeIds.length === 0) return;
    pushUndoSnapshot(activeCanvas);
    const idMap = new Map<string, string>();
    const groupMap = new Map<string, string>();
    const baseZ = Math.max(0, ...activeCanvas.nodes.map((n) => n.zIndex));

    const clones: CanvasNode[] = activeCanvas.nodes
      .filter((n) => selectedNodeIds.includes(n.id))
      .map((n, idx) => {
        const newId = `node-${Date.now()}-dup-${idx}-${Math.random().toString(36).slice(2, 5)}`;
        idMap.set(n.id, newId);
        let nextGroupId = n.groupId;
        if (n.groupId) {
          if (!groupMap.has(n.groupId)) {
            groupMap.set(n.groupId, `grp-${Date.now()}-${idx}`);
          }
          nextGroupId = groupMap.get(n.groupId);
        }
        return {
          ...n,
          id: newId,
          x: n.x + 30,
          y: n.y + 30,
          groupId: nextGroupId,
          zIndex: baseZ + idx + 1,
        };
      });

    const clonedConnectors: CanvasConnector[] = activeCanvas.connectors
      .filter(
        (c) =>
          selectedNodeIds.includes(c.fromNodeId) && selectedNodeIds.includes(c.toNodeId)
      )
      .map((c, idx) => ({
        ...c,
        id: `conn-${Date.now()}-dup-${idx}`,
        fromNodeId: idMap.get(c.fromNodeId)!,
        toNodeId: idMap.get(c.toNodeId)!,
      }));

    updateCanvas(activeCanvas.id, {
      nodes: [...activeCanvas.nodes, ...clones],
      connectors: [...activeCanvas.connectors, ...clonedConnectors],
    });
    setSelectedNodeIds(clones.map((c) => c.id));
    setSelectedConnectorId(null);
  }, [activeCanvas, selectedNodeIds, pushUndoSnapshot, updateCanvas]);

  const groupSelectedNodes = useCallback(() => {
    if (!activeCanvas || selectedNodeIds.length < 2) return;
    pushUndoSnapshot(activeCanvas);
    const groupId = `grp-${Date.now()}`;
    updateCanvas(activeCanvas.id, {
      nodes: activeCanvas.nodes.map((n) =>
        selectedNodeIds.includes(n.id) ? { ...n, groupId } : n
      ),
    });
  }, [activeCanvas, selectedNodeIds, pushUndoSnapshot, updateCanvas]);

  const ungroupSelectedNodes = useCallback(() => {
    if (!activeCanvas || selectedNodeIds.length === 0) return;
    pushUndoSnapshot(activeCanvas);
    updateCanvas(activeCanvas.id, {
      nodes: activeCanvas.nodes.map((n) =>
        selectedNodeIds.includes(n.id) ? { ...n, groupId: null } : n
      ),
    });
  }, [activeCanvas, selectedNodeIds, pushUndoSnapshot, updateCanvas]);

  const changeLayerOrder = useCallback(
    (direction: 'front' | 'back' | 'forward' | 'backward') => {
      if (!activeCanvas || selectedNodeIds.length === 0) return;
      pushUndoSnapshot(activeCanvas);
      const maxZ = Math.max(1, ...activeCanvas.nodes.map((n) => n.zIndex));
      const minZ = Math.min(1, ...activeCanvas.nodes.map((n) => n.zIndex));
      updateCanvas(activeCanvas.id, {
        nodes: activeCanvas.nodes.map((n) => {
          if (!selectedNodeIds.includes(n.id)) return n;
          if (direction === 'front') return { ...n, zIndex: maxZ + 1 };
          if (direction === 'back') return { ...n, zIndex: Math.max(0, minZ - 1) };
          if (direction === 'forward') return { ...n, zIndex: n.zIndex + 1 };
          return { ...n, zIndex: Math.max(0, n.zIndex - 1) };
        }),
      });
    },
    [activeCanvas, selectedNodeIds, pushUndoSnapshot, updateCanvas]
  );

  const selectAllNodes = useCallback(() => {
    if (!activeCanvas) return;
    setSelectedNodeIds(activeCanvas.nodes.map((n) => n.id));
    setSelectedConnectorId(null);
  }, [activeCanvas]);

  const updateSelectedNodesStyle = useCallback(
    (patch: Partial<CanvasNode>) => {
      if (!activeCanvas || selectedNodeIds.length === 0) return;
      pushUndoSnapshot(activeCanvas);
      updateCanvas(activeCanvas.id, {
        nodes: activeCanvas.nodes.map((n) =>
          selectedNodeIds.includes(n.id) ? { ...n, ...patch } : n
        ),
      });
    },
    [activeCanvas, selectedNodeIds, pushUndoSnapshot, updateCanvas]
  );

  const updateActiveConnector = useCallback(
    (patch: Partial<CanvasConnector>, recordUndo: boolean = false) => {
      if (!activeCanvas || !selectedConnectorId) return;
      if (recordUndo) {
        pushUndoSnapshot(activeCanvas);
      }
      updateCanvas(activeCanvas.id, {
        connectors: activeCanvas.connectors.map((c) =>
          c.id === selectedConnectorId ? { ...c, ...patch } : c
        ),
      });
    },
    [activeCanvas, selectedConnectorId, pushUndoSnapshot, updateCanvas]
  );

  // Native non-passive wheel listener for reliable Ctrl + Scroll Zoom In / Out
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !activeCanvas) return;

    const onWheelNative = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const prevZoom = activeCanvas.viewport.zoom || 1;
        const zoomStep = e.deltaY < 0 ? 0.12 : -0.12;
        const nextZoom = Math.min(2.6, Math.max(0.25, +(prevZoom + zoomStep).toFixed(2)));
        if (nextZoom === prevZoom) return;

        // Zoom smoothly around cursor point
        const worldX = (cursorX - activeCanvas.viewport.x) / prevZoom;
        const worldY = (cursorY - activeCanvas.viewport.y) / prevZoom;
        const nextVpX = Math.round(cursorX - worldX * nextZoom);
        const nextVpY = Math.round(cursorY - worldY * nextZoom);

        updateCanvas(activeCanvas.id, {
          viewport: {
            x: nextVpX,
            y: nextVpY,
            zoom: nextZoom,
          },
        });
      }
    };

    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, [activeCanvas, updateCanvas]);

  // Global Keyboard Shortcuts for Canvas
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeCanvas) return;
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (e.code === 'Space' && !isEditingText) {
        setIsSpacePressed(true);
      }

      if (e.key === 'Escape') {
        setContextMenu(null);
        setDraggingConnector(null);
        setReconnectingConnector(null);
        setBendingConnector(null);
        setSelectionBox(null);
        setAlignmentGuides([]);
        if (!isEditingText) {
          setSelectedNodeIds([]);
          setSelectedConnectorId(null);
        }
        return;
      }

      if (isEditingText) return;

      const isMod = e.ctrlKey || e.metaKey;

      if (isMod && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        copySelectedNodes();
      } else if (isMod && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        cutSelectedNodes();
      } else if (isMod && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        pasteFromClipboard();
      } else if (isMod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelectedNodes();
      } else if (isMod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (
        (isMod && e.key.toLowerCase() === 'y') ||
        (isMod && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        handleRedo();
      } else if (isMod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAllNodes();
      } else if (isMod && e.key.toLowerCase() === 'g' && !e.shiftKey) {
        e.preventDefault();
        groupSelectedNodes();
      } else if (isMod && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        ungroupSelectedNodes();
      } else if (e.key === ']' || (isMod && e.key === ']')) {
        e.preventDefault();
        changeLayerOrder('front');
      } else if (e.key === '[' || (isMod && e.key === '[')) {
        e.preventDefault();
        changeLayerOrder('back');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (
        selectedNodeIds.length > 0 &&
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 15 : 4;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        pushUndoSnapshot(activeCanvas);
        updateCanvas(activeCanvas.id, {
          nodes: activeCanvas.nodes.map((n) =>
            selectedNodeIds.includes(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n
          ),
        });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    activeCanvas,
    selectedNodeIds,
    copySelectedNodes,
    cutSelectedNodes,
    pasteFromClipboard,
    duplicateSelectedNodes,
    handleUndo,
    handleRedo,
    selectAllNodes,
    groupSelectedNodes,
    ungroupSelectedNodes,
    changeLayerOrder,
    deleteSelection,
    pushUndoSnapshot,
    updateCanvas,
  ]);

  // Close context menu on window click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextMenu]);

  /**
   * Starts dragging a shape (from its wide border or body).
   * Supports Ctrl + Drag (or Alt + Drag) to duplicate on the fly!
   */
  const startNodeDrag = (e: React.MouseEvent, node: CanvasNode) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setContextMenu(null);

    if (!activeCanvas) return;

    const isInstalledSelection = selectedNodeIds.includes(node.id);
    let nextSel: string[];

    if (e.shiftKey) {
      nextSel = isInstalledSelection
        ? selectedNodeIds.filter((id) => id !== node.id)
        : [...selectedNodeIds, node.id];
    } else if (node.groupId && !isInstalledSelection) {
      nextSel = activeCanvas.nodes
        .filter((n) => n.groupId === node.groupId)
        .map((n) => n.id);
    } else {
      nextSel = isInstalledSelection ? selectedNodeIds : [node.id];
    }

    setSelectedConnectorId(null);
    pushUndoSnapshot(activeCanvas);

    // Ctrl + Drag (or Alt + Drag) duplicates the selected shapes and drags the clones
    if (e.ctrlKey || e.metaKey || e.altKey) {
      const idMap = new Map<string, string>();
      const groupMap = new Map<string, string>();
      const baseZ = Math.max(0, ...activeCanvas.nodes.map((n) => n.zIndex));

      const clones: CanvasNode[] = activeCanvas.nodes
        .filter((n) => nextSel.includes(n.id))
        .map((n, idx) => {
          const newId = `node-${Date.now()}-cdrag-${idx}-${Math.random().toString(36).slice(2, 5)}`;
          idMap.set(n.id, newId);
          let nextGroupId = n.groupId;
          if (n.groupId) {
            if (!groupMap.has(n.groupId)) {
              groupMap.set(n.groupId, `grp-${Date.now()}-${idx}`);
            }
            nextGroupId = groupMap.get(n.groupId);
          }
          return {
            ...n,
            id: newId,
            groupId: nextGroupId,
            zIndex: baseZ + idx + 1,
          };
        });

      const clonedConnectors: CanvasConnector[] = activeCanvas.connectors
        .filter((c) => nextSel.includes(c.fromNodeId) && nextSel.includes(c.toNodeId))
        .map((c, idx) => ({
          ...c,
          id: `conn-${Date.now()}-cdrag-${idx}`,
          fromNodeId: idMap.get(c.fromNodeId)!,
          toNodeId: idMap.get(c.toNodeId)!,
        }));

      const initialPositions: Record<string, { x: number; y: number }> = {};
      clones.forEach((c) => {
        initialPositions[c.id] = { x: c.x, y: c.y };
      });

      updateCanvas(activeCanvas.id, {
        nodes: [...activeCanvas.nodes, ...clones],
        connectors: [...activeCanvas.connectors, ...clonedConnectors],
      });

      const cloneIds = clones.map((c) => c.id);
      setSelectedNodeIds(cloneIds);
      setDraggingNode({
        nodeId: idMap.get(node.id) || cloneIds[0],
        startX: e.clientX,
        startY: e.clientY,
        initialPositions,
      });
      return;
    }

    setSelectedNodeIds(nextSel);

    const initialPositions: Record<string, { x: number; y: number }> = {};
    activeCanvas.nodes.forEach((n) => {
      if (nextSel.includes(n.id)) {
        initialPositions[n.id] = { x: n.x, y: n.y };
      }
    });

    setDraggingNode({
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      initialPositions,
    });
  };

  /**
   * Dragging an anchor dot creates a new arrow pointing out of the shape.
   */
  const handleAnchorMouseDown = (
    node: CanvasNode,
    anchor: AnchorSide,
    e: React.MouseEvent
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setContextMenu(null);

    const startPt = getAnchorCoordinates(node, anchor);
    setDraggingConnector({
      fromNodeId: node.id,
      fromAnchor: anchor,
      startX: startPt.x,
      startY: startPt.y,
      currentX: startPt.x,
      currentY: startPt.y,
      hoveredTarget: null,
    });
  };

  /**
   * Starts dragging either the Start ('from') or End ('to') endpoint of an existing arrow
   * to move/reconnect it to any anchor point on any shape (Requirement 3).
   */
  const startReconnectConnector = (
    conn: CanvasConnector,
    end: 'from' | 'to',
    e: React.MouseEvent
  ) => {
    if (e.button !== 0 || !activeCanvas) return;
    e.stopPropagation();
    e.preventDefault();
    setContextMenu(null);
    setSelectedConnectorId(conn.id);
    setSelectedNodeIds([]);

    const fromNode = activeCanvas.nodes.find((n) => n.id === conn.fromNodeId);
    const toNode = activeCanvas.nodes.find((n) => n.id === conn.toNodeId);
    if (!fromNode || !toNode) return;

    const p1 = getAnchorCoordinates(fromNode, conn.fromAnchor);
    const p2 = getAnchorCoordinates(toNode, conn.toAnchor);

    if (end === 'to') {
      setReconnectingConnector({
        connectorId: conn.id,
        end: 'to',
        fixedNodeId: conn.fromNodeId,
        fixedAnchor: conn.fromAnchor,
        fixedX: p1.x,
        fixedY: p1.y,
        currentX: p2.x,
        currentY: p2.y,
        hoveredTarget: { nodeId: conn.toNodeId, anchor: conn.toAnchor },
      });
    } else {
      setReconnectingConnector({
        connectorId: conn.id,
        end: 'from',
        fixedNodeId: conn.toNodeId,
        fixedAnchor: conn.toAnchor,
        fixedX: p2.x,
        fixedY: p2.y,
        currentX: p1.x,
        currentY: p1.y,
        hoveredTarget: { nodeId: conn.fromNodeId, anchor: conn.fromAnchor },
      });
    }
  };

  /**
   * Starts dragging the middle / curve of an existing arrow to bend or reposition it (Requirement 3).
   */
  const startBendConnector = (conn: CanvasConnector, e: React.MouseEvent) => {
    if (e.button !== 0 || !activeCanvas) return;
    e.stopPropagation();
    e.preventDefault();
    setContextMenu(null);
    setSelectedConnectorId(conn.id);
    setSelectedNodeIds([]);
    pushUndoSnapshot(activeCanvas);

    setBendingConnector({
      connectorId: conn.id,
      startX: e.clientX,
      startY: e.clientY,
      initBendX: conn.bendX || 0,
      initBendY: conn.bendY || 0,
    });
  };

  const findNearestAnchor = (
    worldPt: { x: number; y: number },
    excludeNodeId?: string
  ): {
    snappedTarget: { nodeId: string; anchor: AnchorSide } | null;
    snapX: number;
    snapY: number;
  } => {
    let snappedTarget: { nodeId: string; anchor: AnchorSide } | null = null;
    let snapX = worldPt.x;
    let snapY = worldPt.y;
    let bestDist = 28; // Snap radius in world units

    if (!activeCanvas) return { snappedTarget, snapX, snapY };

    for (const otherNode of activeCanvas.nodes) {
      if (excludeNodeId && otherNode.id === excludeNodeId) continue;
      for (const side of ANCHOR_SIDES) {
        const anchorPt = getAnchorCoordinates(otherNode, side);
        const d = Math.hypot(worldPt.x - anchorPt.x, worldPt.y - anchorPt.y);
        if (d < bestDist) {
          bestDist = d;
          snappedTarget = { nodeId: otherNode.id, anchor: side };
          snapX = anchorPt.x;
          snapY = anchorPt.y;
        }
      }
    }

    return { snappedTarget, snapX, snapY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeCanvas) return;
    const zoom = activeCanvas.viewport.zoom || 1;

    // 1. Live NEW Arrow Connector Dragging
    if (draggingConnector) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      const { snappedTarget, snapX, snapY } = findNearestAnchor(
        worldPt,
        draggingConnector.fromNodeId
      );

      setDraggingConnector((prev) =>
        prev
          ? {
              ...prev,
              currentX: snapX,
              currentY: snapY,
              hoveredTarget: snappedTarget,
            }
          : null
      );
      return;
    }

    // 2. Reconnecting an EXISTING Arrow Endpoint (Requirement 3)
    if (reconnectingConnector) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      const { snappedTarget, snapX, snapY } = findNearestAnchor(
        worldPt,
        reconnectingConnector.fixedNodeId
      );

      setReconnectingConnector((prev) =>
        prev
          ? {
              ...prev,
              currentX: snapX,
              currentY: snapY,
              hoveredTarget: snappedTarget,
            }
          : null
      );
      return;
    }

    // 3. Bending / Moving an EXISTING Arrow's Middle Path (Requirement 3)
    if (bendingConnector) {
      const dx = (e.clientX - bendingConnector.startX) / zoom;
      const dy = (e.clientY - bendingConnector.startY) / zoom;
      updateCanvas(activeCanvas.id, {
        connectors: activeCanvas.connectors.map((c) =>
          c.id === bendingConnector.connectorId
            ? {
                ...c,
                bendX: Math.round(bendingConnector.initBendX + dx),
                bendY: Math.round(bendingConnector.initBendY + dy),
              }
            : c
        ),
      });
      return;
    }

    // 4. Dragging Shape(s) + Smart Alignment Guide Lines (Requirement 4)
    if (draggingNode) {
      const rawDx = (e.clientX - draggingNode.startX) / zoom;
      const rawDy = (e.clientY - draggingNode.startY) / zoom;

      let finalDx = rawDx;
      let finalDy = rawDy;
      const activeGuides: AlignmentGuide[] = [];

      const primaryInit = draggingNode.initialPositions[draggingNode.nodeId];
      const primaryNode = activeCanvas.nodes.find((n) => n.id === draggingNode.nodeId);

      if (primaryInit && primaryNode && !e.altKey) {
        const SNAP_THRESHOLD = 6;
        const proposedX = primaryInit.x + rawDx;
        const proposedY = primaryInit.y + rawDy;
        const w = primaryNode.width;
        const h = primaryNode.height;

        const otherNodes = activeCanvas.nodes.filter(
          (n) => !draggingNode.initialPositions[n.id]
        );

        // Find best Vertical Guide (X alignment: left, center, right)
        let bestXDiff = SNAP_THRESHOLD + 1;
        let snapDeltaX = 0;

        const myXPoints = [
          { val: proposedX, offset: 0 },
          { val: proposedX + w / 2, offset: w / 2 },
          { val: proposedX + w, offset: w },
        ];

        for (const other of otherNodes) {
          const otherXPoints = [
            other.x,
            other.x + other.width / 2,
            other.x + other.width,
          ];
          for (const myPt of myXPoints) {
            for (const otherX of otherXPoints) {
              const diff = Math.abs(myPt.val - otherX);
              if (diff <= SNAP_THRESHOLD && diff < bestXDiff) {
                bestXDiff = diff;
                snapDeltaX = otherX - myPt.val;
              }
            }
          }
        }

        if (bestXDiff <= SNAP_THRESHOLD) {
          finalDx = rawDx + snapDeltaX;
        }

        // Find best Horizontal Guide (Y alignment: top, center, bottom)
        let bestYDiff = SNAP_THRESHOLD + 1;
        let snapDeltaY = 0;

        const myYPoints = [
          { val: proposedY, offset: 0 },
          { val: proposedY + h / 2, offset: h / 2 },
          { val: proposedY + h, offset: h },
        ];

        for (const other of otherNodes) {
          const otherYPoints = [
            other.y,
            other.y + other.height / 2,
            other.y + other.height,
          ];
          for (const myPt of myYPoints) {
            for (const otherY of otherYPoints) {
              const diff = Math.abs(myPt.val - otherY);
              if (diff <= SNAP_THRESHOLD && diff < bestYDiff) {
                bestYDiff = diff;
                snapDeltaY = otherY - myPt.val;
              }
            }
          }
        }

        if (bestYDiff <= SNAP_THRESHOLD) {
          finalDy = rawDy + snapDeltaY;
        }

        // Collect all aligned vertical & horizontal guide lines at the snapped position
        const snappedX = Math.round(primaryInit.x + finalDx);
        const snappedY = Math.round(primaryInit.y + finalDy);
        const snappedXEdges = [snappedX, snappedX + w / 2, snappedX + w];
        const snappedYEdges = [snappedY, snappedY + h / 2, snappedY + h];

        for (const other of otherNodes) {
          const otherXEdges = [other.x, other.x + other.width / 2, other.x + other.width];
          for (const sx of snappedXEdges) {
            for (const ox of otherXEdges) {
              if (Math.abs(sx - ox) <= 1) {
                const minY = Math.min(snappedY, other.y) - 20;
                const maxY = Math.max(snappedY + h, other.y + other.height) + 20;
                activeGuides.push({
                  type: 'vertical',
                  pos: ox,
                  start: minY,
                  end: maxY,
                });
              }
            }
          }

          const otherYEdges = [
            other.y,
            other.y + other.height / 2,
            other.y + other.height,
          ];
          for (const sy of snappedYEdges) {
            for (const oy of otherYEdges) {
              if (Math.abs(sy - oy) <= 1) {
                const minX = Math.min(snappedX, other.x) - 20;
                const maxX = Math.max(snappedX + w, other.x + other.width) + 20;
                activeGuides.push({
                  type: 'horizontal',
                  pos: oy,
                  start: minX,
                  end: maxX,
                });
              }
            }
          }
        }
      }

      setAlignmentGuides(activeGuides);

      updateCanvas(activeCanvas.id, {
        nodes: activeCanvas.nodes.map((n) => {
          const init = draggingNode.initialPositions[n.id];
          if (!init) return n;
          return {
            ...n,
            x: Math.round(init.x + finalDx),
            y: Math.round(init.y + finalDy),
          };
        }),
      });
      return;
    }

    // 5. Resizing Shape (with alignment guides)
    if (resizingNode) {
      const dx = (e.clientX - resizingNode.startX) / zoom;
      const dy = (e.clientY - resizingNode.startY) / zoom;
      let nextW = Math.max(70, Math.round(resizingNode.initW + dx));
      let nextH = Math.max(50, Math.round(resizingNode.initH + dy));

      const targetNode = activeCanvas.nodes.find((n) => n.id === resizingNode.nodeId);
      const activeGuides: AlignmentGuide[] = [];

      if (targetNode && !e.altKey) {
        const SNAP_THRESHOLD = 6;
        const rightEdge = targetNode.x + nextW;
        const bottomEdge = targetNode.y + nextH;

        for (const other of activeCanvas.nodes) {
          if (other.id === targetNode.id) continue;
          const otherXEdges = [other.x, other.x + other.width / 2, other.x + other.width];
          for (const ox of otherXEdges) {
            if (Math.abs(rightEdge - ox) <= SNAP_THRESHOLD) {
              nextW = Math.max(70, Math.round(ox - targetNode.x));
              activeGuides.push({
                type: 'vertical',
                pos: ox,
                start: Math.min(targetNode.y, other.y) - 20,
                end: Math.max(targetNode.y + nextH, other.y + other.height) + 20,
              });
            }
          }
          const otherYEdges = [
            other.y,
            other.y + other.height / 2,
            other.y + other.height,
          ];
          for (const oy of otherYEdges) {
            if (Math.abs(bottomEdge - oy) <= SNAP_THRESHOLD) {
              nextH = Math.max(50, Math.round(oy - targetNode.y));
              activeGuides.push({
                type: 'horizontal',
                pos: oy,
                start: Math.min(targetNode.x, other.x) - 20,
                end: Math.max(targetNode.x + nextW, other.x + other.width) + 20,
              });
            }
          }
        }
      }

      setAlignmentGuides(activeGuides);

      updateCanvas(activeCanvas.id, {
        nodes: activeCanvas.nodes.map((n) =>
          n.id === resizingNode.nodeId
            ? {
                ...n,
                width: nextW,
                height: nextH,
              }
            : n
        ),
      });
      return;
    }

    // 6. Box Selection (Marquee)
    if (selectionBox) {
      const worldPt = screenToWorld(e.clientX, e.clientY);
      const minX = Math.min(selectionBox.startX, worldPt.x);
      const maxX = Math.max(selectionBox.startX, worldPt.x);
      const minY = Math.min(selectionBox.startY, worldPt.y);
      const maxY = Math.max(selectionBox.startY, worldPt.y);

      const hitNodes = activeCanvas.nodes.filter(
        (n) =>
          n.x < maxX &&
          n.x + n.width > minX &&
          n.y < maxY &&
          n.y + n.height > minY
      );

      // Include any grouped peers of hit nodes
      const hitGroupIds = new Set(
        hitNodes.map((n) => n.groupId).filter((g): g is string => !!g)
      );
      const hitIds = new Set(hitNodes.map((n) => n.id));
      if (hitGroupIds.size > 0) {
        activeCanvas.nodes.forEach((n) => {
          if (n.groupId && hitGroupIds.has(n.groupId)) {
            hitIds.add(n.id);
          }
        });
      }

      const nextSelected = selectionBox.additive
        ? Array.from(new Set([...selectionBox.initialSelectedIds, ...Array.from(hitIds)]))
        : Array.from(hitIds);

      setSelectedNodeIds(nextSelected);
      setSelectionBox((prev) =>
        prev ? { ...prev, currentX: worldPt.x, currentY: worldPt.y } : null
      );
      return;
    }

    // 7. Panning Canvas Surface
    if (isPanning) {
      const dx = e.clientX - isPanning.startX;
      const dy = e.clientY - isPanning.startY;
      updateCanvas(activeCanvas.id, {
        viewport: {
          ...activeCanvas.viewport,
          x: isPanning.initVpX + dx,
          y: isPanning.initVpY + dy,
        },
      });
    }
  };

  const handleMouseUp = () => {
    if (draggingConnector && activeCanvas) {
      if (
        draggingConnector.hoveredTarget &&
        draggingConnector.hoveredTarget.nodeId !== draggingConnector.fromNodeId
      ) {
        pushUndoSnapshot(activeCanvas);
        const newConn: CanvasConnector = {
          id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          fromNodeId: draggingConnector.fromNodeId,
          toNodeId: draggingConnector.hoveredTarget.nodeId,
          fromAnchor: draggingConnector.fromAnchor,
          toAnchor: draggingConnector.hoveredTarget.anchor,
          label: '',
          color: '#4F46E5',
          style: 'solid',
          lineType: 'curved',
          roundness: 50,
          bendX: 0,
          bendY: 0,
          arrowEnd: true,
        };
        updateCanvas(activeCanvas.id, {
          connectors: [...activeCanvas.connectors, newConn],
        });
        setSelectedConnectorId(newConn.id);
        setSelectedNodeIds([]);
      }
      setDraggingConnector(null);
    }

    if (reconnectingConnector && activeCanvas) {
      if (
        reconnectingConnector.hoveredTarget &&
        reconnectingConnector.hoveredTarget.nodeId !== reconnectingConnector.fixedNodeId
      ) {
        pushUndoSnapshot(activeCanvas);
        updateCanvas(activeCanvas.id, {
          connectors: activeCanvas.connectors.map((c) => {
            if (c.id !== reconnectingConnector.connectorId) return c;
            if (reconnectingConnector.end === 'to') {
              return {
                ...c,
                toNodeId: reconnectingConnector.hoveredTarget!.nodeId,
                toAnchor: reconnectingConnector.hoveredTarget!.anchor,
                bendX: 0,
                bendY: 0,
              };
            }
            return {
              ...c,
              fromNodeId: reconnectingConnector.hoveredTarget!.nodeId,
              fromAnchor: reconnectingConnector.hoveredTarget!.anchor,
              bendX: 0,
              bendY: 0,
            };
          }),
        });
      }
      setReconnectingConnector(null);
    }

    setBendingConnector(null);
    setDraggingNode(null);
    setResizingNode(null);
    setIsPanning(null);
    setSelectionBox(null);
    setAlignmentGuides([]);
  };

  // Image file upload for Image Shape
  const handleImageShapeFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCanvas || selectedNodeIds.length === 0) return;
    const uploaded = await uploadWorkspaceFile(file, projectId, folderId);
    if (uploaded.dataUrl) {
      updateSelectedNodesStyle({ imageUrl: uploaded.dataUrl });
    }
    e.target.value = '';
  };

  const primarySelectedNode = activeCanvas?.nodes.find((n) => n.id === selectedNodeIds[0]);
  const activeConnector = activeCanvas?.connectors.find((c) => c.id === selectedConnectorId);

  const activeConnectorRoundness = useMemo(() => {
    if (!activeConnector) return 50;
    if (activeConnector.roundness !== undefined) return activeConnector.roundness;
    if (activeConnector.lineType === 'straight') return 0;
    if (activeConnector.lineType === 'orthogonal') return 40;
    return 50;
  }, [activeConnector]);

  const zoomPercent = Math.round((activeCanvas?.viewport.zoom || 1) * 100);
  const gridSpacing = Math.max(10, Math.round(22 * (activeCanvas?.viewport.zoom || 1)));

  return (
    <div className="flex flex-col h-[calc(100vh-11rem)] min-h-[600px] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      {/* Hidden File Input for Image Shapes */}
      <input
        ref={imageUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageShapeFileChange}
        className="hidden"
      />

      {/* Top Canvas Editor Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80">
        <div className="flex items-center gap-2">
          {activeCanvas && (
            <>
              <span className="text-base">🎨</span>
              <input
                type="text"
                dir={detectTextDirection(activeCanvas.title)}
                value={activeCanvas.title}
                onChange={(e) => updateCanvas(activeCanvas.id, { title: e.target.value })}
                className="text-sm font-bold px-2.5 py-1 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-indigo-500 bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
                placeholder="Canvas title..."
              />
              <button
                type="button"
                onClick={() => setShowMoveModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={t.project.moveItem}
              >
                <FolderInput className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>

        {/* Pan vs Box Select Tool + Shape Creation Palette */}
        {activeCanvas && (
          <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xs">
            {/* Canvas Drag Mode Switcher: Pan vs Box Selection */}
            <button
              type="button"
              onClick={() => setCanvasTool('pan')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                canvasTool === 'pan'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Pan Mode: Drag empty canvas to move around (Hold Shift + Drag for Box Select)"
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Pan</span>
            </button>
            <button
              type="button"
              onClick={() => setCanvasTool('select')}
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                canvasTool === 'select'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
              title="Box Select Mode: Drag on canvas to select multiple shapes (Hold Space or Middle-Click to Pan)"
            >
              <MousePointerSquareDashed className="w-3.5 h-3.5" />
              <span>Box Select</span>
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={() => addShape('rounded_rect')}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200"
              title="Add Rounded Box"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => addShape('circle')}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200"
              title="Add Circle"
            >
              <Circle className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => addShape('diamond')}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200"
              title="Add Decision Diamond"
            >
              <Diamond className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => addShape('sticky_note')}
              className="p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-950/50 text-amber-600"
              title="Add Sticky Note"
            >
              <StickyNote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => addShape('text')}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200"
              title="Add Text Label"
            >
              <Type className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => addShape('image')}
              className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-slate-700 dark:text-slate-200"
              title="Add Image Shape"
            >
              <ImageIcon className="w-4 h-4" />
            </button>

            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

            {/* Undo / Redo / Duplicate / Group / Layer Order / Delete */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={undoStack.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoStack.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={duplicateSelectedNodes}
              disabled={selectedNodeIds.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Duplicate Selected (Ctrl+D or Ctrl+Drag)"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={groupSelectedNodes}
              disabled={selectedNodeIds.length < 2}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Group Selected (Ctrl+G)"
            >
              <Group className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={ungroupSelectedNodes}
              disabled={selectedNodeIds.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Ungroup (Ctrl+Shift+G)"
            >
              <Ungroup className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeLayerOrder('front')}
              disabled={selectedNodeIds.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Bring to Front (])"
            >
              <ArrowUpToLine className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeLayerOrder('back')}
              disabled={selectedNodeIds.length === 0}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30"
              title="Send to Back ([)"
            >
              <ArrowDownToLine className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={deleteSelection}
              disabled={selectedNodeIds.length === 0 && !selectedConnectorId}
              className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 disabled:opacity-30"
              title="Delete Selected (Del)"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Zoom Controls */}
        {activeCanvas && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                updateCanvas(activeCanvas.id, {
                  viewport: {
                    ...activeCanvas.viewport,
                    zoom: Math.max(0.25, +(activeCanvas.viewport.zoom - 0.15).toFixed(2)),
                  },
                })
              }
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Zoom Out (Ctrl + Scroll Down)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono w-12 text-center">{zoomPercent}%</span>
            <button
              type="button"
              onClick={() =>
                updateCanvas(activeCanvas.id, {
                  viewport: {
                    ...activeCanvas.viewport,
                    zoom: Math.min(2.6, +(activeCanvas.viewport.zoom + 0.15).toFixed(2)),
                  },
                })
              }
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Zoom In (Ctrl + Scroll Up)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                updateCanvas(activeCanvas.id, {
                  viewport: { x: 40, y: 40, zoom: 1 },
                })
              }
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Reset Pan & Zoom (100%)"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Requirement 1: Static Single-Line Design Toolbar (Always rendered at fixed height; empty when no shape or arrow is selected) */}
      {activeCanvas && (
        <div className="h-11 shrink-0 flex items-center gap-2 px-3 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 text-xs whitespace-nowrap overflow-x-auto">
          {primarySelectedNode && (
            <>
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                Shape Style ({selectedNodeIds.length}):
              </span>

              {/* Color Swatches */}
              <div className="flex items-center gap-1">
                {SHAPE_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() =>
                      updateSelectedNodesStyle({
                        fillColor: c.fill,
                        borderColor: c.border,
                        textColor: c.text,
                      })
                    }
                    className="w-5 h-5 rounded-full border-2 transition hover:scale-110"
                    style={{ backgroundColor: c.fill, borderColor: c.border }}
                    title={c.label}
                  />
                ))}
              </div>

              <select
                value={primarySelectedNode.borderStyle}
                onChange={(e) =>
                  updateSelectedNodesStyle({
                    borderStyle: e.target.value as CanvasNode['borderStyle'],
                  })
                }
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="solid">Solid Border</option>
                <option value="dashed">Dashed Border</option>
                <option value="dotted">Dotted Border</option>
                <option value="none">No Border</option>
              </select>

              {/* Image Shape specific controls */}
              {primarySelectedNode.type === 'image' ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imageUploadInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-2xs transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Select Image from Computer</span>
                  </button>

                  {projectImageFiles.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        const chosen = projectImageFiles.find(
                          (f) => f.id === e.target.value
                        );
                        if (chosen?.dataUrl) {
                          updateSelectedNodesStyle({ imageUrl: chosen.dataUrl });
                        }
                      }}
                      className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <option value="">Select from Project Images...</option>
                      {projectImageFiles.map((imgFile) => (
                        <option key={imgFile.id} value={imgFile.id}>
                          {imgFile.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    value={primarySelectedNode.imageUrl || ''}
                    onChange={(e) =>
                      updateSelectedNodesStyle({ imageUrl: e.target.value })
                    }
                    placeholder="Or paste Image URL..."
                    className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-48"
                  />
                </div>
              ) : (
                /* Text formatting (Bold, Italics, Font Size, Horizontal & Vertical Align Top/Center/Bottom) */
                <>
                  <select
                    value={primarySelectedNode.fontSize}
                    onChange={(e) =>
                      updateSelectedNodesStyle({ fontSize: Number(e.target.value) })
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value={12}>12px</option>
                    <option value={14}>14px</option>
                    <option value={16}>16px</option>
                    <option value={20}>20px</option>
                    <option value={24}>24px</option>
                  </select>

                  {/* Bold & Italic Toggles */}
                  <div className="flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedNodesStyle({ bold: !primarySelectedNode.bold })
                      }
                      className={`p-1 rounded transition ${
                        primarySelectedNode.bold
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Bold Text"
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedNodesStyle({ italic: !primarySelectedNode.italic })
                      }
                      className={`p-1 rounded transition ${
                        primarySelectedNode.italic
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Italic Text"
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Horizontal Alignment */}
                  <select
                    value={primarySelectedNode.textAlign}
                    onChange={(e) =>
                      updateSelectedNodesStyle({
                        textAlign: e.target.value as CanvasNode['textAlign'],
                      })
                    }
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="left">Align Left</option>
                    <option value="center">Align Center</option>
                    <option value="right">Align Right (RTL)</option>
                  </select>

                  {/* Vertical Alignment: Top / Center / Bottom */}
                  <div
                    className="flex items-center gap-0.5 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 p-0.5"
                    title="Vertical Text Alignment (Top / Center / Bottom)"
                  >
                    <button
                      type="button"
                      onClick={() => updateSelectedNodesStyle({ verticalAlign: 'top' })}
                      className={`p-1 rounded transition ${
                        (primarySelectedNode.verticalAlign || 'center') === 'top'
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Align Text Top"
                    >
                      <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedNodesStyle({ verticalAlign: 'center' })
                      }
                      className={`p-1 rounded transition ${
                        (primarySelectedNode.verticalAlign || 'center') === 'center'
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Align Text Middle / Center"
                    >
                      <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedNodesStyle({ verticalAlign: 'bottom' })
                      }
                      className={`p-1 rounded transition ${
                        (primarySelectedNode.verticalAlign || 'center') === 'bottom'
                          ? 'bg-indigo-600 text-white'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                      title="Align Text Bottom"
                    >
                      <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {/* Requirement 3: Single-line Connector Arrow Design Controls (Type, Roundness, Style, Color, Label, Reverse, Delete) */}
          {!primarySelectedNode && activeConnector && (
            <>
              <span className="font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                Arrow:
              </span>

              {/* Arrow Type Selector */}
              <select
                value={activeConnector.lineType}
                onChange={(e) => {
                  const nextType = e.target.value as CanvasConnector['lineType'];
                  updateActiveConnector(
                    {
                      lineType: nextType,
                      roundness:
                        nextType === 'straight'
                          ? 0
                          : nextType === 'orthogonal'
                          ? activeConnector.roundness || 40
                          : activeConnector.roundness || 50,
                    },
                    true
                  );
                }}
                className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium shrink-0"
                title="Arrow Path Type"
              >
                <option value="curved">Curved</option>
                <option value="orthogonal">Elbow</option>
                <option value="straight">Straight</option>
              </select>

              {/* Compact Amount of Roundness Slider */}
              <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 shrink-0">
                <span className="text-[11px] text-slate-500 font-medium">
                  Roundness
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={activeConnectorRoundness}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    updateActiveConnector({
                      roundness: val,
                      lineType:
                        activeConnector.lineType === 'straight' && val > 0
                          ? 'curved'
                          : activeConnector.lineType,
                    });
                  }}
                  className="w-16 accent-indigo-600 cursor-pointer"
                  title="Adjust the amount of roundness / curvature (0% to 100%)"
                />
                <span className="text-[10px] font-mono w-7 text-end text-slate-600 dark:text-slate-300">
                  {activeConnectorRoundness}%
                </span>
              </div>

              {/* Solid vs Dashed */}
              <select
                value={activeConnector.style}
                onChange={(e) =>
                  updateActiveConnector(
                    { style: e.target.value as 'solid' | 'dashed' },
                    true
                  )
                }
                className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0"
              >
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
              </select>

              {/* Arrow Color Swatches */}
              <div className="flex items-center gap-1 shrink-0">
                {SHAPE_COLORS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => updateActiveConnector({ color: c.border }, true)}
                    className={`w-4 h-4 rounded-full border transition hover:scale-110 ${
                      activeConnector.color === c.border
                        ? 'ring-2 ring-offset-1 ring-indigo-500'
                        : ''
                    }`}
                    style={{ backgroundColor: c.border, borderColor: c.border }}
                    title={`Arrow Color: ${c.label}`}
                  />
                ))}
              </div>

              {/* Label Input */}
              <input
                type="text"
                value={activeConnector.label || ''}
                onChange={(e) => updateActiveConnector({ label: e.target.value })}
                placeholder="Label..."
                className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 w-24 shrink-0"
              />

              {/* Reverse Direction */}
              <button
                type="button"
                onClick={() =>
                  updateActiveConnector(
                    {
                      fromNodeId: activeConnector.toNodeId,
                      toNodeId: activeConnector.fromNodeId,
                      fromAnchor: activeConnector.toAnchor,
                      toAnchor: activeConnector.fromAnchor,
                    },
                    true
                  )
                }
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                title="Reverse Arrow Direction"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Reverse</span>
              </button>

              {/* Reset Manual Bend if bent */}
              {((activeConnector.bendX || 0) !== 0 ||
                (activeConnector.bendY || 0) !== 0) && (
                <button
                  type="button"
                  onClick={() => updateActiveConnector({ bendX: 0, bendY: 0 }, true)}
                  className="inline-flex items-center gap-1 px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 shrink-0"
                  title="Reset Arrow Curve Bend"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}

              {/* Delete Arrow Button */}
              <button
                type="button"
                onClick={() => deleteConnectorById(activeConnector.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-300 hover:bg-rose-100 font-semibold transition shrink-0"
                title="Delete Arrow (Del)"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* Infinite Canvas Surface */}
      {!activeCanvas ? (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
          <p className="text-slate-500 mb-3">No canvases in this project/folder yet.</p>
          <button
            type="button"
            onClick={() => createCanvas(projectId, folderId, 'Architecture & Ideas Board')}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
          >
            + Create First Visual Canvas
          </button>
        </div>
      ) : (
        <div
          ref={containerRef}
          onMouseDown={(e) => {
            if (e.button !== 0 && e.button !== 1) return;
            setContextMenu(null);

            const wantBoxSelect =
              e.button === 0 &&
              !isSpacePressed &&
              (canvasTool === 'select' || e.shiftKey);

            if (wantBoxSelect) {
              const worldPt = screenToWorld(e.clientX, e.clientY);
              if (!e.shiftKey) {
                setSelectedNodeIds([]);
              }
              setSelectedConnectorId(null);
              setSelectionBox({
                startX: worldPt.x,
                startY: worldPt.y,
                currentX: worldPt.x,
                currentY: worldPt.y,
                additive: e.shiftKey,
                initialSelectedIds: e.shiftKey ? selectedNodeIds : [],
              });
            } else {
              setSelectedNodeIds([]);
              setSelectedConnectorId(null);
              setIsPanning({
                startX: e.clientX,
                startY: e.clientY,
                initVpX: activeCanvas.viewport.x,
                initVpY: activeCanvas.viewport.y,
              });
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const worldPt = screenToWorld(e.clientX, e.clientY);
            setContextMenu({
              x: Math.min(e.clientX, window.innerWidth - 240),
              y: Math.min(e.clientY, window.innerHeight - 320),
              worldX: worldPt.x,
              worldY: worldPt.y,
              targetType: 'canvas',
            });
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className={`relative flex-1 overflow-hidden select-none ${
            canvasTool === 'select' && !isSpacePressed
              ? 'cursor-crosshair'
              : 'cursor-grab active:cursor-grabbing'
          }`}
          style={{
            backgroundImage:
              'radial-gradient(circle, rgba(148, 163, 184, 0.42) 1.25px, transparent 1.25px)',
            backgroundSize: `${gridSpacing}px ${gridSpacing}px`,
            backgroundPosition: `${activeCanvas.viewport.x}px ${activeCanvas.viewport.y}px`,
          }}
        >
          {/* Transformed Viewport Layer */}
          <div
            className="pointer-events-none"
            style={{
              transform: `translate(${activeCanvas.viewport.x}px, ${activeCanvas.viewport.y}px) scale(${activeCanvas.viewport.zoom})`,
              transformOrigin: '0 0',
              width: '4000px',
              height: '3000px',
              position: 'absolute',
              top: 0,
              left: 0,
            }}
          >
            {/* Nodes Layer */}
            {[...activeCanvas.nodes]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((node) => {
                const isSelected = selectedNodeIds.includes(node.id);
                const textDir = detectTextDirection(node.text);
                const isDiamond = node.type === 'diamond';
                const isImageShape = node.type === 'image';
                const vAlign = node.verticalAlign || 'center';

                return (
                  <div
                    key={node.id}
                    onMouseDown={(e) => startNodeDrag(e, node)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!selectedNodeIds.includes(node.id)) {
                        const groupPeers = node.groupId
                          ? activeCanvas.nodes
                              .filter((n) => n.groupId === node.groupId)
                              .map((n) => n.id)
                          : [node.id];
                        setSelectedNodeIds(groupPeers);
                      }
                      setSelectedConnectorId(null);
                      const worldPt = screenToWorld(e.clientX, e.clientY);
                      setContextMenu({
                        x: Math.min(e.clientX, window.innerWidth - 240),
                        y: Math.min(e.clientY, window.innerHeight - 360),
                        worldX: worldPt.x,
                        worldY: worldPt.y,
                        targetType: 'node',
                        targetId: node.id,
                      });
                    }}
                    onDragOver={(e) => {
                      if (isImageShape) {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    onDrop={async (e) => {
                      if (!isImageShape) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const fileId = e.dataTransfer.getData(
                        'application/x-memoryhub-file-id'
                      );
                      if (fileId) {
                        const f = state.files.find((fl) => fl.id === fileId);
                        if (f?.dataUrl) {
                          updateCanvas(activeCanvas.id, {
                            nodes: activeCanvas.nodes.map((n) =>
                              n.id === node.id ? { ...n, imageUrl: f.dataUrl } : n
                            ),
                          });
                        }
                        return;
                      }
                      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const uploaded = await uploadWorkspaceFile(
                          e.dataTransfer.files[0],
                          projectId,
                          folderId
                        );
                        if (uploaded.dataUrl) {
                          updateCanvas(activeCanvas.id, {
                            nodes: activeCanvas.nodes.map((n) =>
                              n.id === node.id ? { ...n, imageUrl: uploaded.dataUrl } : n
                            ),
                          });
                        }
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: node.x,
                      top: node.y,
                      width: node.width,
                      height: node.height,
                      backgroundColor: isDiamond ? 'transparent' : node.fillColor,
                      borderColor: isDiamond
                        ? 'transparent'
                        : isSelected
                        ? '#4F46E5'
                        : node.borderColor,
                      borderStyle: isDiamond ? 'none' : node.borderStyle,
                      borderWidth:
                        isDiamond || node.borderStyle === 'none' ? 0 : node.borderWidth,
                      borderRadius:
                        node.type === 'circle'
                          ? '9999px'
                          : node.type === 'rounded_rect' || node.type === 'image'
                          ? '14px'
                          : node.type === 'sticky_note'
                          ? '6px'
                          : '4px',
                      color: node.textColor,
                      zIndex: node.zIndex,
                      boxShadow: isDiamond
                        ? undefined
                        : node.type === 'sticky_note'
                        ? '0 8px 20px -4px rgba(0,0,0,0.12)'
                        : isSelected
                        ? '0 0 0 3px rgba(79, 70, 229, 0.25)'
                        : undefined,
                    }}
                    className={`pointer-events-auto group flex flex-col transition-shadow ${
                      isImageShape ? 'p-1.5 cursor-move' : 'p-3.5'
                    } ${
                      vAlign === 'top'
                        ? 'justify-start'
                        : vAlign === 'bottom'
                        ? 'justify-end'
                        : 'justify-center'
                    }`}
                  >
                    {/* Widened Draggable Border Zone (-12px outside to +14px inside all 4 edges) */}
                    <div
                      onMouseDown={(e) => startNodeDrag(e, node)}
                      title="Drag border to move shape (Ctrl+Drag to duplicate)"
                      className="absolute -top-3 -left-3 -right-3 h-[26px] cursor-move z-10"
                    />
                    <div
                      onMouseDown={(e) => startNodeDrag(e, node)}
                      title="Drag border to move shape (Ctrl+Drag to duplicate)"
                      className="absolute -bottom-3 -left-3 -right-3 h-[26px] cursor-move z-10"
                    />
                    <div
                      onMouseDown={(e) => startNodeDrag(e, node)}
                      title="Drag border to move shape (Ctrl+Drag to duplicate)"
                      className="absolute -top-3 -bottom-3 -left-3 w-[26px] cursor-move z-10"
                    />
                    <div
                      onMouseDown={(e) => startNodeDrag(e, node)}
                      title="Drag border to move shape (Ctrl+Drag to duplicate)"
                      className="absolute -top-3 -bottom-3 -right-3 w-[26px] cursor-move z-10"
                    />

                    {/* True SVG Diamond Polygon for 'diamond' shape */}
                    {isDiamond && (
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                      >
                        <polygon
                          points="50,2 98,50 50,98 2,50"
                          fill={node.fillColor}
                          stroke={isSelected ? '#4F46E5' : node.borderColor}
                          strokeWidth={
                            node.borderStyle === 'none'
                              ? 0
                              : node.borderWidth + (isSelected ? 1 : 0)
                          }
                          strokeDasharray={
                            node.borderStyle === 'dashed'
                              ? '6 4'
                              : node.borderStyle === 'dotted'
                              ? '2 3'
                              : undefined
                          }
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}

                    {/* Image shape fills the shape with a little border and no text */}
                    {isImageShape ? (
                      node.imageUrl ? (
                        <img
                          src={node.imageUrl}
                          alt="Canvas shape"
                          className="w-full h-full object-cover rounded-[10px] pointer-events-none select-none"
                        />
                      ) : (
                        <button
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            setSelectedNodeIds([node.id]);
                            imageUploadInputRef.current?.click();
                          }}
                          className="w-full h-full rounded-[10px] border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-1 text-xs text-slate-500 hover:border-indigo-500 hover:text-indigo-600 z-20"
                        >
                          <ImageIcon className="w-6 h-6" />
                          <span>Select Image</span>
                        </button>
                      )
                    ) : (
                      /* Shape Textarea with Vertical Align, Bold & Italics */
                      <textarea
                        dir={textDir}
                        rows={Math.max(1, node.text.split('\n').length)}
                        value={node.text}
                        onChange={(e) => {
                          updateCanvas(activeCanvas.id, {
                            nodes: activeCanvas.nodes.map((n) =>
                              n.id === node.id ? { ...n, text: e.target.value } : n
                            ),
                          });
                        }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          if (!selectedNodeIds.includes(node.id)) {
                            setSelectedNodeIds([node.id]);
                            setSelectedConnectorId(null);
                          }
                        }}
                        style={{
                          fontSize: `${node.fontSize}px`,
                          textAlign: node.textAlign,
                          color: node.textColor,
                          fontWeight: node.bold ? 700 : 500,
                          fontStyle: node.italic ? 'italic' : 'normal',
                        }}
                        className={`relative z-0 w-full max-h-full bg-transparent resize-none border-none focus:outline-none leading-snug overflow-hidden ${
                          isDiamond ? 'px-5' : ''
                        }`}
                      />
                    )}

                    {/* Group Badge */}
                    {node.groupId && (
                      <span className="absolute -top-5 left-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-medium pointer-events-none">
                        Grouped
                      </span>
                    )}

                    {/* Connection Anchor Dots (Drag from an anchor dot to pull out an arrow) */}
                    {ANCHOR_SIDES.map((anchor) => {
                      const posClass =
                        anchor === 'top'
                          ? '-top-2 left-1/2 -translate-x-1/2'
                          : anchor === 'right'
                          ? 'top-1/2 -right-2 -translate-y-1/2'
                          : anchor === 'bottom'
                          ? '-bottom-2 left-1/2 -translate-x-1/2'
                          : 'top-1/2 -left-2 -translate-y-1/2';

                      const activeHoverTarget =
                        draggingConnector?.hoveredTarget ||
                        reconnectingConnector?.hoveredTarget;
                      const isSnapTarget =
                        activeHoverTarget?.nodeId === node.id &&
                        activeHoverTarget?.anchor === anchor;
                      const isDraggingAnyArrow =
                        !!draggingConnector || !!reconnectingConnector;

                      return (
                        <div
                          key={anchor}
                          onMouseDown={(e) => handleAnchorMouseDown(node, anchor, e)}
                          title="Drag this anchor dot to pull an arrow to another shape"
                          className={`absolute ${posClass} z-40 w-4 h-4 rounded-full border-2 cursor-crosshair transition ${
                            isSnapTarget
                              ? 'bg-emerald-500 border-white scale-150 opacity-100 shadow-md'
                              : isDraggingAnyArrow
                              ? 'bg-white border-indigo-600 opacity-100 hover:scale-125'
                              : 'bg-white border-indigo-600 opacity-0 group-hover:opacity-100 hover:scale-125'
                          }`}
                        />
                      );
                    })}

                    {/* Bottom-Right Resize Handle */}
                    {isSelected && (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          pushUndoSnapshot(activeCanvas);
                          setResizingNode({
                            nodeId: node.id,
                            startX: e.clientX,
                            startY: e.clientY,
                            initW: node.width,
                            initH: node.height,
                          });
                        }}
                        className="absolute -bottom-2 -right-2 z-40 w-4 h-4 bg-indigo-600 border-2 border-white rounded-xs cursor-nwse-resize shadow-xs"
                        title="Drag to resize shape"
                      />
                    )}
                  </div>
                );
              })}

            {/* SVG Connectors & Smart Guides Layer (Rendered above nodes so arrows, endpoints, and delete buttons are never blocked by node borders) */}
            <svg
              style={{ zIndex: 999 }}
              className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
            >
              <defs>
                <marker
                  id="canvas-arrow"
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#4F46E5" />
                </marker>
                <marker
                  id="canvas-arrow-selected"
                  viewBox="0 0 10 10"
                  refX="8.5"
                  refY="5"
                  markerWidth="6.5"
                  markerHeight="6.5"
                  orient="auto"
                >
                  <path d="M 0 1 L 10 5 L 0 9 z" fill="#E11D48" />
                </marker>
              </defs>

              {/* Requirement 4: Smart Alignment Guide Lines when moving/resizing shapes */}
              {alignmentGuides.map((g, idx) =>
                g.type === 'vertical' ? (
                  <g key={`vguide-${idx}`} className="pointer-events-none">
                    <line
                      x1={g.pos}
                      y1={g.start}
                      x2={g.pos}
                      y2={g.end}
                      stroke="#F43F5E"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                    />
                    <circle cx={g.pos} cy={g.start + 12} r={3} fill="#F43F5E" />
                    <circle cx={g.pos} cy={g.end - 12} r={3} fill="#F43F5E" />
                  </g>
                ) : (
                  <g key={`hguide-${idx}`} className="pointer-events-none">
                    <line
                      x1={g.start}
                      y1={g.pos}
                      x2={g.end}
                      y2={g.pos}
                      stroke="#F43F5E"
                      strokeWidth={1.5}
                      strokeDasharray="5 3"
                    />
                    <circle cx={g.start + 12} cy={g.pos} r={3} fill="#F43F5E" />
                    <circle cx={g.end - 12} cy={g.pos} r={3} fill="#F43F5E" />
                  </g>
                )
              )}

              {/* Existing Connectors */}
              {activeCanvas.connectors.map((conn) => {
                const fromNode = activeCanvas.nodes.find((n) => n.id === conn.fromNodeId);
                const toNode = activeCanvas.nodes.find((n) => n.id === conn.toNodeId);
                if (!fromNode || !toNode) return null;

                const isReconnectingThis =
                  reconnectingConnector?.connectorId === conn.id;

                const p1 =
                  isReconnectingThis && reconnectingConnector.end === 'from'
                    ? {
                        x: reconnectingConnector.currentX,
                        y: reconnectingConnector.currentY,
                      }
                    : getAnchorCoordinates(fromNode, conn.fromAnchor);

                const p2 =
                  isReconnectingThis && reconnectingConnector.end === 'to'
                    ? {
                        x: reconnectingConnector.currentX,
                        y: reconnectingConnector.currentY,
                      }
                    : getAnchorCoordinates(toNode, conn.toAnchor);

                const effFromAnchor =
                  isReconnectingThis && reconnectingConnector.end === 'from'
                    ? reconnectingConnector.hoveredTarget?.anchor || conn.fromAnchor
                    : conn.fromAnchor;

                const effToAnchor =
                  isReconnectingThis && reconnectingConnector.end === 'to'
                    ? reconnectingConnector.hoveredTarget?.anchor
                    : conn.toAnchor;

                const { pathData, midPoint } = computeConnectorGeometry(
                  p1,
                  p2,
                  conn.lineType,
                  effFromAnchor,
                  effToAnchor,
                  conn.roundness,
                  conn.bendX || 0,
                  conn.bendY || 0
                );

                const isSelected = selectedConnectorId === conn.id;
                const isHovered = hoveredConnectorId === conn.id;
                const showHandles = isSelected || isHovered || isReconnectingThis;
                const strokeColor = isSelected ? '#E11D48' : conn.color || '#4F46E5';
                const markerId = `conn-arrow-${conn.id}`;

                return (
                  <g
                    key={conn.id}
                    className="pointer-events-auto"
                    onMouseEnter={() => setHoveredConnectorId(conn.id)}
                    onMouseLeave={() =>
                      setHoveredConnectorId((prev) => (prev === conn.id ? null : prev))
                    }
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      setContextMenu(null);
                      setSelectedConnectorId(conn.id);
                      setSelectedNodeIds([]);

                      // Requirement 3: Dragging near either end reconnects that endpoint; dragging the middle bends/moves the arrow path!
                      const worldPt = screenToWorld(e.clientX, e.clientY);
                      const dStart = Math.hypot(worldPt.x - p1.x, worldPt.y - p1.y);
                      const dEnd = Math.hypot(worldPt.x - p2.x, worldPt.y - p2.y);

                      if (dEnd <= 32) {
                        startReconnectConnector(conn, 'to', e);
                      } else if (dStart <= 32) {
                        startReconnectConnector(conn, 'from', e);
                      } else {
                        startBendConnector(conn, e);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedConnectorId(conn.id);
                      setSelectedNodeIds([]);
                      const worldPt = screenToWorld(e.clientX, e.clientY);
                      setContextMenu({
                        x: Math.min(e.clientX, window.innerWidth - 240),
                        y: Math.min(e.clientY, window.innerHeight - 320),
                        worldX: worldPt.x,
                        worldY: worldPt.y,
                        targetType: 'connector',
                        targetId: conn.id,
                      });
                    }}
                  >
                    {/* Per-connector colored arrowhead marker */}
                    <defs>
                      <marker
                        id={markerId}
                        viewBox="0 0 10 10"
                        refX="8.5"
                        refY="5"
                        markerWidth="6.5"
                        markerHeight="6.5"
                        orient="auto"
                      >
                        <path d="M 0 1 L 10 5 L 0 9 z" fill={strokeColor} />
                      </marker>
                    </defs>

                    {/* Wide invisible hit path so clicking/dragging a connector line is effortless */}
                    <path
                      d={pathData}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={18}
                      className="cursor-grab active:cursor-grabbing"
                    />
                    <path
                      d={pathData}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3.5 : isHovered ? 3 : 2.5}
                      strokeDasharray={
                        isReconnectingThis && !reconnectingConnector?.hoveredTarget
                          ? '5 4'
                          : conn.style === 'dashed'
                          ? '6 4'
                          : undefined
                      }
                      markerEnd={conn.arrowEnd ? `url(#${markerId})` : undefined}
                      className="cursor-grab active:cursor-grabbing transition-colors"
                    />

                    {/* Connector Label Badge */}
                    {conn.label && (
                      <g transform={`translate(${midPoint.x}, ${midPoint.y - 18})`}>
                        <rect
                          x={-48}
                          y={-11}
                          width={96}
                          height={22}
                          rx={6}
                          fill="#FFFFFF"
                          stroke={strokeColor}
                          strokeWidth={1.2}
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          className="text-[11px] fill-slate-700 font-medium select-none"
                        >
                          {conn.label}
                        </text>
                      </g>
                    )}

                    {/* Requirement 3: Draggable Start Endpoint Handle, End (Arrowhead) Handle, Midpoint Bend Handle, and On-Canvas Delete Button */}
                    {showHandles && (
                      <>
                        {/* Start ('from') Endpoint Handle */}
                        <g
                          transform={`translate(${p1.x}, ${p1.y})`}
                          className="cursor-crosshair"
                          onMouseDown={(e) => startReconnectConnector(conn, 'from', e)}
                        >
                          <title>Drag arrow tail to move start connection to another anchor</title>
                          <circle r={12} fill="transparent" />
                          <circle
                            r={6}
                            fill="#FFFFFF"
                            stroke={strokeColor}
                            strokeWidth={2.5}
                          />
                        </g>

                        {/* End ('to' / Arrowhead) Endpoint Handle */}
                        <g
                          transform={`translate(${p2.x}, ${p2.y})`}
                          className="cursor-crosshair"
                          onMouseDown={(e) => startReconnectConnector(conn, 'to', e)}
                        >
                          <title>Drag arrowhead to attach to another shape or anchor</title>
                          <circle r={12} fill="transparent" />
                          <circle
                            r={6.5}
                            fill={strokeColor}
                            stroke="#FFFFFF"
                            strokeWidth={2}
                          />
                        </g>

                        {/* Midpoint Curve/Bend Handle */}
                        <g
                          transform={`translate(${midPoint.x}, ${midPoint.y})`}
                          className="cursor-move"
                          onMouseDown={(e) => startBendConnector(conn, e)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            pushUndoSnapshot(activeCanvas);
                            updateCanvas(activeCanvas.id, {
                              connectors: activeCanvas.connectors.map((c) =>
                                c.id === conn.id ? { ...c, bendX: 0, bendY: 0 } : c
                              ),
                            });
                          }}
                        >
                          <title>Drag to bend or move arrow path (Double-click to reset)</title>
                          <circle r={10} fill="transparent" />
                          <circle
                            r={5}
                            fill="#FFFFFF"
                            stroke={strokeColor}
                            strokeWidth={2}
                          />
                        </g>

                        {/* Quick On-Canvas Delete Arrow Button when selected */}
                        {isSelected && (
                          <g
                            transform={`translate(${midPoint.x + 22}, ${midPoint.y - 14})`}
                            className="cursor-pointer"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              deleteConnectorById(conn.id);
                            }}
                          >
                            <title>Delete Arrow (Del)</title>
                            <circle
                              r={10}
                              fill="#E11D48"
                              stroke="#FFFFFF"
                              strokeWidth={1.5}
                            />
                            <path
                              d="M -3.5 -3.5 L 3.5 3.5 M 3.5 -3.5 L -3.5 3.5"
                              stroke="#FFFFFF"
                              strokeWidth={2}
                              strokeLinecap="round"
                            />
                          </g>
                        )}
                      </>
                    )}
                  </g>
                );
              })}

              {/* Live NEW Arrow Being Dragged from an Anchor Dot */}
              {draggingConnector && (
                <path
                  d={
                    computeConnectorGeometry(
                      { x: draggingConnector.startX, y: draggingConnector.startY },
                      { x: draggingConnector.currentX, y: draggingConnector.currentY },
                      'curved',
                      draggingConnector.fromAnchor,
                      draggingConnector.hoveredTarget?.anchor,
                      50
                    ).pathData
                  }
                  fill="none"
                  stroke="#4F46E5"
                  strokeWidth={2.75}
                  strokeDasharray={draggingConnector.hoveredTarget ? undefined : '5 4'}
                  markerEnd="url(#canvas-arrow)"
                />
              )}
            </svg>

            {/* Box Selection Marquee Rectangle */}
            {selectionBox && (
              <div
                style={{
                  position: 'absolute',
                  left: Math.min(selectionBox.startX, selectionBox.currentX),
                  top: Math.min(selectionBox.startY, selectionBox.currentY),
                  width: Math.abs(selectionBox.currentX - selectionBox.startX),
                  height: Math.abs(selectionBox.currentY - selectionBox.startY),
                }}
                className="border-2 border-indigo-600 bg-indigo-500/15 rounded-xs pointer-events-none z-50"
              />
            )}
          </div>

          {/* Bottom Helper Overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none text-[11px] text-slate-500">
            <span className="bg-white/90 dark:bg-slate-800/90 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
              Tip: Drag canvas to pan • Drag arrow ends to reconnect or middle to bend • Click arrow for roundness & delete • Drag shape border to move (with smart alignment guides)
            </span>
            <button
              type="button"
              onClick={() => deleteCanvasToTrash(activeCanvas.id)}
              className="pointer-events-auto px-2.5 py-1 rounded-lg bg-white/90 dark:bg-slate-800/90 border border-rose-200 text-rose-600 hover:bg-rose-50"
            >
              Move Canvas to Trash
            </button>
          </div>
        </div>
      )}

      {/* Comprehensive Right-Click Context Menu */}
      {contextMenu && activeCanvas && (
        <div
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-1.5 space-y-0.5 text-xs select-none"
        >
          {contextMenu.targetType === 'node' && (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Shape Actions ({selectedNodeIds.length} selected)
              </div>
              <button
                type="button"
                onClick={() => {
                  copySelectedNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-slate-500" /> Copy
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+C</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  cutSelectedNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5 text-slate-500" /> Cut
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+X</kbd>
              </button>
              <button
                type="button"
                disabled={!hasClipboard}
                onClick={() => {
                  pasteFromClipboard({
                    x: contextMenu.worldX,
                    y: contextMenu.worldY,
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste className="w-3.5 h-3.5 text-slate-500" /> Paste
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+V</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  duplicateSelectedNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-indigo-500" /> Duplicate
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+D</kbd>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  changeLayerOrder('front');
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <ArrowUpToLine className="w-3.5 h-3.5 text-slate-500" /> Bring to Front
                </span>
                <kbd className="text-[10px] text-slate-400">]</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  changeLayerOrder('forward');
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <ArrowUp className="w-3.5 h-3.5 text-slate-500" /> Bring Forward
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  changeLayerOrder('backward');
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <ArrowDown className="w-3.5 h-3.5 text-slate-500" /> Send Backward
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  changeLayerOrder('back');
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <ArrowDownToLine className="w-3.5 h-3.5 text-slate-500" /> Send to Back
                </span>
                <kbd className="text-[10px] text-slate-400">[</kbd>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                disabled={selectedNodeIds.length < 2}
                onClick={() => {
                  groupSelectedNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Group className="w-3.5 h-3.5 text-indigo-500" /> Group Selected
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+G</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  ungroupSelectedNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <Ungroup className="w-3.5 h-3.5 text-slate-500" /> Ungroup
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+Shift+G</kbd>
              </button>

              {primarySelectedNode?.type === 'image' ? (
                <>
                  <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      imageUploadInputRef.current?.click();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 font-medium"
                  >
                    <Upload className="w-3.5 h-3.5" /> Select / Replace Image...
                  </button>
                </>
              ) : (
                primarySelectedNode && (
                  <>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <div className="px-2.5 py-1 flex items-center justify-between gap-1">
                      <span className="text-[10px] text-slate-400 font-semibold">
                        Text Style:
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedNodesStyle({ bold: !primarySelectedNode.bold })
                          }
                          className={`p-1 rounded ${
                            primarySelectedNode.bold
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Bold"
                        >
                          <Bold className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedNodesStyle({
                              italic: !primarySelectedNode.italic,
                            })
                          }
                          className={`p-1 rounded ${
                            primarySelectedNode.italic
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Italic"
                        >
                          <Italic className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedNodesStyle({ verticalAlign: 'top' })
                          }
                          className={`p-1 rounded ${
                            primarySelectedNode.verticalAlign === 'top'
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Align Top"
                        >
                          <AlignVerticalJustifyStart className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedNodesStyle({ verticalAlign: 'center' })
                          }
                          className={`p-1 rounded ${
                            (primarySelectedNode.verticalAlign || 'center') === 'center'
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Align Middle"
                        >
                          <AlignVerticalJustifyCenter className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updateSelectedNodesStyle({ verticalAlign: 'bottom' })
                          }
                          className={`p-1 rounded ${
                            primarySelectedNode.verticalAlign === 'bottom'
                              ? 'bg-indigo-600 text-white'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                          title="Align Bottom"
                        >
                          <AlignVerticalJustifyEnd className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </>
                )
              )}

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  deleteSelection();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 font-medium"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </span>
                <kbd className="text-[10px] text-rose-400">Del</kbd>
              </button>
            </>
          )}

          {contextMenu.targetType === 'connector' && activeConnector && (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Connector Arrow Actions
              </div>

              {/* Line Type & Roundness options right in the context menu */}
              <div className="px-2.5 py-1 space-y-1.5">
                <div className="text-[10px] text-slate-400 font-semibold">
                  Arrow Type & Roundness:
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'straight', label: 'Straight' },
                      { id: 'curved', label: 'Curved' },
                      { id: 'orthogonal', label: 'Elbow' },
                    ] as const
                  ).map((lt) => (
                    <button
                      key={lt.id}
                      type="button"
                      onClick={() =>
                        updateActiveConnector(
                          {
                            lineType: lt.id,
                            roundness:
                              lt.id === 'straight'
                                ? 0
                                : lt.id === 'orthogonal'
                                ? 40
                                : 50,
                          },
                          true
                        )
                      }
                      className={`px-1.5 py-1 rounded text-[11px] font-medium border transition ${
                        activeConnector.lineType === lt.id
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {lt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-1 pt-1">
                  <span className="text-[10px] text-slate-400">Roundness:</span>
                  <div className="flex items-center gap-1">
                    {[0, 35, 65, 100].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() =>
                          updateActiveConnector(
                            {
                              roundness: val,
                              lineType:
                                activeConnector.lineType === 'straight' && val > 0
                                  ? 'curved'
                                  : activeConnector.lineType,
                            },
                            true
                          )
                        }
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          Math.abs(activeConnectorRoundness - val) <= 5
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {val}%
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

              <button
                type="button"
                onClick={() => {
                  const nextLabel = window.prompt(
                    'Connector Label:',
                    activeConnector.label || ''
                  );
                  if (nextLabel !== null) {
                    updateActiveConnector({ label: nextLabel }, true);
                  }
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Type className="w-3.5 h-3.5 text-indigo-500" /> Edit Label...
              </button>
              <button
                type="button"
                onClick={() => {
                  updateActiveConnector(
                    {
                      fromNodeId: activeConnector.toNodeId,
                      toNodeId: activeConnector.fromNodeId,
                      fromAnchor: activeConnector.toAnchor,
                      toAnchor: activeConnector.fromAnchor,
                    },
                    true
                  );
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-slate-500" /> Reverse Arrow Direction
              </button>
              <button
                type="button"
                onClick={() => {
                  updateActiveConnector({ bendX: 0, bendY: 0 }, true);
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" /> Reset Arrow Bend
              </button>
              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  deleteConnectorById(activeConnector.id);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-rose-50 text-rose-600 font-medium"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Connector
                </span>
                <kbd className="text-[10px] text-rose-400">Del</kbd>
              </button>
            </>
          )}

          {contextMenu.targetType === 'canvas' && (
            <>
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Canvas Menu
              </div>
              <button
                type="button"
                disabled={!hasClipboard}
                onClick={() => {
                  pasteFromClipboard({
                    x: contextMenu.worldX,
                    y: contextMenu.worldY,
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <ClipboardPaste className="w-3.5 h-3.5 text-indigo-500" /> Paste Here
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+V</kbd>
              </button>

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Add Shape Here
              </div>
              {(
                [
                  { type: 'rounded_rect', label: 'Rounded Box', icon: Square },
                  { type: 'circle', label: 'Circle', icon: Circle },
                  { type: 'diamond', label: 'Decision Diamond', icon: Diamond },
                  { type: 'sticky_note', label: 'Sticky Note', icon: StickyNote },
                  { type: 'text', label: 'Text Label', icon: Type },
                  { type: 'image', label: 'Image Card', icon: ImageIcon },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => {
                      addShape(item.type, {
                        x: contextMenu.worldX,
                        y: contextMenu.worldY,
                      });
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Icon className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{item.label}</span>
                  </button>
                );
              })}

              <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
              <button
                type="button"
                onClick={() => {
                  selectAllNodes();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="flex items-center gap-2">
                  <CheckSquare className="w-3.5 h-3.5 text-slate-500" /> Select All
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+A</kbd>
              </button>
              <button
                type="button"
                disabled={undoStack.length === 0}
                onClick={() => {
                  handleUndo();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Undo2 className="w-3.5 h-3.5 text-slate-500" /> Undo
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+Z</kbd>
              </button>
              <button
                type="button"
                disabled={redoStack.length === 0}
                onClick={() => {
                  handleRedo();
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
              >
                <span className="flex items-center gap-2">
                  <Redo2 className="w-3.5 h-3.5 text-slate-500" /> Redo
                </span>
                <kbd className="text-[10px] text-slate-400">Ctrl+Y</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  updateCanvas(activeCanvas.id, {
                    viewport: { x: 40, y: 40, zoom: 1 },
                  });
                  setContextMenu(null);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Maximize2 className="w-3.5 h-3.5 text-slate-500" /> Reset View (100%)
              </button>
            </>
          )}
        </div>
      )}

      {/* Move Canvas to another Project / Folder Modal */}
      {showMoveModal && activeCanvas && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 border border-slate-200 dark:border-slate-800 shadow-xl">
            <h3 className="font-semibold text-base mb-3">{t.project.moveItem}</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {state.projects
                .filter((p) => !p.isDeleted)
                .map((proj) => (
                  <div key={proj.id} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        moveItemToLocation('canvas', activeCanvas.id, proj.id, null);
                        setShowMoveModal(false);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium flex items-center justify-between"
                    >
                      <span>
                        {proj.icon} {proj.name} (Root)
                      </span>
                    </button>
                    {state.subfolders
                      .filter((sf) => !sf.isDeleted && sf.projectId === proj.id)
                      .map((sf) => (
                        <button
                          key={sf.id}
                          type="button"
                          onClick={() => {
                            moveItemToLocation('canvas', activeCanvas.id, proj.id, sf.id);
                            setShowMoveModal(false);
                          }}
                          className="w-full text-left pl-7 pr-3 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-xs text-slate-600 dark:text-slate-400"
                        >
                          ↳ {sf.icon} {sf.name}
                        </button>
                      ))}
                  </div>
                ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
