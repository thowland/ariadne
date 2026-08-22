import { type DepPositions, layoutDepGraph, NODE_H, NODE_W } from '@shared/domain/dep-graph';
import { DEP_MAP_MAX_H, DEP_MAP_MIN_H, type Task } from '@shared/types';

import { useStore } from '../app/store';
import { STATUS_COLORS } from '../styles/colors';

import { NodeMap, truncate } from './NodeMap';

export interface DependencyMapProps {
  tasks: readonly Task[];
  /** Dropping one box on another links them (D37); omit to disable. */
  onLink?: (draggedId: string, targetId: string) => void;
  /** Right-click on a line, to offer removing that dependency. */
  onUnlink?: (taskId: string, dependsOnId: string) => void;
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
 *
 * Dropping one box onto another declares a dependency (D37), and right-
 * clicking a line offers to remove one. Both are accelerators: the task
 * editor's "Blocked by" checkboxes do the same two edits the long way.
 */
export function DependencyMap({
  tasks,
  positions = {},
  onMove,
  onLink,
  onUnlink,
  height,
  onResize,
}: DependencyMapProps): React.JSX.Element {
  const { openTask, openContextMenu } = useStore();
  // Explicit rather than `||`: an empty title must fall back too, which is
  // exactly what `??` would not do.
  const titleOf = (id: string): string => {
    const found = tasks.find((t) => t.id === id)?.title.trim();
    return found === undefined || found === '' ? 'Untitled task' : found;
  };

  return (
    <NodeMap
      compute={(live) => layoutDepGraph(tasks, live)}
      empty={
        <div className="card-empty">
          No dependencies mapped yet. Open a task and add “Blocked by” links to build the chain.
        </div>
      }
      nodeW={NODE_W}
      nodeH={NODE_H}
      positions={positions}
      onMove={onMove}
      onLink={onLink}
      onEdgeMenu={
        onUnlink === undefined
          ? undefined
          : (edge, x, y) => {
              openContextMenu({
                x,
                y,
                label: `${titleOf(edge.from)} → ${titleOf(edge.to)}`,
                items: [
                  {
                    label: 'Open the blocked task…',
                    onSelect: () => {
                      openTask(edge.to);
                    },
                  },
                  {
                    // Unticking the same box in the task editor is the
                    // ordinary route (D21); this is the accelerator.
                    label: 'Remove this dependency',
                    danger: true,
                    separatorBefore: true,
                    onSelect: () => {
                      onUnlink(edge.to, edge.from);
                    },
                  },
                ],
              });
            }
      }
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
              fill="var(--map-node-fill)"
              stroke={st.dot}
              strokeWidth={1.5}
            />
            <circle cx={x + 13} cy={y + 17} r={4} fill={st.dot} />
            <text x={x + 23} y={y + 21} fontSize={10.5} fontWeight={700} fill={st.c}>
              {task.status}
            </text>
            <text x={x + 12} y={y + 40} fontSize={12} fontWeight={600} fill="var(--text)">
              {truncate(task.title || 'Untitled', 22)}
            </text>
          </>
        );
      }}
    />
  );
}
