import { contactColor, contactInitials, contactName } from '@shared/domain/contacts';
import type { MapPositions } from '@shared/domain/node-map';
import { layoutOrgChart, ORG_NODE_H, ORG_NODE_W } from '@shared/domain/org-chart';
import type { OrgRelation } from '@shared/domain/org-chart';
import type { Contact, Workspace } from '@shared/types';
import { ORG_MAP_MAX_H, ORG_MAP_MIN_H, PROJECT_PALETTE } from '@shared/types';

import { useStore } from '../app/store';

import { NodeMap, truncate } from './NodeMap';

/** How each row is labelled and tinted, so the three levels read at a glance. */
const RELATION: Record<OrgRelation, { label: string; stroke: string; text: string }> = {
  manager: { label: 'MANAGER', stroke: 'var(--map-arrow)', text: 'var(--muted)' },
  self: { label: 'THIS CONTACT', stroke: 'var(--accent)', text: 'var(--accent)' },
  report: { label: 'REPORTS TO THEM', stroke: 'var(--map-arrow)', text: 'var(--muted)' },
};

export interface OrgMapProps {
  workspace: Workspace;
  contact: Contact;
  /** Hand-placed node positions; anything absent uses the computed row. */
  positions?: MapPositions;
  onMove?: (contactId: string, x: number, y: number) => void;
  height?: number;
  onResize?: (height: number) => void;
}

/**
 * One person's place in the organization (D34): their manager above, their
 * direct reports below, and nothing further out. Same gestures as the
 * dependency map — drag a box to place it, drag the strip to resize, click a
 * box to open that person — because it is the same `NodeMap` underneath.
 */
export function OrgMap({
  workspace,
  contact,
  positions = {},
  onMove,
  height,
  onResize,
}: OrgMapProps): React.JSX.Element {
  const openContact = useStore((s) => s.openContact);

  return (
    <NodeMap
      compute={(live) => layoutOrgChart(workspace, contact, live)}
      empty={
        <div className="card-empty">
          No reporting line yet. Set a manager, or make this person somebody else’s manager, and the
          map appears.
        </div>
      }
      nodeW={ORG_NODE_W}
      nodeH={ORG_NODE_H}
      positions={positions}
      onMove={onMove}
      height={height}
      onResize={onResize}
      minHeight={ORG_MAP_MIN_H}
      maxHeight={ORG_MAP_MAX_H}
      // Clicking the person the map is about would be a no-op; the store
      // ignores a navigation to the page you are on, so this stays simple.
      onOpen={openContact}
      arrowId="org-arrow"
      testId="org-map"
      nodeTestIdPrefix="org-node-"
      resizeLabel="Resize organization map"
      minWidth={260}
      renderNode={({ contact: c, relation, x, y }) => {
        const style = RELATION[relation];
        const self = relation === 'self';
        return (
          <>
            <rect
              x={x}
              y={y}
              width={ORG_NODE_W}
              height={ORG_NODE_H}
              rx={9}
              fill="var(--map-node-fill)"
              stroke={style.stroke}
              strokeWidth={self ? 2 : 1.5}
            />
            {/* The avatar is the same colour it is everywhere else, so a face
                found on the map is recognisable in the list. */}
            <circle cx={x + 21} cy={y + 30} r={11} fill={contactColor(c, PROJECT_PALETTE)} />
            <text
              x={x + 21}
              y={y + 34}
              fontSize={9.5}
              fontWeight={700}
              fill="var(--map-node-fill)"
              textAnchor="middle"
            >
              {contactInitials(c)}
            </text>
            <text x={x + 40} y={y + 20} fontSize={8.5} fontWeight={700} fill={style.text}>
              {style.label}
            </text>
            <text x={x + 40} y={y + 34} fontSize={12} fontWeight={600} fill="var(--text)">
              {truncate(contactName(c), 18)}
            </text>
            <text x={x + 40} y={y + 48} fontSize={10.5} fill="var(--muted)">
              {truncate([c.role, c.department].filter((v) => v.trim() !== '').join(' · '), 22)}
            </text>
          </>
        );
      }}
    />
  );
}
