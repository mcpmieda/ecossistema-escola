import { cn } from '@/lib/utils';

type AmbientConstellationProps = {
  className?: string;
  intensity?: 'subtle' | 'medium' | 'strong';
  placement?: 'left' | 'right' | 'center';
};

type ParticlePoint = readonly [x: number, y: number, size: number, opacity: number];

function createLayer(seed: number, count: number): readonly ParticlePoint[] {
  let state = seed >>> 0;
  const next = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };

  return Array.from({ length: count }, (_, index) => {
    const x = 1 + next() * 98;
    const y = 1 + next() * 98;
    const sizeBand = index % 17 === 0 ? 0.95 + next() * 0.4 : 0.52 + next() * 0.62;
    const opacity = index % 13 === 0 ? 0.52 + next() * 0.26 : 0.12 + next() * 0.4;
    return [x, y, Math.min(sizeBand, 1.35), opacity] as const;
  });
}

const layerA = createLayer(0x18c4a7, 48);
const layerB = createLayer(0x6f2bd1, 48);

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
          key={`${x.toFixed(2)}-${y.toFixed(2)}-${index}`}
          className="ambient-constellation__particle"
          data-glint={index % 17 === 0 ? 'true' : undefined}
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
  placement = 'center',
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
