import { type DepPositions, layoutDepGraph, NODE_H, NODE_W } from '@shared/domain/dep-graph';
import { DEP_MAP_MAX_H, DEP_MAP_MIN_H, type Task } from '@shared/types';
import { useEffect, useRef, useState } from 'react';

import { useStore } from '../app/store';
import { STATUS_COLORS } from '../styles/colors';

/** Pointer travel (px) that turns a click on a node into a drag. */
const DRAG_SLOP = 4;

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function clampHeight(h: number): number {
  return Math.min(DEP_MAP_MAX_H, Math.max(DEP_MAP_MIN_H, Math.round(h)));
}

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

export interface DependencyMapProps {
  tasks: readonly Task[];
  /** Hand-placed node positions; anything absent uses the computed layout. */
  positions?: DepPositions;
  /** Committed on pointer-up, once per drag. */
  onMove?: (taskId: string, x: number, y: number) => void;
  /** Canvas height in px; undefined fits the layout. */
  height?: number;
  /** Committed when the resize handle is released. Omit to hide the handle. */
  onResize?: (height: number) => void;
}

/**
 * SVG rendering of the dependency layout (prototype _depGraph). Nodes drag to
 * hand-placed positions (D20) and the edges re-anchor live as they move; a
 * click that never travels past DRAG_SLOP still opens the task.
 */
export function DependencyMap({
  tasks,
  positions = {},
  onMove,
  height,
  onResize,
}: DependencyMapProps): React.JSX.Element {
  const openTask = useStore((s) => s.openTask);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [resizeH, setResizeH] = useState<number | null>(null);
  const dragRef = useRef<NodeDrag | null>(null);
  const resizeRef = useRef<{ clientY: number; startH: number; height: number } | null>(null);
  // Set on pointer-up so the click that follows a real drag doesn't open the task.
  const suppressClick = useRef(false);
  // Latest-callback refs: window listeners are bound once per gesture.
  const onMoveRef = useRef(onMove);
  const onResizeRef = useRef(onResize);
  onMoveRef.current = onMove;
  onResizeRef.current = onResize;

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
      r.height = clampHeight(r.startH + (e.clientY - r.clientY));
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
  }, [resizing]);

  // The in-flight node rides on top of the saved positions so edges rubber-band.
  const live: DepPositions =
    drag === null ? positions : { ...positions, [drag.id]: { x: drag.x, y: drag.y } };
  const layout = layoutDepGraph(tasks, live);

  if (layout === null) {
    return (
      <div className="card-empty">
        No dependencies mapped yet. Open a task and add “Blocked by” links to build the chain.
      </div>
    );
  }

  const shownH = resizeH ?? (height === undefined ? null : clampHeight(height));
  const svgH = Math.max(layout.height, 110, shownH ?? 0);

  return (
    <>
      <div
        className="scr dep-graph-scroll"
        data-testid="dependency-map"
        style={shownH === null ? undefined : { height: shownH }}
      >
        <svg width={Math.max(layout.width, 300)} height={svgH}>
          <defs>
            <marker
              id="dep-arrow"
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
                markerEnd="url(#dep-arrow)"
              />
            );
          })}
          {layout.nodes.map(({ task, x, y }) => {
            const st = STATUS_COLORS[task.status];
            const draggable = onMove !== undefined;
            return (
              <g
                key={task.id}
                className={`dep-node${draggable ? ' draggable' : ''}${drag?.id === task.id ? ' dragging' : ''}`}
                onPointerDown={(e) => {
                  if (!draggable || e.button !== 0) return;
                  e.preventDefault();
                  dragRef.current = {
                    id: task.id,
                    nodeX: x,
                    nodeY: y,
                    clientX: e.clientX,
                    clientY: e.clientY,
                    x,
                    y,
                    moved: false,
                  };
                  setDrag({ id: task.id, x, y });
                }}
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false;
                    return;
                  }
                  openTask(task.id);
                }}
                data-testid={`dep-node-${task.id}`}
              >
                <rect
                  x={x}
                  y={y}
                  width={NODE_W}
                  height={NODE_H}
                  rx={9}
                  fill="#fff"
                  stroke={st.dot}
                  strokeWidth={1.5}
                />
                <circle cx={x + 13} cy={y + 17} r={4} fill={st.dot} />
                <text x={x + 23} y={y + 21} fontSize={10.5} fontWeight={700} fill={st.c}>
                  {task.status}
                </text>
                <text x={x + 12} y={y + 40} fontSize={12} fontWeight={600} fill="#1b1b18">
                  {truncate(task.title || 'Untitled', 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {onResize !== undefined && (
        <div
          className="dep-resize"
          data-testid="dep-map-resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize dependency map"
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
          <span className="dep-resize-grip" />
        </div>
      )}
    </>
  );
}
