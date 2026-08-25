import type { CSSProperties, ReactNode } from 'react';

const starsA = [
  [7, 13, 2.2, 0.8],
  [18, 32, 1.4, 0.45],
  [29, 8, 1.8, 0.62],
  [39, 44, 2.6, 0.72],
  [54, 18, 1.3, 0.5],
  [63, 37, 2, 0.74],
  [76, 11, 1.5, 0.55],
  [88, 29, 2.4, 0.78],
  [96, 48, 1.2, 0.4],
  [14, 67, 2.4, 0.7],
  [34, 78, 1.4, 0.46],
  [51, 60, 1.9, 0.64],
  [69, 74, 2.7, 0.72],
  [83, 61, 1.4, 0.48],
  [93, 84, 2.1, 0.68],
] as const;

const starsB = [
  [3, 49, 1.1, 0.34],
  [12, 87, 1.8, 0.54],
  [24, 56, 1.2, 0.4],
  [31, 92, 2.1, 0.62],
  [45, 28, 1.1, 0.36],
  [58, 88, 1.7, 0.52],
  [66, 6, 1, 0.3],
  [72, 52, 1.9, 0.58],
  [81, 91, 1.2, 0.38],
  [91, 9, 1.6, 0.5],
  [98, 69, 1.1, 0.34],
] as const;

function StarLayer({
  stars,
  className,
}: {
  stars: readonly (readonly [number, number, number, number])[];
  className: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {stars.map(([x, y, radius, opacity], index) => (
        <circle key={`${x}-${y}-${index}`} cx={x} cy={y} r={radius / 4} opacity={opacity} />
      ))}
    </svg>
  );
}

export function AmbientConstellation({
  className = '',
  intensity = 'strong',
  parallax = false,
}: {
  className?: string;
  intensity?: 'soft' | 'strong';
  parallax?: boolean;
}) {
  return (
    <div
      className={`ambient-constellation ambient-constellation--${intensity} ${parallax ? 'ambient-constellation--parallax' : ''} ${className}`}
      aria-hidden="true"
    >
      <span className="ambient-constellation__glow ambient-constellation__glow--primary" />
      <span className="ambient-constellation__glow ambient-constellation__glow--secondary" />
      <StarLayer stars={starsA} className="ambient-constellation__stars ambient-constellation__stars--a" />
      <StarLayer stars={starsB} className="ambient-constellation__stars ambient-constellation__stars--b" />
      <span className="ambient-constellation__orbit ambient-constellation__orbit--a" />
      <span className="ambient-constellation__orbit ambient-constellation__orbit--b" />
    </div>
  );
}

export function LivingSurface({
  children,
  className = '',
  parallax = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  parallax?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={`living-surface ${className}`} style={style}>
      <AmbientConstellation intensity="strong" parallax={parallax} />
      <div className="living-surface__content">{children}</div>
    </div>
  );
}
