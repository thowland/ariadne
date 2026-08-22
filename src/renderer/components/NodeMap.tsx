import type { MapPositions, NodeMapLayout, PositionedNode } from '@shared/domain/node-map';
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
 * pointercancel — is the part that would rot if a second map copied it.
 */

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
  /** Hand-placed node positions; anything absent uses the computed layout. */
  positions?: MapPositions;
  /** Committed on pointer-up, once per drag. Omit to make nodes static. */
  onMove?: (id: string, x: number, y: number) => void;
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
}

export function NodeMap<N extends PositionedNode>({
  compute,
  empty,
  positions = {},
  onMove,
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
  onMoveRef.current = onMove;
  onResizeRef.current = onResize;

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
      setDrag({ id: d.id, x: d.x, y: d.y });
    };
    const up = (): void => {
      const d = dragRef.current;
      dragRef.current = null;
      suppressClick.current = d?.moved === true;
      setDrag(null);
      if (d?.moved === true) onMoveRef.current?.(d.id, d.x, d.y);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [dragId]);

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
              <path d="M0,0 L9,4.5 L0,9 z" fill="#c8c8c0" />
            </marker>
          </defs>
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
              <path
                key={i}
                d={d}
                stroke="#d6d6ce"
                strokeWidth={1.5}
                fill="none"
                markerEnd={`url(#${arrowId})`}
              />
            );
          })}
          {layout.nodes.map((node) => {
            const draggable = onMove !== undefined;
            return (
              <g
                key={node.id}
                className={`node-map-node${draggable ? ' draggable' : ''}${
                  drag?.id === node.id ? ' dragging' : ''
                }`}
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
