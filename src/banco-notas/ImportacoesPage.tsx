import {
  Alert,
  Breadcrumbs,
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  Surface,
  Table,
  TextField,
} from '@heroui/react';
import { FileSpreadsheet, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DataSource, SchoolYear, Teacher } from '../../shared/banco-notas-contract';
import type { ImportAnalysis } from '../../shared/banco-notas-import-analysis';
import type { ImportJob } from '../../shared/banco-notas-import-jobs';
import { institutionalManualProfileKey } from '../../shared/banco-notas-institutional-xlsx-profile';
import type { ManualImportSummary } from '../../shared/banco-notas-manual-import';

const xlsxContentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const maxUploadBytes = 32 * 1024 * 1024;

async function bancoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/banco-notas${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { ...(init?.headers ?? {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string;
    error?: string;
  };
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? 'Falha na importação.');
  return payload;
}

function ImportSelect({
  label,
  value,
  items,
  onChange,
  isDisabled = false,
}: {
  label: string;
  value: string;
  items: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  isDisabled?: boolean;
}) {
  return (
    <Select
      aria-label={label}
      selectedKey={value || null}
      placeholder="Selecione"
      isDisabled={isDisabled}
      onSelectionChange={(key) => onChange(key ? String(key) : '')}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox items={items}>
          {(item) => (
            <ListBox.Item id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          )}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR');
}

function gradeValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Ausente';
  return String(value);
}

export function ImportacoesPage() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [yearId, setYearId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [selectedJobId, setSelectedJobId] = useState('');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedYears, loadedSources, loadedTeachers, loadedJobs] = await Promise.all([
        bancoApi<SchoolYear[]>('/v1/school-years'),
        bancoApi<DataSource[]>('/v1/data-sources'),
        bancoApi<Teacher[]>('/v1/teachers'),
        bancoApi<ImportJob[]>('/v1/import-jobs'),
      ]);
      setYears(loadedYears);
      setSources(loadedSources);
      setTeachers(loadedTeachers);
      setJobs(loadedJobs);
      setYearId((current) => current || loadedYears[0]?.id || '');
    } catch (error) {
      setMessage({
        kind: 'danger',
        text: error instanceof Error ? error.message : 'Falha ao carregar as importações.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const compatibleSources = useMemo(
    () =>
      sources.filter((source) => source.schoolYearId === yearId && source.type === 'legacy_import'),
    [sources, yearId],
  );
  const visibleJobs = useMemo(
    () => jobs.filter((job) => !yearId || job.schoolYearId === yearId),
    [jobs, yearId],
  );

  useEffect(() => {
    if (!compatibleSources.some((source) => source.id === sourceId)) {
      setSourceId(compatibleSources[0]?.id ?? '');
    }
  }, [compatibleSources, sourceId]);

  const openJob = useCallback(async (jobId: string) => {
    setSelectedJobId(jobId);
    setAnalysis(null);
    try {
      const loaded = await bancoApi<ImportAnalysis>(`/v1/import-jobs/${jobId}/analysis`);
      setAnalysis(loaded);
    } catch (error) {
      setMessage({
        kind: 'danger',
        text: error instanceof Error ? error.message : 'A análise deste lote não está disponível.',
      });
    }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const candidate = data.get('workbook');
    const reason = String(data.get('reason') ?? '').trim();
    if (!(candidate instanceof File) || candidate.size === 0) {
      setMessage({ kind: 'danger', text: 'Selecione uma cópia .xlsx da planilha.' });
      return;
    }
    if (!candidate.name.toLocaleLowerCase('pt-BR').endsWith('.xlsx')) {
      setMessage({
        kind: 'danger',
        text: 'Este fluxo aceita somente .xlsx. No Excel, use “Salvar uma cópia” para converter o .xlsb.',
      });
      return;
    }
    if (candidate.size > maxUploadBytes) {
      setMessage({ kind: 'danger', text: 'O arquivo excede o limite seguro de 32 MB.' });
      return;
    }
    if (!yearId || !sourceId || !teacherId || reason.length < 3) {
      setMessage({ kind: 'danger', text: 'Preencha ano, professor, fonte e motivo.' });
      return;
    }

    setUploading(true);
    setMessage(null);
    try {
      const query = new URLSearchParams({
        schoolYearId: yearId,
        teacherId,
        dataSourceId: sourceId,
        profileKey: institutionalManualProfileKey,
        fileName: candidate.name,
      });
      const result = await bancoApi<ManualImportSummary>(`/v1/manual-imports?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': xlsxContentType, 'X-Import-Reason': reason },
        body: candidate,
      });
      setMessage({
        kind: 'success',
        text: result.reused
          ? 'Este mesmo arquivo já havia sido analisado. O Banco reutilizou o lote sem duplicar dados.'
          : `Planilha analisada: ${result.studentCount} estudante(s), ${result.gradeSlotCount} campo(s) de nota.`,
      });
      await load();
      await openJob(result.jobId);
      form.reset();
    } catch (error) {
      setMessage({
        kind: 'danger',
        text: error instanceof Error ? error.message : 'Não foi possível analisar a planilha.',
      });
    } finally {
      setUploading(false);
    }
  }

  const selectedJob = jobs.find((job) => job.id === selectedJobId) ?? null;
  const slotsByStudent = useMemo(() => {
    const result = new Map<string, ImportAnalysis['model']['gradeSlots']>();
    for (const slot of analysis?.model.gradeSlots ?? []) {
      const current = result.get(slot.sourceStudentId) ?? [];
      current.push(slot);
      result.set(slot.sourceStudentId, current);
    }
    return result;
  }, [analysis]);

  return (
    <main className="bn-main">
      <Breadcrumbs className="mb-5">
        <Breadcrumbs.Item href="/#sistemas">Centro de Administração</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/banco-de-notas">Banco de Notas</Breadcrumbs.Item>
        <Breadcrumbs.Item>Importações</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Importar planilha</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Envie uma cópia .xlsx da planilha que o professor já usa. O Banco lê a cópia, preserva a
          origem e não altera o arquivo original.
        </p>
      </header>

      {message && (
        <Alert status={message.kind} className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{message.kind === 'success' ? 'Concluído' : 'Atenção'}</Alert.Title>
            <Alert.Description>{message.text}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(20rem,1fr)]">
          <Surface className="bn-card">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-accent-soft p-2 text-accent">
                <Upload className="size-5" />
              </div>
              <div>
                <h2 className="font-semibold">Novo upload manual</h2>
                <p className="mt-1 text-sm text-muted">
                  XLSB não é enviado diretamente. Salve uma cópia XLSX e selecione-a abaixo.
                </p>
              </div>
            </div>
            <form className="bn-form mt-5" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <ImportSelect
                  label="Ano letivo"
                  value={yearId}
                  onChange={setYearId}
                  items={years.map((year) => ({ id: year.id, label: year.name }))}
                />
                <ImportSelect
                  label="Professor"
                  value={teacherId}
                  onChange={setTeacherId}
                  items={teachers.map((teacher) => ({
                    id: teacher.id,
                    label: teacher.displayName,
                  }))}
                />
                <ImportSelect
                  label="Fonte"
                  value={sourceId}
                  onChange={setSourceId}
                  isDisabled={!yearId}
                  items={compatibleSources.map((source) => ({ id: source.id, label: source.name }))}
                />
                <div className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-medium">Perfil institucional</p>
                  <p className="mt-1 text-muted">Visão Geral · turma + número sequencial</p>
                </div>
              </div>
              <TextField name="workbook" isRequired>
                <Label>Cópia da planilha (.xlsx)</Label>
                <Input
                  variant="secondary"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                />
              </TextField>
              <TextField
                name="reason"
                isRequired
                defaultValue="Atualização manual da planilha docente"
              >
                <Label>Motivo</Label>
                <Input variant="secondary" minLength={3} maxLength={500} />
              </TextField>
              {!compatibleSources.length && yearId && (
                <p className="text-sm text-danger">
                  Cadastre uma fonte do tipo Importação legada para este ano.
                </p>
              )}
              <Button
                type="submit"
                variant="primary"
                isPending={uploading}
                isDisabled={!yearId || !teacherId || !sourceId || uploading}
              >
                Analisar planilha
              </Button>
            </form>
          </Surface>

          <Surface className="bn-card">
            <h2 className="font-semibold">Uploads recentes</h2>
            <div className="mt-4 grid gap-2">
              {visibleJobs.length ? (
                visibleJobs.slice(0, 30).map((job) => (
                  <Button
                    key={job.id}
                    variant={selectedJobId === job.id ? 'primary' : 'outline'}
                    className="h-auto justify-between py-3 text-left"
                    onPress={() => void openJob(job.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {typeof job.provenance.fileName === 'string'
                          ? job.provenance.fileName
                          : 'Importação sem nome de arquivo'}
                      </span>
                      <span className="block text-xs opacity-75">{formatDate(job.updatedAt)}</span>
                    </span>
                    <Chip size="sm" variant="soft">
                      {job.state}
                    </Chip>
                  </Button>
                ))
              ) : (
                <p className="text-sm text-muted">Nenhum upload para este ano.</p>
              )}
            </div>
          </Surface>
        </div>
      )}

      {selectedJob && (
        <Surface className="bn-card mt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Conteúdo lido</h2>
              <p className="mt-1 text-sm text-muted">
                {typeof selectedJob.provenance.fileName === 'string'
                  ? selectedJob.provenance.fileName
                  : selectedJob.id}
              </p>
            </div>
            <Chip variant="soft" color={selectedJob.state === 'analyzed' ? 'success' : 'warning'}>
              {selectedJob.state}
            </Chip>
          </div>
          {!analysis ? (
            <Spinner className="mt-5" />
          ) : (
            <>
              <div className="bn-grid mt-5">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted">Turmas</p>
                  <strong className="text-xl">{analysis.model.classes.length}</strong>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted">Componentes</p>
                  <strong className="text-xl">{analysis.model.components.length}</strong>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted">Estudantes</p>
                  <strong className="text-xl">{analysis.model.students.length}</strong>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {analysis.model.classes.map((item) => (
                  <Chip key={item.sourceClassId} variant="soft">
                    {item.displayName}
                  </Chip>
                ))}
                {analysis.model.components.map((item) => (
                  <Chip key={item.sourceComponentId} variant="soft" color="accent">
                    {item.displayName}
                  </Chip>
                ))}
              </div>
              <Table variant="secondary" className="mt-5">
                <Table.ScrollContainer>
                  <Table.Content aria-label="Conteúdo da planilha importada">
                    <Table.Header>
                      <Table.Column id="student">Estudante</Table.Column>
                      <Table.Column id="grades">Campos lidos</Table.Column>
                      <Table.Column id="origin">Origem</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {analysis.model.students.slice(0, 500).map((student) => {
                        const slots = slotsByStudent.get(student.sourceStudentId) ?? [];
                        return (
                          <Table.Row id={student.sourceStudentId} key={student.sourceStudentId}>
                            <Table.Cell className="font-medium">
                              <span className="block">{student.displayName}</span>
                              <span className="text-xs text-muted">
                                Nº {student.studentPosition ?? 'não identificado'}
                              </span>
                            </Table.Cell>
                            <Table.Cell>
                              <div className="flex min-w-[20rem] flex-wrap gap-1">
                                {slots.map((slot) => (
                                  <Chip key={slot.sourceGradeSlotId} size="sm" variant="soft">
                                    {slot.field}: {gradeValue(slot.sourceValue)}
                                  </Chip>
                                ))}
                              </div>
                            </Table.Cell>
                            <Table.Cell className="whitespace-nowrap text-muted">
                              {student.sourceLocator.sheetDisplayName} ·{' '}
                              {student.sourceLocator.cellAddress}
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
              {analysis.model.students.length > 500 && (
                <Alert status="warning" className="mt-4">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Visualização limitada</Alert.Title>
                    <Alert.Description>
                      A análise contém mais de 500 estudantes. O lote está preservado, mas esta tela
                      mostra os 500 primeiros.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </>
          )}
        </Surface>
      )}

      {!selectedJob && !loading && (
        <Surface className="bn-card mt-5 text-center">
          <FileSpreadsheet className="mx-auto size-8 text-muted" />
          <p className="mt-3 text-sm text-muted">
            Selecione um upload recente para conferir o conteúdo lido.
          </p>
        </Surface>
      )}
    </main>
  );
}
