import type {
  MapEdge,
  MapPositions,
  NodeMapLayout,
  PositionedNode,
  SnapGuide,
} from '@shared/domain/node-map';
import { nodeAt, SNAP_GRID, snapPosition } from '@shared/domain/node-map';
import { useEffect, useRef, useState } from 'react';

/**
 * The interactive shell shared by the box-and-line maps: drag a node to place
 * it by hand, drag the strip below to resize the canvas, click a node to open
 * what it stands for.
 *
 * Only the gestures and the chrome live here. What is laid out, and what a
 * box says, come from the caller: `compute` runs the caller's own pure layout
 * against the live positions (so edges rubber-band mid-drag) and `renderNode`
 * draws the box. Written this way because the pointer handling below —
 * drag slop, click suppression after a real drag, latest-callback refs,
 * pointercancel, snapping — is the part that would rot if a second map
 * copied it. A new map supplies a pure layout and a `renderNode`, nothing more.
 *
 * Snapping (`snapPosition`) is on by default: a dragged box locks to another
 * box's row or column within a few pixels and a guide shows the line, and
 * otherwise falls onto a coarse grid. Holding Alt/Option places it freely.
 */

/** The key that turns snapping off mid-drag, as the keyboard labels it. */
export const FREE_PLACE_KEY = /Mac/.test(navigator.userAgent) ? '⌥' : 'Alt';

/** Pointer travel (px) that turns a click on a node into a drag. */
const DRAG_SLOP = 4;

interface NodeDrag {
  id: string;
  /** Node origin and pointer origin at pointer-down. */
  nodeX: number;
  nodeY: number;
  clientX: number;
  clientY: number;
  /** Latest position, so pointercancel commits where the node actually is. */
  x: number;
  y: number;
  moved: boolean;
}

export interface NodeMapProps<N extends PositionedNode> {
  /** The caller's pure layout, run against positions including any live drag. */
  compute: (positions: MapPositions) => NodeMapLayout<N> | null;
  /** Shown when `compute` returns null. */
  empty: React.ReactNode;
  /** Box size, for hit-testing a drop onto another node. */
  nodeW: number;
  nodeH: number;
  /** Hand-placed node positions; anything absent uses the computed layout. */
  positions?: MapPositions;
  /** Committed on pointer-up, once per drag. Omit to make nodes static. */
  onMove?: (id: string, x: number, y: number) => void;
  /**
   * A node dropped on top of another (D37). When set, a drop that lands on a
   * box calls this *instead of* `onMove` — the position is the caller's to
   * decide, since it usually wants the node somewhere meaningful rather than
   * under the pointer.
   */
  onLink?: (draggedId: string, targetId: string) => void;
  /** Right-click on an edge; coordinates are viewport, for the menu. */
  onEdgeMenu?: (edge: MapEdge, x: number, y: number) => void;
  /** Canvas height in px; undefined fits the layout. */
  height?: number;
  /** Committed when the resize handle is released. Omit to hide the handle. */
  onResize?: (height: number) => void;
  /** Clamp for the resize handle, so each map can set its own bounds. */
  minHeight: number;
  maxHeight: number;
  /** A click that never became a drag. */
  onOpen: (id: string) => void;
  renderNode: (node: N) => React.ReactNode;
  /** Unique per map so two maps on one page cannot share an arrow marker. */
  arrowId: string;
  testId: string;
  nodeTestIdPrefix: string;
  resizeLabel: string;
  minWidth?: number;
  /** Snap drags to other boxes and the grid; Alt/Option still places freely. */
  snap?: boolean;
}

export function NodeMap<N extends PositionedNode>({
  compute,
  empty,
  nodeW,
  nodeH,
  positions = {},
  onMove,
  onLink,
  onEdgeMenu,
  height,
  onResize,
  minHeight,
  maxHeight,
  onOpen,
  renderNode,
  arrowId,
  testId,
  nodeTestIdPrefix,
  resizeLabel,
  minWidth = 300,
  snap = true,
}: NodeMapProps<N>): React.JSX.Element {
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resizeH, setResizeH] = useState<number | null>(null);
  const dragRef = useRef<NodeDrag | null>(null);
  const resizeRef = useRef<{ clientY: number; startH: number; height: number } | null>(null);
  // Set on pointer-up so the click that follows a real drag doesn't open it.
  const suppressClick = useRef(false);
  // Latest-callback refs: window listeners are bound once per gesture.
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  const onLinkRef = useRef(onLink);
  onMoveRef.current = onMove;
  onResizeRef.current = onResize;
  onLinkRef.current = onLink;
  /** Node the dragged box is currently hovering over, for the drop highlight. */
  const hoverRef = useRef<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  /** Latest layout, so the pointer handlers can hit-test without re-binding. */
  const layoutRef = useRef<NodeMapLayout<N> | null>(null);
  /** Alignment lines for the drag in progress; null when not snapping. */
  const [guides, setGuides] = useState<SnapGuide[] | null>(null);

  const clampHeight = (h: number): number =>
    Math.min(maxHeight, Math.max(minHeight, Math.round(h)));

  const dragId = drag?.id ?? null;
  useEffect(() => {
    if (dragId === null) return;
    const move = (e: PointerEvent): void => {
      const d = dragRef.current;
      if (d === null) return;
      const dx = e.clientX - d.clientX;
      const dy = e.clientY - d.clientY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < DRAG_SLOP) return;
      d.moved = true;
      d.x = Math.max(0, d.nodeX + dx);
      d.y = Math.max(0, d.nodeY + dy);
      if (snap && !e.altKey) {
        const others = (layoutRef.current?.nodes ?? []).filter((n) => n.id !== d.id);
        const snapped = snapPosition(d.x, d.y, others, nodeW, nodeH);
        d.x = snapped.x;
        d.y = snapped.y;
        setGuides(snapped.guides);
      } else {
        setGuides(null);
      }
      setDrag({ id: d.id, x: d.x, y: d.y });
      // Hit-test from the box's own centre, not the pointer: dropping is
      // about where the box ended up, and the pointer may have grabbed it
      // by a corner.
      const nodes = layoutRef.current?.nodes ?? [];
      const target =
        onLinkRef.current === undefined
          ? null
          : (nodeAt(nodes, d.x + nodeW / 2, d.y + nodeH / 2, nodeW, nodeH, d.id)?.id ?? null);
      if (target !== hoverRef.current) {
        hoverRef.current = target;
        setHover(target);
      }
    };
    const up = (): void => {
      const d = dragRef.current;
      const target = hoverRef.current;
      dragRef.current = null;
      hoverRef.current = null;
      suppressClick.current = d?.moved === true;
      setDrag(null);
      setHover(null);
      setGuides(null);
      if (d?.moved !== true) return;
      // A drop onto another box is a link, not a placement.
      if (target !== null && onLinkRef.current !== undefined) onLinkRef.current(d.id, target);
      else onMoveRef.current?.(d.id, d.x, d.y);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragId, nodeW, nodeH, snap]);

  const resizing = resizeH !== null;
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent): void => {
      const r = resizeRef.current;
      if (r === null) return;
      r.height = Math.min(
        maxHeight,
        Math.max(minHeight, Math.round(r.startH + (e.clientY - r.clientY))),
      );
      setResizeH(r.height);
    };
    const up = (): void => {
      const r = resizeRef.current;
      resizeRef.current = null;
      setResizeH(null);
      if (r !== null) onResizeRef.current?.(r.height);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [resizing, minHeight, maxHeight]);

  // The in-flight node rides on top of the saved positions so edges rubber-band.
  const live: MapPositions =
    drag === null ? positions : { ...positions, [drag.id]: { x: drag.x, y: drag.y } };
  const layout = compute(live);
  layoutRef.current = layout;

  if (layout === null) return <>{empty}</>;

  const shownH = resizeH ?? (height === undefined ? null : clampHeight(height));
  const svgH = Math.max(layout.height, 110, shownH ?? 0);

  return (
    <>
      <div
        className="scr node-map-scroll"
        data-testid={testId}
        style={shownH === null ? undefined : { height: shownH }}
      >
        <svg width={Math.max(layout.width, minWidth)} height={svgH}>
          <defs>
            <marker
              id={arrowId}
              markerWidth={9}
              markerHeight={9}
              refX={7}
              refY={4.5}
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L9,4.5 L0,9 z" fill="var(--map-arrow)" />
            </marker>
            <pattern
              id={`${arrowId}-grid`}
              width={SNAP_GRID}
              height={SNAP_GRID}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={0.75} cy={0.75} r={0.75} fill="var(--map-grid)" />
            </pattern>
          </defs>
          {/* The grid only shows while a snapping drag is under way — it
              explains where the box is going, and is clutter otherwise. */}
          {guides !== null && (
            <rect
              className="node-map-grid"
              data-testid={`${testId}-grid`}
              width="100%"
              height="100%"
              fill={`url(#${arrowId}-grid)`}
            />
          )}
          {layout.edges.map((e, i) => {
            // Stop 3px short of the box so the arrowhead sits on the border.
            const gap = 3;
            let d: string;
            if (e.axis === 'v') {
              const midY = (e.y1 + e.y2) / 2;
              const endY = e.y2 + (e.y2 > e.y1 ? -gap : gap);
              d = `M${String(e.x1)},${String(e.y1)} C${String(e.x1)},${String(midY)} ${String(e.x2)},${String(midY)} ${String(e.x2)},${String(endY)}`;
            } else {
              const midX = (e.x1 + e.x2) / 2;
              const endX = e.x2 + (e.x2 > e.x1 ? -gap : gap);
              d = `M${String(e.x1)},${String(e.y1)} C${String(midX)},${String(e.y1)} ${String(midX)},${String(e.y2)} ${String(endX)},${String(e.y2)}`;
            }
            return (
              <g key={i} className={onEdgeMenu === undefined ? undefined : 'node-map-edge'}>
                <path
                  d={d}
                  stroke="var(--map-edge)"
                  strokeWidth={1.5}
                  fill="none"
                  markerEnd={`url(#${arrowId})`}
                />
                {onEdgeMenu !== undefined && (
                  // A 1.5px line is not a right-click target; this invisible
                  // one is, and carries the menu.
                  <path
                    d={d}
                    stroke="transparent"
                    strokeWidth={14}
                    fill="none"
                    className="node-map-edge-hit"
                    data-testid={`edge-${e.from}-${e.to}`}
                    onContextMenu={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      onEdgeMenu(e, ev.clientX, ev.clientY);
                    }}
                  />
                )}
              </g>
            );
          })}
          {guides?.map((g, i) => (
            <line
              key={`guide-${String(i)}`}
              className="node-map-guide"
              data-testid={`${testId}-guide-${g.axis}`}
              x1={g.axis === 'x' ? g.at : g.from}
              x2={g.axis === 'x' ? g.at : g.to}
              y1={g.axis === 'x' ? g.from : g.at}
              y2={g.axis === 'x' ? g.to : g.at}
            />
          ))}
          {layout.nodes.map((node) => {
            const draggable = onMove !== undefined;
            return (
              <g
                key={node.id}
                className={`node-map-node${draggable ? ' draggable' : ''}${
                  drag?.id === node.id ? ' dragging' : ''
                }${hover === node.id ? ' drop-target' : ''}`}
                onPointerDown={(e) => {
                  if (!draggable || e.button !== 0) return;
                  e.preventDefault();
                  dragRef.current = {
                    id: node.id,
                    nodeX: node.x,
                    nodeY: node.y,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    x: node.x,
                    y: node.y,
                    moved: false,
                  };
                  setDrag({ id: node.id, x: node.x, y: node.y });
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  onOpen(node.id);
                }}
                data-testid={`${nodeTestIdPrefix}${node.id}`}
              >
                {renderNode(node)}
              </g>
            );
          })}
        </svg>
      </div>
      {onResize !== undefined && (
        <div
          className="node-map-resize"
          data-testid={`${testId}-resize`}
          role="separator"
          aria-orientation="horizontal"
          aria-label={resizeLabel}
          tabIndex={0}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.preventDefault();
            const startH = clampHeight(height ?? svgH);
            resizeRef.current = { clientY: e.clientY, startH, height: startH };
            setResizeH(startH);
          }}
          onKeyDown={(e) => {
            const step = e.key === 'ArrowDown' ? 40 : e.key === 'ArrowUp' ? -40 : 0;
            if (step === 0) return;
            e.preventDefault();
            onResize(clampHeight((height ?? svgH) + step));
          }}
        >
          <span className="node-map-grip" />
        </div>
      )}
    </>
  );
}

/** Trims a label to fit a node box. */
export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
