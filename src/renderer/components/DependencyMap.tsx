import { type DepPositions, layoutDepGraph, NODE_H, NODE_W } from '@shared/domain/dep-graph';
import { DEP_MAP_MAX_H, DEP_MAP_MIN_H, type Task } from '@shared/types';

import { useStore } from '../app/store';
import { STATUS_COLORS } from '../styles/colors';

import { NodeMap, truncate } from './NodeMap';

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
 * click that never travels far still opens the task. The dragging, resizing
 * and click handling all live in `NodeMap`, shared with the org map (D34) —
 * this component supplies the layout and what a box says.
 */
export function DependencyMap({
  tasks,
  positions = {},
  onMove,
  height,
  onResize,
}: DependencyMapProps): React.JSX.Element {
  const openTask = useStore((s) => s.openTask);

  return (
    <NodeMap
      compute={(live) => layoutDepGraph(tasks, live)}
      empty={
        <div className="card-empty">
          No dependencies mapped yet. Open a task and add “Blocked by” links to build the chain.
        </div>
      }
      positions={positions}
      onMove={onMove}
      height={height}
      onResize={onResize}
      minHeight={DEP_MAP_MIN_H}
      maxHeight={DEP_MAP_MAX_H}
      onOpen={openTask}
      arrowId="dep-arrow"
      testId="dependency-map"
      nodeTestIdPrefix="dep-node-"
      resizeLabel="Resize dependency map"
      renderNode={({ task, x, y }) => {
        const st = STATUS_COLORS[task.status];
        return (
          <>
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
          </>
        );
      }}
    />
  );
}
