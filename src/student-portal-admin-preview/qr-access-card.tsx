import { qrSvgV1 } from '../features/student-portal-admin/credentials/qr-artifacts-v1';
import type { PrintModeV1 } from '../features/student-portal-admin/credentials/qr-values-v1';
import crest from '../features/student-portal-admin/credentials/assets/school-crest.png';
import emblem from '../features/student-portal-admin/credentials/assets/school-emblem-outline.png';
import portrait from './assets/synthetic-student-portrait.png';

const emblemSize = 20;

function columnsForWidth(width: number, spacing: number, size: number) {
  return Math.floor((width - size) / (size + spacing)) + 1;
}

function sizeForRows(height: number, rows: number, spacing: number) {
  return Math.min(emblemSize, Math.floor((height - (rows - 1) * spacing) / rows));
}

type QrAccessCardProps = {
  name: string;
  classLabel: string;
  qr: string;
  symbolSpacing: number;
  symbolRows: number;
  mode?: PrintModeV1;
  instruction?: string;
};

export function QrAccessCard({
  name,
  classLabel,
  qr,
  symbolSpacing,
  symbolRows,
  mode = 'qr-name-class',
  instruction = '',
}: QrAccessCardProps) {
  const footerRows = Math.min(4, symbolRows - 1);
  const headerSize = sizeForRows(132, symbolRows, symbolSpacing);
  const footerSize = sizeForRows(84, footerRows, symbolSpacing);
  const headerColumns = columnsForWidth(856, symbolSpacing, headerSize);
  const footerColumns = columnsForWidth(856, symbolSpacing, footerSize);
  const headerEmblems = Array.from({ length: headerColumns * symbolRows }, (_, index) => index);
  const footerEmblems = Array.from({ length: footerColumns * footerRows }, (_, index) => index);
  const nameSize = name.length > 42 ? 'xlong' : name.length > 25 ? 'long' : 'regular';
  const qrImage = `data:image/svg+xml,${encodeURIComponent(qrSvgV1(qr))}`;

  return (
    <article className="qr-card qr-card--proposal">
      <div className="qr-card__brand">
        <div
          className="qr-card__pattern qr-card__brand-pattern"
          aria-hidden="true"
          style={{
            gap: symbolSpacing,
            gridTemplateColumns: `repeat(${headerColumns}, ${headerSize}px)`,
            gridTemplateRows: `repeat(${symbolRows}, ${headerSize}px)`,
          }}
        >
          {headerEmblems.map((index) => (
            <img key={index} src={emblem} alt="" />
          ))}
        </div>
        <span className="qr-card__crest">
          <img src={crest} alt="Brasão da Escola Municipal Professora Iêda Alves de Oliveira" />
        </span>
        <div className="qr-card__brand-copy">
          <span>ESCOLA MUNICIPAL</span>
          <strong>PROFª IÊDA ALVES DE OLIVEIRA</strong>
        </div>
        <div className="qr-card__access-copy">
          <span>Portal do Aluno</span>
          <strong>Cartão de acesso</strong>
        </div>
      </div>
      <div className="qr-card__content">
        <div className="qr-card__photo">
          <img src={portrait} alt="Retrato fictício do aluno" />
        </div>
        <div className={`qr-card__identity qr-card__identity--${nameSize}`}>
          {mode !== 'qr-only' && <h2>{name}</h2>}
          {mode === 'qr-name-class' && (
            <p>
              <strong>{classLabel}</strong>
            </p>
          )}
          {instruction.trim() && <p className="qr-card__instruction">{instruction.trim()}</p>}
        </div>
        <div className="qr-card__qr-frame">
          <img src={qrImage} alt="QR de demonstração" />
        </div>
      </div>
      <div className="qr-card__footer">
        <div
          className="qr-card__pattern qr-card__footer-pattern"
          aria-hidden="true"
          style={{
            gap: symbolSpacing,
            gridTemplateColumns: `repeat(${footerColumns}, ${footerSize}px)`,
            gridTemplateRows: `repeat(${footerRows}, ${footerSize}px)`,
          }}
        >
          {footerEmblems.map((index) => (
            <img key={index} src={emblem} alt="" />
          ))}
        </div>
      </div>
    </article>
  );
}
