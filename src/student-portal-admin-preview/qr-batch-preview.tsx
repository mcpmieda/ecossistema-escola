import { useEffect, useMemo, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  qrSvgV1,
  renderQrPdfV1,
} from '../features/student-portal-admin/credentials/qr-artifacts-v1';
import {
  PRINT_MODES_V1,
  type PrintCardV1,
  type PrintModeV1,
} from '../features/student-portal-admin/credentials/qr-values-v1';
import './qr-batch-preview.css';

const students = Array.from(
  { length: 12 },
  (_, index) => `Aluno Exemplo ${String(index + 1).padStart(2, '0')}`,
);
type Selection = 'class' | 'selected';

function sampleCards(selection: Selection, mode: PrintModeV1): PrintCardV1[] {
  const count = selection === 'class' ? students.length : 3;
  return students.slice(0, count).map((name, index) => {
    const card = {
      accountId: `75600000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      qr: `https://aluno.escolaieda.com/access#v1.${String(index + 1).padStart(43, 'a')}.1.${'b'.repeat(43)}`,
    };
    if (mode === 'qr-only') return { ...card, mode };
    if (mode === 'qr-name') return { ...card, mode, name };
    return { ...card, mode, name, classLabel: '7º ANO A' };
  });
}

function QrBatchPreview() {
  const [selection, setSelection] = useState<Selection>('class');
  const [mode, setMode] = useState<PrintModeV1>('qr-name-class');
  const [withInstruction, setWithInstruction] = useState(false);
  const [instruction, setInstruction] = useState('Acesse o Portal do Aluno com este cartão.');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const cards = useMemo(() => sampleCards(selection, mode), [selection, mode]);
  const rows = Array.from({ length: Math.ceil(cards.length / 3) }, (_, index) =>
    cards.slice(index * 3, index * 3 + 3),
  );

  useEffect(() => {
    const controller = new AbortController();
    let url: string | undefined;
    setPdfUrl(null);
    setError(false);
    void renderQrPdfV1(cards, controller.signal, undefined, withInstruction ? instruction : '')
      .then((artifact) => {
        if (controller.signal.aborted) return;
        url = URL.createObjectURL(artifact.blob);
        setPdfUrl(url);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
  }, [cards, withInstruction, instruction]);

  return (
    <main className="qr-batch-preview">
      <header className="qr-batch-preview__header">
        <div>
          <p className="qr-batch-preview__eyebrow">Preview local · dados sintéticos</p>
          <h1>Cartões QR em lote</h1>
          <p>Layout atual do PDF para turma inteira ou alunos selecionados.</p>
        </div>
        {pdfUrl && (
          <a href={pdfUrl} download="cartoes-qr-lote-preview.pdf">
            Baixar PDF atual
          </a>
        )}
      </header>
      <section className="qr-batch-preview__controls" aria-label="Opções do lote">
        <fieldset>
          <legend>Impressão</legend>
          <label>
            <input
              type="radio"
              name="selection"
              checked={selection === 'class'}
              onChange={() => setSelection('class')}
            />
            Turma inteira · {students.length} cartões
          </label>
          <label>
            <input
              type="radio"
              name="selection"
              checked={selection === 'selected'}
              onChange={() => setSelection('selected')}
            />
            Selecionados · 3 cartões
          </label>
        </fieldset>
        <fieldset>
          <legend>Conteúdo</legend>
          {(Object.entries(PRINT_MODES_V1) as [PrintModeV1, string][]).map(([value, label]) => (
            <label key={value}>
              <input
                type="radio"
                name="mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <div className="qr-batch-preview__instruction">
          <label>
            <input
              type="checkbox"
              checked={withInstruction}
              onChange={(event) => setWithInstruction(event.target.checked)}
            />
            Adicionar instrução ao cartão
          </label>
          {withInstruction && (
            <input
              aria-label="Instrução abaixo do QR"
              value={instruction}
              maxLength={240}
              onChange={(event) => setInstruction(event.target.value)}
            />
          )}
        </div>
      </section>
      <section className="qr-batch-preview__paper" aria-label="Prévia do PDF em lote">
        <div
          className={`qr-batch-preview__sheet qr-batch-preview__sheet--${mode}${withInstruction ? ' qr-batch-preview__sheet--instruction' : ''}`}
        >
          {rows.map((row, rowIndex) => (
            <div className="qr-batch-preview__row" key={rowIndex}>
              {row.map((card) => (
                <article className="qr-batch-preview__card" key={card.accountId}>
                  <img
                    src={`data:image/svg+xml,${encodeURIComponent(qrSvgV1(card.qr))}`}
                    alt="QR sintético"
                  />
                  {card.mode !== 'qr-only' && <p className="qr-batch-preview__name">{card.name}</p>}
                  {card.mode === 'qr-name-class' && (
                    <p className="qr-batch-preview__class">{card.classLabel}</p>
                  )}
                  {withInstruction && instruction.trim() && (
                    <p className="qr-batch-preview__card-instruction">{instruction.trim()}</p>
                  )}
                </article>
              ))}
            </div>
          ))}
        </div>
      </section>
      {error ? (
        <p role="alert">Não foi possível gerar o PDF para download.</p>
      ) : (
        !pdfUrl && <p role="status">Gerando PDF para download…</p>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Preview root missing');
const app = (import.meta.hot?.data.root as Root | undefined) ?? createRoot(root);
if (import.meta.hot) import.meta.hot.data.root = app;
app.render(<QrBatchPreview />);
