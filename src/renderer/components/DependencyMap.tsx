import { layoutDepGraph, NODE_H, NODE_W } from '@shared/domain/dep-graph';
import type { Task } from '@shared/types';

import { useStore } from '../app/store';
import { STATUS_COLORS } from '../styles/colors';

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** SVG rendering of the dependency layout (prototype _depGraph). */
export function DependencyMap({ tasks }: { tasks: readonly Task[] }): React.JSX.Element {
  const openTask = useStore((s) => s.openTask);
  const layout = layoutDepGraph(tasks);

  if (layout === null) {
    return (
      <div className="card-empty">
        No dependencies mapped yet. Open a task and add “Blocked by” links to build the chain.
      </div>
    );
  }

  return (
    <div className="scr dep-graph-scroll" data-testid="dependency-map">
      <svg width={Math.max(layout.width, 300)} height={Math.max(layout.height, 110)}>
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
          const midY = (e.y1 + e.y2) / 2;
          return (
            <path
              key={i}
              d={`M${String(e.x1)},${String(e.y1)} C${String(e.x1)},${String(midY)} ${String(e.x2)},${String(midY)} ${String(e.x2)},${String(e.y2 - 3)}`}
              stroke="#d6d6ce"
              strokeWidth={1.5}
              fill="none"
              markerEnd="url(#dep-arrow)"
            />
          );
        })}
        {layout.nodes.map(({ task, x, y }) => {
          const st = STATUS_COLORS[task.status];
          return (
            <g
              key={task.id}
              className="dep-node"
              onClick={() => {
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
  );
}
