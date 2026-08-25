import { cn } from '@/lib/utils';
import './ambient-constellation.css';

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
    const x = 0.5 + next() * 99;
    const y = 0.5 + next() * 99;
    const glint = index % 31 === 0;
    const size = glint ? 1.1 + next() * 0.25 : 0.5 + next() * 0.62;
    const opacity = glint ? 0.72 + next() * 0.16 : 0.28 + next() * 0.48;
    return [x, y, Math.min(size, 1.35), Math.min(opacity, 0.9)] as const;
  });
}

const layerA = createLayer(0x18c4a7, 64);
const layerB = createLayer(0x6f2bd1, 64);

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
          data-glint={index % 31 === 0 ? 'true' : undefined}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            opacity,
            animationDelay: index % 31 === 0 ? `${-(index % 5) * 1.1}s` : undefined,
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
      <div className="ambient-constellation__wash" />
      <div className="ambient-constellation__glow ambient-constellation__glow--cyan" />
      <div className="ambient-constellation__glow ambient-constellation__glow--blue" />
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
