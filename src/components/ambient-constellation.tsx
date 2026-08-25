import { cn } from '@/lib/utils';

type AmbientConstellationProps = {
  className?: string;
  intensity?: 'subtle' | 'medium' | 'strong';
  placement?: 'left' | 'right';
};

const layerA = [
  [7, 15, 1.4, 0.72],
  [16, 31, 1, 0.58],
  [23, 9, 1.8, 0.86],
  [31, 45, 1.2, 0.64],
  [39, 21, 1, 0.54],
  [48, 37, 1.6, 0.8],
  [58, 12, 1.1, 0.64],
  [66, 52, 1.7, 0.84],
  [73, 28, 1.2, 0.68],
  [84, 17, 1, 0.56],
  [91, 43, 1.6, 0.76],
  [12, 68, 1.5, 0.76],
  [28, 82, 1.1, 0.62],
  [45, 70, 1.8, 0.84],
  [62, 88, 1.2, 0.64],
  [79, 74, 1.5, 0.78],
  [94, 91, 1, 0.58],
] as const;

const layerB = [
  [4, 48, 0.9, 0.48],
  [14, 8, 1.1, 0.56],
  [21, 59, 0.8, 0.44],
  [34, 17, 1.2, 0.6],
  [43, 51, 0.9, 0.48],
  [52, 6, 1.1, 0.56],
  [61, 36, 0.8, 0.42],
  [71, 11, 1.3, 0.62],
  [82, 47, 0.9, 0.5],
  [96, 24, 1.1, 0.58],
  [8, 86, 1.2, 0.6],
  [19, 73, 0.8, 0.44],
  [37, 94, 1.1, 0.56],
  [54, 78, 0.9, 0.48],
  [69, 66, 1.2, 0.6],
  [87, 83, 0.8, 0.44],
] as const;

function ParticleLayer({
  points,
  className,
}: {
  points: readonly (readonly [number, number, number, number])[];
  className: string;
}) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none">
      {points.map(([cx, cy, radius, opacity], index) => (
        <circle
          key={`${cx}-${cy}-${index}`}
          cx={cx}
          cy={cy}
          r={radius}
          fill="currentColor"
          opacity={opacity}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  );
}

export function AmbientConstellation({
  className,
  intensity = 'strong',
  placement = 'left',
}: AmbientConstellationProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('ambient-constellation', className)}
      data-intensity={intensity}
      data-placement={placement}
    >
      <div className="ambient-constellation__glow" />
      <ParticleLayer
        points={layerA}
        className="ambient-constellation__layer ambient-constellation__layer--a"
      />
      <ParticleLayer
        points={layerB}
        className="ambient-constellation__layer ambient-constellation__layer--b"
      />
    </div>
  );
}
