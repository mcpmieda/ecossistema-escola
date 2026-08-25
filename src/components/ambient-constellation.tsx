import { cn } from '@/lib/utils';

type AmbientConstellationProps = {
  className?: string;
  intensity?: 'subtle' | 'medium' | 'strong';
  placement?: 'left' | 'right';
};

type ParticlePoint = readonly [x: number, y: number, size: number, opacity: number];

const layerA: readonly ParticlePoint[] = [
  [3, 12, 0.7, 0.18],
  [7, 34, 1, 0.42],
  [11, 72, 0.6, 0.24],
  [15, 18, 0.8, 0.32],
  [18, 52, 1.2, 0.6],
  [22, 88, 0.7, 0.2],
  [26, 7, 0.6, 0.22],
  [29, 39, 0.9, 0.46],
  [32, 67, 0.7, 0.28],
  [36, 23, 1.3, 0.68],
  [39, 81, 0.6, 0.2],
  [43, 49, 0.8, 0.36],
  [46, 14, 0.7, 0.26],
  [49, 93, 1, 0.48],
  [53, 31, 0.6, 0.2],
  [56, 62, 1.1, 0.56],
  [60, 8, 0.8, 0.3],
  [63, 76, 0.7, 0.24],
  [67, 45, 0.9, 0.42],
  [70, 19, 0.6, 0.2],
  [73, 90, 1.2, 0.62],
  [77, 58, 0.7, 0.24],
  [81, 27, 0.8, 0.34],
  [84, 71, 0.6, 0.18],
  [88, 11, 1, 0.5],
  [91, 51, 0.7, 0.24],
  [94, 84, 0.9, 0.4],
  [97, 36, 0.6, 0.2],
] as const;

const layerB: readonly ParticlePoint[] = [
  [2, 48, 0.6, 0.2],
  [6, 83, 0.9, 0.38],
  [10, 25, 0.7, 0.24],
  [14, 61, 0.6, 0.18],
  [17, 5, 1.1, 0.52],
  [21, 43, 0.7, 0.26],
  [24, 78, 0.8, 0.32],
  [28, 16, 0.6, 0.2],
  [31, 55, 1, 0.46],
  [35, 91, 0.7, 0.22],
  [38, 30, 0.6, 0.18],
  [42, 69, 0.9, 0.4],
  [45, 10, 0.7, 0.24],
  [48, 46, 0.6, 0.2],
  [51, 85, 1.2, 0.58],
  [55, 22, 0.7, 0.24],
  [58, 57, 0.8, 0.34],
  [62, 96, 0.6, 0.18],
  [65, 36, 1, 0.48],
  [69, 73, 0.7, 0.22],
  [72, 13, 0.6, 0.2],
  [76, 49, 0.9, 0.4],
  [79, 88, 0.7, 0.24],
  [83, 32, 0.6, 0.18],
  [86, 64, 1.1, 0.54],
  [90, 20, 0.7, 0.24],
  [93, 75, 0.8, 0.32],
  [98, 54, 0.6, 0.18],
] as const;

function ParticleLayer({
  points,
  className,
}: {
  points: readonly ParticlePoint[];
  className: string;
}) {
  return (
    <div className={className}>
      {points.map(([x, y, size, opacity], index) => (
        <span
          key={`${x}-${y}-${index}`}
          className="ambient-constellation__particle"
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            opacity,
          }}
        />
      ))}
    </div>
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
