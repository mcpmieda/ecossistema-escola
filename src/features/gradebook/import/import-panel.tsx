import { useRef } from 'react';
import { Alert, Button, Surface } from '@heroui/react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { MAX_NOTES_IMPORT_FILES } from './import-batch';
import { useImportBatch } from './use-import-batch';
import { WorkbookInspector } from './workbook-inspector';

export function NotesImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    error,
    failures,
    handleFiles,
    loading,
    progress,
    results,
    selectedId,
    selectedWorkbook,
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
            Até {MAX_NOTES_IMPORT_FILES} arquivos XLSB, XLSX ou XLS por lote. Processamento
            sequencial, somente em memória e sem upload.
          </p>
        </div>
        <Button variant="primary" isPending={loading} onPress={() => inputRef.current?.click()}>
          <Upload className="size-4" />
          {loading ? 'Reconhecendo lote' : 'Selecionar planilhas'}
        </Button>
      </div>

      {progress && (
        <Alert status="accent" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>
              Reconhecendo {progress.current} de {progress.total}
            </Alert.Title>
            <Alert.Description>{progress.fileName}</Alert.Description>
          </Alert.Content>
        </Alert>
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
              ['Alunos', totals.students, `${totals.gradeSheets} guias de notas`],
            ].map(([label, value, detail]) => (
              <Surface key={String(label)} variant="secondary" className="rounded-2xl p-4">
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">
                  {label}
                </p>
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

          {selectedWorkbook && <WorkbookInspector workbook={selectedWorkbook} />}
        </div>
      )}
    </Surface>
  );
}
