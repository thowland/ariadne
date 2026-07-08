import type { ProjectCategory } from '@shared/types';

import { CATEGORY_COLORS } from '../styles/colors';

export function Dot({ color, size = 8 }: { color: string; size?: number }): React.JSX.Element {
  return <span className="dot" style={{ width: size, height: size, background: color }} />;
}

export function Pill({ text, c, bg }: { text: string; c: string; bg: string }): React.JSX.Element {
  return (
    <span className="pill" style={{ color: c, background: bg }}>
      {text}
    </span>
  );
}

export function CategoryPill({ category }: { category: ProjectCategory }): React.JSX.Element {
  const pal = CATEGORY_COLORS[category];
  return <Pill text={category === 'work' ? 'Work' : 'Home'} c={pal.c} bg={pal.bg} />;
}

export function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}): React.JSX.Element {
  const testId = `stat-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <div className="stat-card" data-testid={testId}>
      <div className="stat-value" style={color !== undefined ? { color } : undefined}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}): React.JSX.Element {
  return (
    <div className="seg" role="tablist">
      {options.map(([key, label]) => (
        <button
          key={key}
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'active' : ''}
          onClick={() => {
            onChange(key);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Card({
  children,
  title,
  count,
  headRight,
  className,
}: {
  children: React.ReactNode;
  title?: string;
  count?: number;
  headRight?: React.ReactNode;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={`card ${className ?? ''}`}>
      {title !== undefined && (
        <div className="card-head">
          <span className="card-title">{title}</span>
          {count !== undefined && <span className="card-count">{count}</span>}
          <div className="spacer" />
          {headRight}
        </div>
      )}
      {children}
    </div>
  );
}
