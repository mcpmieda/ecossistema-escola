import { useRef } from 'react';
import { Alert, Button, ProgressBar, Surface } from '@heroui/react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { abbreviateSha256 } from './file-manifest';
import { MAX_NOTES_IMPORT_FILES } from './import-batch';
import {
  useImportBatch,
  type ImportFlowProgressV6,
  type ImportPersistenceStateV6,
} from './use-import-batch';
import { WorkbookInspector } from './workbook-inspector';

function FileHash({ sha256 }: { sha256: string }) {
  return (
    <details className="mt-2 text-xs text-muted">
      <summary className="cursor-pointer">
        SHA-256 <code>{abbreviateSha256(sha256)}</code>
      </summary>
      <code className="mt-2 block break-all">{sha256}</code>
    </details>
  );
}

const PROGRESS_STAGE = {
  preparing: ['Preparando e calculando SHA-256', 10],
  recognizing: ['Reconhecendo estrutura', 20],
  roster: ['Organizando alunos', 35],
  grades: ['Processando notas', 65],
  recovery: ['Processando recuperação', 75],
  compacting: ['Preparando dados', 85],
  saving: ['Salvando no Banco', 95],
  completed: ['Concluído', 100],
} as const;

function progressValue(progress: ImportFlowProgressV6): number {
  const [, base] = PROGRESS_STAGE[progress.stage];
  if (progress.stage === 'completed') return 100;
  const fraction = progress.total > 0 ? Math.min(1, progress.current / progress.total) : 0;
  const next =
    progress.stage === 'preparing'
      ? 20
      : progress.stage === 'recognizing'
        ? 35
        : progress.stage === 'roster'
          ? 65
          : progress.stage === 'grades'
            ? 75
            : progress.stage === 'recovery'
              ? 85
              : progress.stage === 'compacting'
                ? 95
                : 100;
  return Math.round(base + (next - base) * fraction);
}

function persistenceLabel(state: ImportPersistenceStateV6 | undefined): string {
  if (!state) return 'Aguardando';
  switch (state.state) {
    case 'recognized':
      return 'Reconhecido';
    case 'processing':
      return 'Processando localmente';
    case 'persisting':
      return 'Salvando';
    case 'failed':
      return `Indisponível: ${state.message}`;
    case 'completed': {
      const labels = {
        applied: 'Aplicado',
        'no-changes': 'Sem mudanças acadêmicas',
        'review-required': 'Revisão necessária',
        blocked: 'Bloqueado',
        conflict: 'Conflito',
        'invalid-request': 'Pedido inválido',
        'not-authorized': 'Não autorizado',
        unavailable: 'Indisponível',
      } as const;
      return labels[state.response.state];
    }
  }
}

function PersistenceResult({ state }: { state: ImportPersistenceStateV6 | undefined }) {
  if (!state) return null;
  if (state.state === 'failed') {
    return (
      <Alert status="danger" className="mt-5">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Importação não aplicada</Alert.Title>
          <Alert.Description>{state.message}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (state.state !== 'completed') return null;
  const response = state.response;
  const success = response.state === 'applied' || response.state === 'no-changes';
  const issue =
    'issues' in response && response.issues.length > 0
      ? ` Motivo técnico: ${[...new Set(response.issues.map((value) => value.code))].join(', ')}.`
      : response.state === 'invalid-request'
        ? ` Motivo técnico: ${response.reason}.`
        : '';
  const committed = 'summary' in response ? response.summary.committedWrites.total : null;
  return (
    <Alert status={success ? 'success' : 'warning'} className="mt-5">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{persistenceLabel(state)}</Alert.Title>
        <Alert.Description>
          {committed === null
            ? issue.trim()
            : `${committed} gravação(ões) acadêmicas confirmadas no lote atômico.${issue}`}
        </Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function NotesImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    error,
    failures,
    handleFiles,
    loading,
    progress,
    persistence,
    results,
    selectedId,
    selectedResult,
    setSelectedId,
    totals,
  } = useImportBatch();

  return (
    <Surface variant="default" className="platform-card-surface rounded-[2rem] p-6 sm:p-7">
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept=".xlsx,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.binary.macroEnabled.12"
        onChange={(event) => {
          const input = event.currentTarget;
          if (input.files?.length) {
            void handleFiles(input.files).finally(() => {
              input.value = '';
            });
          }
        }}
      />

      <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="size-5 text-accent" />
            <h3 className="text-lg font-semibold">Importar planilhas</h3>
          </div>
          <p className="mt-2 text-sm text-muted">
            Até {MAX_NOTES_IMPORT_FILES} arquivos XLSB, XLSX ou XLS por lote. O arquivo é aberto e
            organizado localmente; somente o pacote acadêmico mínimo é enviado ao Banco de Notas e
            persistido automaticamente.
          </p>
        </div>
        <Button
          variant="primary"
          isPending={loading}
          isDisabled={loading}
          onPress={() => inputRef.current?.click()}
        >
          <Upload className="size-4" />
          {loading ? 'Processando importação' : 'Selecionar planilhas'}
        </Button>
      </div>

      {progress && (
        <Surface variant="secondary" className="mt-5 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{PROGRESS_STAGE[progress.stage][0]}</span>
            <span className="text-muted">{progressValue(progress)}%</span>
          </div>
          <ProgressBar
            className="mt-3"
            value={progressValue(progress)}
            color={progress.stage === 'completed' ? 'success' : 'accent'}
            aria-label="Progresso da importação"
          />
          <p className="mt-2 truncate text-xs text-muted">{progress.fileName}</p>
        </Surface>
      )}

      {error && (
        <Alert status="danger" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Não foi possível concluir a importação</Alert.Title>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {(results.length > 0 || failures.length > 0) && (
        <div className="mt-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Arquivos', results.length + failures.length, `limite ${MAX_NOTES_IMPORT_FILES}`],
              [
                'Reconhecidos',
                results.length,
                failures.length ? `${failures.length} com erro` : 'sem erros',
              ],
              ['Turmas', totals.classes, 'somadas no lote'],
              ['Alunos', totals.students, `${totals.gradeSheets} guias reconhecidas`],
            ].map(([label, value, detail]) => (
              <Surface key={String(label)} variant="secondary" className="rounded-2xl p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
                <p className="mt-2 text-2xl font-semibold">{value}</p>
                <p className="mt-1 text-xs text-muted">{detail}</p>
              </Surface>
            ))}
          </div>

          {failures.length > 0 && (
            <Alert status="warning" className="mt-4">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{failures.length} arquivo(s) não reconhecido(s)</Alert.Title>
                <Alert.Description>
                  {failures.map((failure) => `${failure.fileName}: ${failure.message}`).join(' · ')}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {results.map((result) => (
              <Surface key={result.id} variant="secondary" className="rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto font-medium">{result.manifest.fileName}</p>
                  <span className="text-xs font-medium">{persistenceLabel(persistence[result.id])}</span>
                </div>
                <FileHash sha256={result.manifest.sha256} />
                <p className="mt-2 text-xs text-muted">
                  Processamento local V6 · persistência automática
                </p>
              </Surface>
            ))}
            {failures.map((failure) => (
              <Surface key={failure.id} variant="secondary" className="rounded-2xl p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="mr-auto font-medium">{failure.fileName}</p>
                  <span className="text-xs font-medium text-danger">Falha isolada</span>
                </div>
                {failure.manifest ? (
                  <FileHash sha256={failure.manifest.sha256} />
                ) : (
                  <p className="mt-2 text-xs text-muted">Manifesto indisponível</p>
                )}
                <p className="mt-2 text-xs text-muted">
                  {failure.stage === 'preparation' ? 'Preparação/hash' : 'Reconhecimento'} ·{' '}
                  {failure.diagnostic.code}: {failure.message}
                </p>
              </Surface>
            ))}
          </div>

          {results.length > 0 && (
            <div className="mt-5 overflow-x-auto pb-1">
              <div className="flex min-w-max gap-2">
                {results.map((result) => (
                  <Button
                    key={result.id}
                    variant={selectedId === result.id ? 'secondary' : 'ghost'}
                    size="sm"
                    onPress={() => setSelectedId(result.id)}
                  >
                    <FileSpreadsheet className="size-4" />
                    {result.summary.fileName}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {selectedResult && (
            <>
              <WorkbookInspector result={selectedResult} />
              <PersistenceResult state={persistence[selectedResult.id]} />
            </>
          )}
        </div>
      )}
    </Surface>
  );
}
