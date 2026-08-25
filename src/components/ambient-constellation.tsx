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
    const glint = index % 29 === 0;
    const size = glint ? 1.15 + next() * 0.3 : 0.46 + next() * 0.66;
    const opacity = glint ? 0.78 + next() * 0.18 : 0.22 + next() * 0.58;
    return [x, y, Math.min(size, 1.45), Math.min(opacity, 0.96)] as const;
  });
}

const layerA = createLayer(0x18c4a7, 96);
const layerB = createLayer(0x6f2bd1, 96);

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
          data-glint={index % 29 === 0 ? 'true' : undefined}
          style={{
            left: `${x}%`,
            top: `${y}%`,
            width: `${size}px`,
            height: `${size}px`,
            opacity,
            animationDelay: index % 29 === 0 ? `${-(index % 7) * 0.63}s` : undefined,
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
      <div className="ambient-constellation__glow ambient-constellation__glow--violet" />
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
