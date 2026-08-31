import { useMemo, useRef, useState } from 'react';
import { Alert, Button, Chip, Surface } from '@heroui/react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
import { notesSections } from './notes-module';
import {
  ACCEPTED_EXTENSIONS,
  fileExtension,
  formatNote,
  noteCount,
  recognizeWorkbook,
  recoverySheets,
  stageLabel,
  trimesterSheets,
  type SheetJs,
  type WorkbookSummary,
} from './notes-spreadsheet-recognizer';
import { PageHeader } from './presentation';

const SHEETJS_SRC = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
export const MAX_NOTES_IMPORT_FILES = 50;

declare global {
  interface Window {
    XLSX?: SheetJs;
  }
}

let sheetJsPromise: Promise<SheetJs> | null = null;

type BatchSuccess = {
  id: string;
  summary: WorkbookSummary;
};

type BatchFailure = {
  fileName: string;
  message: string;
};

type BatchProgress = {
  current: number;
  total: number;
  fileName: string;
};

function loadSheetJs(): Promise<SheetJs> {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (sheetJsPromise) return sheetJsPromise;
  sheetJsPromise = new Promise<SheetJs>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SHEETJS_SRC;
    script.async = true;
    script.addEventListener('load', () => {
      if (window.XLSX) resolve(window.XLSX);
      else reject(new Error('O leitor de planilhas não foi carregado.'));
    });
    script.addEventListener('error', () => {
      sheetJsPromise = null;
      reject(new Error('Não foi possível carregar o leitor de planilhas.'));
    });
    document.head.appendChild(script);
  });
  return sheetJsPromise;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function workbookId(file: File, index: number): string {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

function WorkbookRecognition({ workbook }: { workbook: WorkbookSummary }) {
  const totalStudents = workbook.classes.reduce((sum, classroom) => sum + classroom.students, 0);
  const trimesterGuides = workbook.gradeSheets.filter((sheet) => sheet.stage.startsWith('trimester')).length;
  const recoveryClasses = workbook.classes.filter((classroom) => classroom.recovery).length;

  return (
    <div className="mt-5">
      <Alert status="success">
        <Alert.Indicator>
          <CheckCircle2 className="size-4" />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>Padrão de notas reconhecido</Alert.Title>
          <Alert.Description>
            {workbook.fileName} · {workbook.format} · {formatBytes(workbook.size)} · {workbook.sheets.length} aba(s)
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Turmas', workbook.classes.length, 'turmas distintas'],
          ['Alunos', totalStudents, 'posições únicas por turma'],
          ['Trimestres', trimesterGuides, 'guias de 1º, 2º e 3º'],
          ['Recuperação', recoveryClasses, 'turma(s) com guia REC'],
        ].map(([label, value, detail]) => (
          <Surface key={String(label)} variant="secondary" className="rounded-2xl p-4">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
            <p className="mt-1 text-xs text-muted">{detail}</p>
          </Surface>
        ))}
      </div>

      <div className="mt-5 space-y-4">
        {workbook.classes.map((classroom) => (
          <Surface key={classroom.name} variant="default" className="rounded-3xl border border-border/60 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="mr-1 text-lg font-semibold">{classroom.name}</h3>
              <Chip variant="soft" size="sm">{classroom.students} alunos</Chip>
              {classroom.declaredStudents !== null && (
                <Chip variant="soft" size="sm">J1: {classroom.declaredStudents}</Chip>
              )}
              {classroom.trimesters.map((period) => (
                <Chip key={period} color="success" variant="soft" size="sm">{period}</Chip>
              ))}
              {classroom.recovery && <Chip color="accent" variant="soft" size="sm">REC</Chip>}
            </div>
            <p className="mt-2 text-sm text-muted">
              {classroom.disciplines.length
                ? classroom.disciplines.join(' · ')
                : 'Disciplina não informada em K2'}
            </p>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Ver leitura por trimestre</summary>
              <div className="mt-3 space-y-3">
                {trimesterSheets(classroom.sheets).map((sheet) => {
                  const q = noteCount(sheet.students.map((student) => student.quantitativeTotal));
                  const ql = noteCount(sheet.students.map((student) => student.qualitativeTotal));
                  const activities = sheet.students.reduce(
                    (sum, student) => sum + noteCount(student.qualitative),
                    0,
                  );
                  const official = noteCount(sheet.students.map((student) => student.official));

                  return (
                    <Surface key={sheet.name} variant="secondary" className="rounded-2xl p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto font-semibold">
                          {stageLabel(sheet.stage)} · {sheet.discipline || sheet.disciplineIndex}
                        </p>
                        <Chip variant="soft" size="sm">{sheet.disciplineIndex}</Chip>
                        <Chip variant="soft" size="sm">{sheet.students.length} alunos</Chip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip variant="soft" size="sm">Q/T: {q}</Chip>
                        <Chip variant="soft" size="sm">AA:AJ: {activities}</Chip>
                        <Chip variant="soft" size="sm">QL/AK: {ql}</Chip>
                        <Chip variant="soft" size="sm">Oficial/AM: {official}</Chip>
                        {sheet.formulas > 0 && (
                          <Chip color="accent" variant="soft" size="sm">Fórmulas: {sheet.formulas}</Chip>
                        )}
                        {sheet.officialZeros > 0 && (
                          <Chip color="warning" variant="soft" size="sm">Zeros 0,1: {sheet.officialZeros}</Chip>
                        )}
                      </div>
                      <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border/50">
                        {sheet.students.map((student) => (
                          <div
                            key={`${sheet.name}-${student.row}`}
                            className="grid min-w-[32rem] grid-cols-[3rem_minmax(11rem,1fr)_5rem_5rem_5rem] gap-2 border-b border-border/40 px-3 py-2 text-xs last:border-0"
                          >
                            <span className="text-muted">{student.number}</span>
                            <span className="truncate font-medium">{student.name}</span>
                            <span title="Quantitativo">Q {formatNote(student.quantitativeTotal)}</span>
                            <span title="Qualitativo">QL {formatNote(student.qualitativeTotal)}</span>
                            <span title="Nota oficial">AM {formatNote(student.official)}</span>
                          </div>
                        ))}
                      </div>
                    </Surface>
                  );
                })}

                {recoverySheets(classroom.sheets).map((sheet) => {
                  const eligible1 = sheet.students.filter(
                    (student) => student.recovery?.eligibleTrimester1,
                  ).length;
                  const eligible2 = sheet.students.filter(
                    (student) => student.recovery?.eligibleTrimester2,
                  ).length;
                  const eligible3 = sheet.students.filter(
                    (student) => student.recovery?.eligibleTrimester3,
                  ).length;
                  const recoveryNotes = sheet.students.reduce(
                    (sum, student) =>
                      sum +
                      noteCount([
                        student.recovery?.trimester1 ?? null,
                        student.recovery?.trimester2 ?? null,
                        student.recovery?.trimester3 ?? null,
                      ]),
                    0,
                  );
                  const totalsAfterRecovery = noteCount(
                    sheet.students.map((student) => student.recovery?.totalAfterRecovery ?? null),
                  );

                  return (
                    <Surface key={sheet.name} variant="secondary" className="rounded-2xl p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="mr-auto font-semibold">
                          Recuperação final · {sheet.discipline || sheet.disciplineIndex}
                        </p>
                        <Chip variant="soft" size="sm">{sheet.disciplineIndex}</Chip>
                        <Chip variant="soft" size="sm">{sheet.students.length} alunos</Chip>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Chip variant="soft" size="sm">Elegíveis 1º: {eligible1}</Chip>
                        <Chip variant="soft" size="sm">Elegíveis 2º: {eligible2}</Chip>
                        <Chip variant="soft" size="sm">Elegíveis 3º: {eligible3}</Chip>
                        <Chip variant="soft" size="sm">Notas REC: {recoveryNotes}</Chip>
                        <Chip variant="soft" size="sm">Totais pós-REC/U: {totalsAfterRecovery}</Chip>
                        {sheet.formulas > 0 && (
                          <Chip color="accent" variant="soft" size="sm">Fórmulas: {sheet.formulas}</Chip>
                        )}
                      </div>
                      <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/50">
                        <div className="min-w-[62rem]">
                          <div className="grid grid-cols-[3rem_minmax(12rem,1fr)_5rem_5rem_5rem_5rem_5rem_5rem_6rem_6rem] gap-2 border-b border-border/50 px-3 py-2 text-[11px] font-medium text-muted">
                            <span>Nº</span><span>Aluno</span><span>1º orig.</span><span>REC 1º</span>
                            <span>2º orig.</span><span>REC 2º</span><span>3º orig.</span><span>REC 3º</span>
                            <span>Total orig.</span><span>Pós-REC</span>
                          </div>
                          {sheet.students.map((student) => {
                            const recovery = student.recovery;
                            return (
                              <div
                                key={`${sheet.name}-${student.row}`}
                                className="grid grid-cols-[3rem_minmax(12rem,1fr)_5rem_5rem_5rem_5rem_5rem_5rem_6rem_6rem] gap-2 border-b border-border/40 px-3 py-2 text-xs last:border-0"
                              >
                                <span className="text-muted">{student.number}</span>
                                <span className="truncate font-medium">{student.name}</span>
                                <span>{formatNote(recovery?.originalTrimester1 ?? null)}</span>
                                <span>{recovery?.eligibleTrimester1 ? '• ' : ''}{formatNote(recovery?.trimester1 ?? null)}</span>
                                <span>{formatNote(recovery?.originalTrimester2 ?? null)}</span>
                                <span>{recovery?.eligibleTrimester2 ? '• ' : ''}{formatNote(recovery?.trimester2 ?? null)}</span>
                                <span>{formatNote(recovery?.originalTrimester3 ?? null)}</span>
                                <span>{recovery?.eligibleTrimester3 ? '• ' : ''}{formatNote(recovery?.trimester3 ?? null)}</span>
                                <span>{formatNote(recovery?.originalAnnual ?? null)}</span>
                                <span>{formatNote(recovery?.totalAfterRecovery ?? null)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <p className="mt-2 text-xs text-muted">
                        • trimestre marcado pela própria planilha como aplicável à recuperação.
                      </p>
                    </Surface>
                  );
                })}
              </div>
            </details>
          </Surface>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Chip variant="soft" size="sm">SheetJS {workbook.parserVersion}</Chip>
        <Chip variant="soft" size="sm">Guias de notas: {workbook.gradeSheets.length}</Chip>
        {workbook.auxiliarySheets.map((name) => (
          <Chip key={name} variant="soft" size="sm">Auxiliar: {name}</Chip>
        ))}
        {workbook.unrecognizedSheets.length > 0 && (
          <Chip color="warning" variant="soft" size="sm">
            Não classificadas: {workbook.unrecognizedSheets.length}
          </Chip>
        )}
      </div>
    </div>
  );
}

export function NotesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<BatchSuccess[]>([]);
  const [failures, setFailures] = useState<BatchFailure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);

  const selectedWorkbook = useMemo(
    () => results.find((result) => result.id === selectedId)?.summary ?? results[0]?.summary ?? null,
    [results, selectedId],
  );

  const totals = useMemo(
    () => ({
      classes: results.reduce((sum, result) => sum + result.summary.classes.length, 0),
      students: results.reduce(
        (sum, result) =>
          sum + result.summary.classes.reduce((classSum, classroom) => classSum + classroom.students, 0),
        0,
      ),
      gradeSheets: results.reduce((sum, result) => sum + result.summary.gradeSheets.length, 0),
    }),
    [results],
  );

  async function handleFiles(fileList: FileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    if (files.length > MAX_NOTES_IMPORT_FILES) {
      setResults([]);
      setFailures([]);
      setSelectedId(null);
      setError(`Selecione no máximo ${MAX_NOTES_IMPORT_FILES} planilhas por lote.`);
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setLoading(true);
    setError(null);
    setResults([]);
    setFailures([]);
    setSelectedId(null);

    const successes: BatchSuccess[] = [];
    const batchFailures: BatchFailure[] = [];

    try {
      const xlsx = await loadSheetJs();

      for (const [index, file] of files.entries()) {
        setProgress({ current: index + 1, total: files.length, fileName: file.name });

        const extension = fileExtension(file.name);
        if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
          batchFailures.push({ fileName: file.name, message: 'Formato não suportado.' });
          continue;
        }

        try {
          const parsed = xlsx.read(await file.arrayBuffer(), {
            type: 'array',
            cellDates: true,
            cellFormula: true,
            cellNF: true,
            cellStyles: true,
          });
          if (parsed.SheetNames.length === 0) {
            throw new Error('A planilha não contém abas reconhecíveis.');
          }

          const summary = recognizeWorkbook(file, parsed, xlsx);
          if (summary.gradeSheets.length === 0) {
            throw new Error('Nenhuma guia corresponde ao padrão de notas configurado.');
          }

          successes.push({ id: workbookId(file, index), summary });
        } catch (cause) {
          batchFailures.push({
            fileName: file.name,
            message: cause instanceof Error ? cause.message : 'Não foi possível reconhecer a planilha.',
          });
        }
      }

      setResults(successes);
      setFailures(batchFailures);
      setSelectedId(successes[0]?.id ?? null);
      if (successes.length === 0) {
        setError('Nenhuma das planilhas selecionadas pôde ser reconhecida.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o leitor de planilhas.');
    } finally {
      setProgress(null);
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Banco de notas"
        title="Banco de notas"
        description="Importação local em lote e reconhecimento do padrão das planilhas de notas."
      />

      <Surface variant="default" className="mb-5 rounded-2xl border border-border/60 p-2 shadow-sm">
        <nav aria-label="Seções do Banco de notas" className="flex flex-wrap items-center gap-2">
          {notesSections.map((section) => (
            <Button
              key={section.id}
              variant="secondary"
              size="sm"
              aria-current={section.id === 'importacao' ? 'page' : undefined}
              onPress={() => {
                if (window.location.hash !== section.href) window.location.hash = section.href;
              }}
            >
              <FileSpreadsheet className="size-4" />
              {section.label}
            </Button>
          ))}
        </nav>
      </Surface>

      <Surface variant="default" className="platform-card-surface rounded-[2rem] p-6 sm:p-7">
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".xlsx,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.binary.macroEnabled.12"
          onChange={(event) => {
            if (event.currentTarget.files?.length) void handleFiles(event.currentTarget.files);
          }}
        />

        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-accent" />
              <h3 className="text-lg font-semibold">Importar planilhas</h3>
            </div>
            <p className="mt-2 text-sm text-muted">
              Até {MAX_NOTES_IMPORT_FILES} arquivos XLSB, XLSX ou XLS por lote. Processamento sequencial, somente em memória e sem upload.
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
              <Alert.Title>Reconhecendo {progress.current} de {progress.total}</Alert.Title>
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
                ['Reconhecidos', results.length, failures.length ? `${failures.length} com erro` : 'sem erros'],
                ['Turmas', totals.classes, 'somadas no lote'],
                ['Alunos', totals.students, `${totals.gradeSheets} guias de notas`],
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

            {selectedWorkbook && <WorkbookRecognition workbook={selectedWorkbook} />}
          </div>
        )}
      </Surface>
    </>
  );
}
