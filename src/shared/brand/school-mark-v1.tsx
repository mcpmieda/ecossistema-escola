import type { CSSProperties } from 'react';
import './school-mark-v1.css';

/** The school's official name, used everywhere it is shown. */
export const SCHOOL_NAME_V1 = 'Escola Mun. Prof.ª Iêda Alves de Oliveira MCPM';

/** The school's crest, shared by the administrative apps and the Portal do Aluno. */
export const SCHOOL_LOGO_SRC_V1 = new URL('../../student-portal/assets/school-logo.webp', import.meta.url)
  .href;

/**
 * Decorative crest. `shine` passes a soft light across it from time to time; `pulse` is the
 * opening/loading beat. Both stop under prefers-reduced-motion. Callers name it for assistive
 * technology when it stands alone (it is aria-hidden here).
 */
export function SchoolMarkV1({
  size = 40,
  shine = true,
  pulse = false,
  className,
}: {
  size?: number;
  shine?: boolean;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={[
        'school-mark',
        shine ? 'school-mark--shine' : '',
        pulse ? 'school-mark--pulse' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--school-mark-size': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <img src={SCHOOL_LOGO_SRC_V1} alt="" draggable={false} />
    </span>
  );
}
