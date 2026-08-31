import { useRef, useState } from 'react';
import { Alert, Button, Chip, Surface } from '@heroui/react';
import { CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react';
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

declare global {
  interface Window {
    XLSX?: SheetJs;
  }
}

let sheetJsPromise: Promise<SheetJs> | null = null;

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

export function NotesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<WorkbookSummary | null>(null);

  async function handleFile(file: File) {
    const extension = fileExtension(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
      setWorkbook(null);
      setError('Selecione uma planilha XLSX, XLSB ou XLS.');
      return;
    }
    setLoading(true);
    setError(null);
    setWorkbook(null);
    try {
      const xlsx = await loadSheetJs();
      const parsed = xlsx.read(await file.arrayBuffer(), {
        type: 'array',
        cellDates: true,
        cellFormula: true,
        cellNF: true,
        cellStyles: true,
      });
      if (parsed.SheetNames.length === 0) throw new Error('A planilha não contém abas reconhecíveis.');
      const summary = recognizeWorkbook(file, parsed, xlsx);
      if (summary.gradeSheets.length === 0) {
        throw new Error('O arquivo abriu, mas nenhuma guia corresponde ao padrão de notas configurado.');
      }
      setWorkbook(summary);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reconhecer a planilha.');
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const totalStudents = workbook?.classes.reduce((sum, classroom) => sum + classroom.students, 0) ?? 0;
  const trimesterGuides = workbook?.gradeSheets.filter((sheet) => sheet.stage.startsWith('trimester')).length ?? 0;
  const recoveryClasses = workbook?.classes.filter((classroom) => classroom.recovery).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="Banco de notas"
        title="Banco de notas"
        description="Área de trabalho para importar e reconhecer planilhas de notas. Novas seções poderão ser adicionadas ao menu interno conforme o módulo evoluir."
      />

      <Surface variant="default" className="mb-5 rounded-2xl border border-border/60 p-2 shadow-sm">
        <nav aria-label="Seções do Banco de notas" className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" aria-current="page">
            <FileSpreadsheet className="size-4" />
            Importação
          </Button>
        </nav>
      </Surface>

      <Surface variant="default" className="platform-card-surface rounded-[2rem] p-6 sm:p-7">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xlsb,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.ms-excel.sheet.binary.macroEnabled.12"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-accent" />
              <h3 className="text-lg font-semibold">Importar planilha</h3>
            </div>
            <p className="mt-2 text-sm text-muted">XLSB, XLSX e XLS. Leitura somente em memória, sem upload.</p>
          </div>
          <Button variant="primary" isPending={loading} onPress={() => inputRef.current?.click()}>
            <Upload className="size-4" />
            {loading ? 'Reconhecendo' : 'Importar planilha'}
          </Button>
        </div>

        {error && (
          <Alert status="danger" className="mt-5">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Não foi possível reconhecer a planilha</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {workbook && (
          <div className="mt-6">
            <Alert status="success">
              <Alert.Indicator><CheckCircle2 className="size-4" /></Alert.Indicator>
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
                    {classroom.declaredStudents !== null && <Chip variant="soft" size="sm">J1: {classroom.declaredStudents}</Chip>}
                    {classroom.trimesters.map((period) => <Chip key={period} color="success" variant="soft" size="sm">{period}</Chip>)}
                    {classroom.recovery && <Chip color="accent" variant="soft" size="sm">REC</Chip>}
                  </div>
                  <p className="mt-2 text-sm text-muted">
                    {classroom.disciplines.length ? classroom.disciplines.join(' · ') : 'Disciplina não informada em K2'}
                  </p>

                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium">Ver leitura por trimestre</summary>
                    <div className="mt-3 space-y-3">
                      {trimesterSheets(classroom.sheets).map((sheet) => {
                        const q = noteCount(sheet.students.map((student) => student.quantitativeTotal));
                        const ql = noteCount(sheet.students.map((student) => student.qualitativeTotal));
                        const activities = sheet.students.reduce((sum, student) => sum + noteCount(student.qualitative), 0);
                        const official = noteCount(sheet.students.map((student) => student.official));
                        return (
                          <Surface key={sheet.name} variant="secondary" className="rounded-2xl p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="mr-auto font-semibold">{stageLabel(sheet.stage)} · {sheet.discipline || sheet.disciplineIndex}</p>
                              <Chip variant="soft" size="sm">{sheet.disciplineIndex}</Chip>
                              <Chip variant="soft" size="sm">{sheet.students.length} alunos</Chip>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Chip variant="soft" size="sm">Q/T: {q}</Chip>
                              <Chip variant="soft" size="sm">AA:AJ: {activities}</Chip>
                              <Chip variant="soft" size="sm">QL/AK: {ql}</Chip>
                              <Chip variant="soft" size="sm">Oficial/AM: {official}</Chip>
                              {sheet.formulas > 0 && <Chip color="accent" variant="soft" size="sm">Fórmulas: {sheet.formulas}</Chip>}
                              {sheet.officialZeros > 0 && <Chip color="warning" variant="soft" size="sm">Zeros 0,1: {sheet.officialZeros}</Chip>}
                            </div>
                            <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-border/50">
                              {sheet.students.map((student) => (
                                <div key={`${sheet.name}-${student.row}`} className="grid grid-cols-[3rem_minmax(11rem,1fr)_5rem_5rem_5rem] gap-2 border-b border-border/40 px-3 py-2 text-xs last:border-0">
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
                        const eligible1 = sheet.students.filter((student) => student.recovery?.eligibleTrimester1).length;
                        const eligible2 = sheet.students.filter((student) => student.recovery?.eligibleTrimester2).length;
                        const eligible3 = sheet.students.filter((student) => student.recovery?.eligibleTrimester3).length;
                        const recoveryNotes = sheet.students.reduce(
                          (sum, student) => sum + noteCount([
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
                              <p className="mr-auto font-semibold">Recuperação final · {sheet.discipline || sheet.disciplineIndex}</p>
                              <Chip variant="soft" size="sm">{sheet.disciplineIndex}</Chip>
                              <Chip variant="soft" size="sm">{sheet.students.length} alunos</Chip>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Chip variant="soft" size="sm">Elegíveis 1º: {eligible1}</Chip>
                              <Chip variant="soft" size="sm">Elegíveis 2º: {eligible2}</Chip>
                              <Chip variant="soft" size="sm">Elegíveis 3º: {eligible3}</Chip>
                              <Chip variant="soft" size="sm">Notas REC: {recoveryNotes}</Chip>
                              <Chip variant="soft" size="sm">Totais pós-REC/U: {totalsAfterRecovery}</Chip>
                              {sheet.formulas > 0 && <Chip color="accent" variant="soft" size="sm">Fórmulas: {sheet.formulas}</Chip>}
                            </div>
                            <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border/50">
                              <div className="min-w-[62rem]">
                                <div className="grid grid-cols-[3rem_minmax(12rem,1fr)_5rem_5rem_5rem_5rem_5rem_5rem_6rem_6rem] gap-2 border-b border-border/50 px-3 py-2 text-[11px] font-medium text-muted">
                                  <span>Nº</span>
                                  <span>Aluno</span>
                                  <span>1º orig.</span>
                                  <span>REC 1º</span>
                                  <span>2º orig.</span>
                                  <span>REC 2º</span>
                                  <span>3º orig.</span>
                                  <span>REC 3º</span>
                                  <span>Total orig.</span>
                                  <span>Pós-REC</span>
                                </div>
                                {sheet.students.map((student) => {
                                  const recovery = student.recovery;
                                  return (
                                    <div key={`${sheet.name}-${student.row}`} className="grid grid-cols-[3rem_minmax(12rem,1fr)_5rem_5rem_5rem_5rem_5rem_5rem_6rem_6rem] gap-2 border-b border-border/40 px-3 py-2 text-xs last:border-0">
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
                            <p className="mt-2 text-xs text-muted">• trimestre marcado pela própria planilha como aplicável à recuperação.</p>
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
              {workbook.auxiliarySheets.map((name) => <Chip key={name} variant="soft" size="sm">Auxiliar: {name}</Chip>)}
              {workbook.unrecognizedSheets.length > 0 && <Chip color="warning" variant="soft" size="sm">Não classificadas: {workbook.unrecognizedSheets.length}</Chip>}
            </div>
          </div>
        )}
      </Surface>
    </>
  );
}