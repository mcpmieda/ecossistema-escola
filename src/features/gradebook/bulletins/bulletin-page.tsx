import { useRef, useState } from 'react';
import { Alert, Button, Card, Label, Spinner, Surface } from '@heroui/react';
import {
  BULLETIN_CONTRACT_VERSION_V1,
  BULLETIN_MODEL_KINDS_V1,
  type BulletinBatchEmissionResultV1,
  type BulletinComparedGradeValueV1,
  type BulletinEmissionRequestV1,
  type BulletinModelKindV1,
  type BulletinModelV1,
  type BulletinPeriodV1,
  type BulletinSnapshotV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-contract-v1';
import type {
  BulletinAcademicYearOptionV1,
  BulletinClassGroupOptionV1,
  BulletinSnapshotHistoryItemV1,
  BulletinStudentOptionV1,
} from '../../../../shared/gradebook-contracts/bulletins/bulletin-transport-v1';
import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import { BulletinClientErrorV1, requestBulletinWorkspaceV1 } from './bulletin-client';

type ViewState = 'idle' | 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type PeriodSelection = 'term-1' | 'term-2' | 'term-3' | 'annual';
type ArtifactMode = 'preview' | 'emission' | 'reprint';

const inputClass =
  'w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-foreground/40';

function clientFailureState(error: unknown): Extract<ViewState, 'unavailable' | 'not-authorized'> {
  return error instanceof BulletinClientErrorV1 && error.code === 'not-authorized'
    ? 'not-authorized'
    : 'unavailable';
}

function periodFromSelection(value: PeriodSelection): BulletinPeriodV1 {
  if (value === 'annual') return { kind: 'annual' };
  return { kind: 'term', term: Number(value.slice(-1)) as 1 | 2 | 3 };
}

function periodLabel(period: BulletinPeriodV1): string {
  return period.kind === 'annual' ? 'Anual' : `${period.term}º trimestre`;
}

function modelLabel(model: BulletinModelKindV1): string {
  if (model === 'synthetic') return 'Sintético';
  if (model === 'composition') return 'Composição';
  return 'Detalhado';
}

function gradeValueLabel(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
      return '0 — zero oficial';
    case 'legacy-zero':
      return '0 — zero legado';
    case 'absent':
      return 'Ausente';
    case 'not-applicable':
      return value.reason ? `Não aplicável — ${value.reason}` : 'Não aplicável';
    case 'insufficient-data':
      return `Dados insuficientes — ${value.reason}`;
  }
}

function ComparedGrade({ value }: { value: BulletinComparedGradeValueV1 }) {
  return (
    <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-lg border border-border/70 p-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Importado</dt>
        <dd className="mt-1 font-medium">{gradeValueLabel(value.imported)}</dd>
      </div>
      <div className="rounded-lg border border-border/70 p-2">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted">Calculado</dt>
        <dd className="mt-1 font-medium">{gradeValueLabel(value.calculated)}</dd>
      </div>
    </dl>
  );
}

function Coverage({ state, resolved, expected }: { state: string; resolved: number; expected: number }) {
  return (
    <p className="text-xs text-muted">
      Cobertura: <span className="font-medium text-foreground">{state}</span> · {resolved}/{expected} itens resolvidos
    </p>
  );
}

function BulletinModelPreview({ model }: { model: BulletinModelV1 }) {
  return (
    <div className="grid gap-4" data-bulletin-model-kind={model.modelKind}>
      <div className="grid gap-2 rounded-2xl border border-border p-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-xs text-muted">Aluno</p><p className="font-medium">{model.student.displayName}</p></div>
        <div><p className="text-xs text-muted">Turma</p><p className="font-medium">{model.classGroup.code}</p></div>
        <div><p className="text-xs text-muted">Período</p><p className="font-medium">{periodLabel(model.period)}</p></div>
        <div><p className="text-xs text-muted">Modelo</p><p className="font-medium">{modelLabel(model.modelKind)}</p></div>
      </div>

      <p className="text-sm">Autoridade acadêmica: <strong>{model.authorityMode}</strong></p>

      {model.modelKind === 'synthetic' && model.subjects.map(({ subject, result }) => (
        <Card key={subject.teachingAssignmentId}>
          <Card.Header><Card.Title>{subject.displayName}</Card.Title></Card.Header>
          <Card.Content className="grid gap-3">
            {result.kind === 'term' ? (
              <>
                <div><p className="mb-1 text-sm font-medium">Nota oficial</p><ComparedGrade value={result.officialGrade} /></div>
                <div><p className="mb-1 text-sm font-medium">Percentual</p><ComparedGrade value={result.percentage} /></div>
              </>
            ) : (
              <>
                <div><p className="mb-1 text-sm font-medium">Total original</p><ComparedGrade value={result.originalTotal} /></div>
                <div><p className="mb-1 text-sm font-medium">Total pós-recuperação</p><ComparedGrade value={result.postRecoveryTotal} /></div>
                <p className="text-sm">Decisão final: <strong>{JSON.stringify(result.finalDecision)}</strong></p>
              </>
            )}
            <Coverage state={result.coverage.state} resolved={result.coverage.resolvedItemCount} expected={result.coverage.expectedItemCount} />
          </Card.Content>
        </Card>
      ))}

      {model.modelKind !== 'synthetic' && model.subjects.map(({ subject, terms, annualResult }) => (
        <Card key={subject.teachingAssignmentId}>
          <Card.Header><Card.Title>{subject.displayName}</Card.Title></Card.Header>
          <Card.Content className="grid gap-4">
            {terms.map((term) => (
              <Surface key={term.termResultId} variant="secondary" className="rounded-xl p-4">
                <h4 className="font-medium">{term.term}º trimestre</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div><p className="mb-1 text-sm font-medium">Quantitativo considerado</p><ComparedGrade value={term.quantitative.considered} /></div>
                  <div><p className="mb-1 text-sm font-medium">Qualitativo operacional</p><ComparedGrade value={term.qualitativeOperational} /></div>
                  <div><p className="mb-1 text-sm font-medium">Nota oficial</p><ComparedGrade value={term.officialGrade} /></div>
                  <div><p className="mb-1 text-sm font-medium">Percentual</p><ComparedGrade value={term.percentage} /></div>
                </div>
                {'assessments' in term && (
                  <div className="mt-4 grid gap-2">
                    <h5 className="text-sm font-medium">Avaliações</h5>
                    {term.assessments.length === 0 ? (
                      <p className="text-sm text-muted">Nenhuma avaliação no modelo canônico.</p>
                    ) : term.assessments.map((assessment) => (
                      <div key={assessment.gradeEntryId} className="rounded-lg border border-border/70 p-3">
                        <p className="font-medium">{assessment.name}</p>
                        <p className="mb-2 text-xs text-muted">{assessment.type} · aplicabilidade: {assessment.applicability.state}</p>
                        <ComparedGrade value={assessment.value} />
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3"><Coverage state={term.coverage.state} resolved={term.coverage.resolvedItemCount} expected={term.coverage.expectedItemCount} /></div>
              </Surface>
            ))}
            {annualResult && (
              <Surface variant="secondary" className="rounded-xl p-4">
                <h4 className="font-medium">Resultado anual</h4>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <div><p className="mb-1 text-sm font-medium">Total original</p><ComparedGrade value={annualResult.originalTotal} /></div>
                  <div><p className="mb-1 text-sm font-medium">Total pós-recuperação</p><ComparedGrade value={annualResult.postRecoveryTotal} /></div>
                </div>
                <p className="mt-3 text-sm">Decisão final: <strong>{JSON.stringify(annualResult.finalDecision)}</strong></p>
                <div className="mt-2"><Coverage state={annualResult.coverage.state} resolved={annualResult.coverage.resolvedItemCount} expected={annualResult.coverage.expectedItemCount} /></div>
              </Surface>
            )}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function StateAlert({ state }: { state: Extract<ViewState, 'empty' | 'unavailable' | 'not-authorized'> }) {
  if (state === 'not-authorized') {
    return <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Title>Acesso não autorizado</Alert.Title><Alert.Description>Sua sessão não possui a autorização administrativa necessária para Boletins.</Alert.Description></Alert.Content></Alert>;
  }
  if (state === 'unavailable') {
    return <Alert status="danger"><Alert.Indicator /><Alert.Content><Alert.Title>Boletins indisponíveis</Alert.Title><Alert.Description>A experiência permanece fechada quando o runtime acadêmico local/preview não está disponível.</Alert.Description></Alert.Content></Alert>;
  }
  return <Alert status="default"><Alert.Indicator /><Alert.Content><Alert.Title>Nenhum item disponível</Alert.Title><Alert.Description>A seleção atual não possui dados para esta etapa.</Alert.Description></Alert.Content></Alert>;
}

function emissionRequest(
  academicYearId: BulletinAcademicYearOptionV1['id'],
  classGroupId: BulletinClassGroupOptionV1['id'],
  student: BulletinStudentOptionV1,
  period: BulletinPeriodV1,
  model: BulletinModelKindV1,
): BulletinEmissionRequestV1 {
  return {
    contractVersion: BULLETIN_CONTRACT_VERSION_V1,
    academicYearId,
    period,
    target: {
      kind: 'student',
      classGroupId,
      studentId: student.studentId,
      enrollmentId: student.enrollmentId,
    },
    model,
    presentation: { locale: 'pt-BR', dateStyle: 'short' },
  };
}

export function BulletinPage() {
  const [workspaceState, setWorkspaceState] = useState<ViewState>('idle');
  const [years, setYears] = useState<readonly BulletinAcademicYearOptionV1[]>([]);
  const [yearId, setYearId] = useState<BulletinAcademicYearOptionV1['id'] | null>(null);
  const [classState, setClassState] = useState<ViewState>('idle');
  const [classGroups, setClassGroups] = useState<readonly BulletinClassGroupOptionV1[]>([]);
  const [classGroupId, setClassGroupId] = useState<BulletinClassGroupOptionV1['id'] | null>(null);
  const [studentState, setStudentState] = useState<ViewState>('idle');
  const [students, setStudents] = useState<readonly BulletinStudentOptionV1[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<readonly string[]>([]);
  const [previewStudentId, setPreviewStudentId] = useState('');
  const [periodSelection, setPeriodSelection] = useState<PeriodSelection>('term-1');
  const [modelKind, setModelKind] = useState<BulletinModelKindV1>('synthetic');
  const [artifactState, setArtifactState] = useState<ViewState>('idle');
  const [artifactMode, setArtifactMode] = useState<ArtifactMode>('preview');
  const [previewModel, setPreviewModel] = useState<BulletinModelV1 | null>(null);
  const [snapshot, setSnapshot] = useState<BulletinSnapshotV1 | null>(null);
  const [artifactNotice, setArtifactNotice] = useState<string | null>(null);
  const [batchState, setBatchState] = useState<ViewState>('idle');
  const [batch, setBatch] = useState<BulletinBatchEmissionResultV1 | null>(null);
  const [historyState, setHistoryState] = useState<ViewState>('idle');
  const [history, setHistory] = useState<readonly BulletinSnapshotHistoryItemV1[]>([]);
  const artifactHeadingRef = useRef<HTMLHeadingElement>(null);
  const sequence = useRef(0);

  const focusArtifact = () => window.requestAnimationFrame(() => artifactHeadingRef.current?.focus());

  const bootstrap = async () => {
    setWorkspaceState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({ contractVersion: BULLETIN_CONTRACT_VERSION_V1, operation: 'bootstrap' });
      if (response.operation !== 'bootstrap') return;
      if (response.state === 'ready') {
        setYears(response.academicYears);
        setWorkspaceState('ready');
      } else {
        setYears([]);
        setWorkspaceState(response.state);
      }
    } catch (error) {
      setWorkspaceState(clientFailureState(error));
    }
  };

  const loadClassGroups = async (academicYearId: BulletinAcademicYearOptionV1['id']) => {
    const ticket = ++sequence.current;
    setClassState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({ contractVersion: BULLETIN_CONTRACT_VERSION_V1, operation: 'class-groups', academicYearId });
      if (ticket !== sequence.current || response.operation !== 'class-groups') return;
      if (response.state === 'ready') {
        setClassGroups(response.classGroups);
        setClassState('ready');
      } else {
        setClassGroups([]);
        setClassState(response.state);
      }
    } catch (error) {
      if (ticket === sequence.current) setClassState(clientFailureState(error));
    }
  };

  const loadStudents = async (academicYearId: BulletinAcademicYearOptionV1['id'], selectedClassGroupId: BulletinClassGroupOptionV1['id']) => {
    const ticket = ++sequence.current;
    setStudentState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({ contractVersion: BULLETIN_CONTRACT_VERSION_V1, operation: 'students', academicYearId, classGroupId: selectedClassGroupId });
      if (ticket !== sequence.current || response.operation !== 'students') return;
      if (response.state === 'ready') {
        setStudents(response.students);
        setStudentState('ready');
      } else {
        setStudents([]);
        setStudentState(response.state);
      }
    } catch (error) {
      if (ticket === sequence.current) setStudentState(clientFailureState(error));
    }
  };

  const loadHistory = async () => {
    if (!yearId || !classGroupId) return;
    setHistoryState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'history',
        academicYearId: yearId,
        classGroupId,
        ...(selectedStudentIds.length === 0 ? {} : { studentIds: selectedStudentIds as BulletinStudentOptionV1['studentId'][] }),
      });
      if (response.operation !== 'history') return;
      if (response.state === 'ready') {
        setHistory(response.items);
        setHistoryState('ready');
      } else {
        setHistory([]);
        setHistoryState(response.state);
      }
    } catch (error) {
      setHistoryState(clientFailureState(error));
    }
  };

  const selectedStudents = students.filter((student) => selectedStudentIds.includes(student.studentId));
  const previewStudent = selectedStudents.find((student) => student.studentId === previewStudentId) ?? selectedStudents[0] ?? null;

  const runPreview = async () => {
    if (!yearId || !classGroupId || !previewStudent) return;
    setArtifactState('loading');
    setArtifactNotice(null);
    setSnapshot(null);
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'preview',
        request: emissionRequest(yearId, classGroupId, previewStudent, periodFromSelection(periodSelection), modelKind),
      });
      if (response.operation !== 'preview' || response.state !== 'ready') {
        setArtifactState(response.state);
        return;
      }
      if (response.preview.status === 'ready') {
        setPreviewModel(response.preview.model);
        setArtifactMode('preview');
        setArtifactState('ready');
        setArtifactNotice(`Prévia canônica · dataVersion ${response.preview.dataVersion}`);
        focusArtifact();
      } else {
        setPreviewModel(null);
        setArtifactState('empty');
        setArtifactNotice(`${response.preview.status}: ${response.preview.reasons.join(', ')}`);
      }
    } catch (error) {
      setArtifactState(clientFailureState(error));
    }
  };

  const emitOne = async () => {
    if (!yearId || !classGroupId || !previewStudent) return;
    setArtifactState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'emit',
        request: emissionRequest(yearId, classGroupId, previewStudent, periodFromSelection(periodSelection), modelKind),
      });
      if (response.operation !== 'emit' || response.state !== 'ready') {
        setArtifactState(response.state);
        return;
      }
      if (response.emission.status === 'ready') {
        setSnapshot(response.emission.snapshot);
        setPreviewModel(null);
        setArtifactMode('emission');
        setArtifactState('ready');
        setArtifactNotice(`Snapshot ${response.emission.snapshot.snapshotId} · versão ${response.emission.snapshot.snapshotVersion}`);
        focusArtifact();
        void loadHistory();
      } else {
        setArtifactState('empty');
        setArtifactNotice(`${response.emission.status}: ${response.emission.reasons.join(', ')}`);
      }
    } catch (error) {
      setArtifactState(clientFailureState(error));
    }
  };

  const emitBatch = async () => {
    if (!yearId || !classGroupId || selectedStudents.length === 0) return;
    const items = selectedStudents.map((student) => emissionRequest(yearId, classGroupId, student, periodFromSelection(periodSelection), modelKind));
    const first = items[0];
    if (!first) return;
    setBatchState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'emit-batch',
        request: { contractVersion: BULLETIN_CONTRACT_VERSION_V1, items: [first, ...items.slice(1)] },
      });
      if (response.operation !== 'emit-batch' || response.state !== 'ready') {
        setBatchState(response.state);
        return;
      }
      setBatch(response.batch);
      setBatchState('ready');
      void loadHistory();
    } catch (error) {
      setBatchState(clientFailureState(error));
    }
  };

  const reprint = async (item: BulletinSnapshotHistoryItemV1) => {
    setArtifactState('loading');
    try {
      const response = await requestBulletinWorkspaceV1({
        contractVersion: BULLETIN_CONTRACT_VERSION_V1,
        operation: 'reprint',
        request: { contractVersion: BULLETIN_CONTRACT_VERSION_V1, snapshotId: item.snapshotId, snapshotVersion: item.snapshotVersion },
      });
      if (response.operation !== 'reprint' || response.state !== 'ready') {
        setArtifactState(response.state);
        return;
      }
      if (response.reprint.status === 'ready') {
        setSnapshot(response.reprint.snapshot);
        setPreviewModel(null);
        setArtifactMode('reprint');
        setArtifactState('ready');
        setArtifactNotice(`Reimpressão histórica · snapshot ${item.snapshotId} · versão ${item.snapshotVersion}`);
        focusArtifact();
      } else {
        setArtifactState('empty');
        setArtifactNotice(response.reprint.reasons.join(', '));
      }
    } catch (error) {
      setArtifactState(clientFailureState(error));
    }
  };

  return (
    <Surface variant="default" className="mt-6 rounded-[2rem] border border-border/70 p-5 shadow-sm sm:p-7" aria-busy={[workspaceState, classState, studentState, artifactState, batchState, historyState].includes('loading')}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">Banco de Notas · Boletins</p>
          <h2 className="mt-1 text-2xl font-semibold">Seleção → prévia → emissão → histórico</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">A prévia renderiza diretamente o BulletinModelV1 canônico. Emissão e lote usam o mesmo materializador; reimpressão usa exclusivamente o snapshot histórico.</p>
        </div>
        {workspaceState === 'idle' && <Button variant="primary" onPress={() => void bootstrap()} className="focus-visible:ring-2">Abrir Boletins</Button>}
      </div>

      <div className="sr-only" aria-live="polite" role="status">Estado dos Boletins: {workspaceState}; prévia/emissão: {artifactState}; lote: {batchState}; histórico: {historyState}.</div>

      {workspaceState === 'loading' && <div className="mt-6 flex items-center gap-2"><Spinner size="sm" /><span>Carregando anos disponíveis…</span></div>}
      {(workspaceState === 'empty' || workspaceState === 'unavailable' || workspaceState === 'not-authorized') && <div className="mt-6"><StateAlert state={workspaceState} /></div>}

      {workspaceState === 'ready' && (
        <div className="mt-6 grid gap-6">
          <Card>
            <Card.Header><Card.Title>1. Seleção explícita</Card.Title></Card.Header>
            <Card.Content className="grid gap-4 lg:grid-cols-3">
              <div>
                <Label htmlFor="bulletin-year" className="mb-1.5 block text-sm font-medium">Ano letivo</Label>
                <select id="bulletin-year" className={inputClass} value={yearId ?? ''} onChange={(event) => {
                  sequence.current += 1;
                  const value = event.currentTarget.value;
                  setYearId(value ? value as BulletinAcademicYearOptionV1['id'] : null);
                  setClassGroupId(null); setClassGroups([]); setStudents([]); setSelectedStudentIds([]); setPreviewStudentId(''); setHistory([]); setArtifactState('idle');
                  if (value) void loadClassGroups(value as BulletinAcademicYearOptionV1['id']); else setClassState('idle');
                }}>
                  <option value="">Selecione o ano</option>
                  {years.map((year) => <option key={year.id} value={year.id}>{year.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-muted">O sistema não escolhe o ano automaticamente.</p>
              </div>
              <div>
                <Label htmlFor="bulletin-class" className="mb-1.5 block text-sm font-medium">Turma</Label>
                <select id="bulletin-class" className={inputClass} disabled={!yearId || classState === 'loading'} value={classGroupId ?? ''} onChange={(event) => {
                  sequence.current += 1;
                  const value = event.currentTarget.value;
                  setClassGroupId(value ? value as BulletinClassGroupOptionV1['id'] : null); setStudents([]); setSelectedStudentIds([]); setPreviewStudentId(''); setHistory([]); setArtifactState('idle');
                  if (yearId && value) { void loadStudents(yearId, value as BulletinClassGroupOptionV1['id']); } else setStudentState('idle');
                }}>
                  <option value="">Selecione a turma</option>
                  {classGroups.map((group) => <option key={group.id} value={group.id}>{group.code}</option>)}
                </select>
                {classState === 'loading' && <p className="mt-1 text-xs text-muted">Carregando turmas…</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label htmlFor="bulletin-period" className="mb-1.5 block text-sm font-medium">Período</Label><select id="bulletin-period" className={inputClass} value={periodSelection} onChange={(event) => setPeriodSelection(event.currentTarget.value as PeriodSelection)}><option value="term-1">1º trimestre</option><option value="term-2">2º trimestre</option><option value="term-3">3º trimestre</option><option value="annual">Anual</option></select></div>
                <div><Label htmlFor="bulletin-model" className="mb-1.5 block text-sm font-medium">Modelo</Label><select id="bulletin-model" className={inputClass} value={modelKind} onChange={(event) => setModelKind(event.currentTarget.value as BulletinModelKindV1)}>{BULLETIN_MODEL_KINDS_V1.map((kind) => <option key={kind} value={kind}>{modelLabel(kind)}</option>)}</select></div>
              </div>

              <div className="lg:col-span-3">
                <p className="mb-2 text-sm font-medium">Aluno(s)</p>
                {studentState === 'loading' && <div className="flex items-center gap-2 text-sm"><Spinner size="sm" />Carregando alunos…</div>}
                {(studentState === 'empty' || studentState === 'unavailable' || studentState === 'not-authorized') && <StateAlert state={studentState} />}
                {studentState === 'ready' && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{students.map((student) => {
                  const checked = selectedStudentIds.includes(student.studentId);
                  return <label key={student.enrollmentId} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 focus-within:ring-2"><input type="checkbox" checked={checked} onChange={(event) => {
                    const next = event.currentTarget.checked ? [...selectedStudentIds, student.studentId] : selectedStudentIds.filter((id) => id !== student.studentId);
                    setSelectedStudentIds(next);
                    if (event.currentTarget.checked && !previewStudentId) setPreviewStudentId(student.studentId);
                    if (!event.currentTarget.checked && previewStudentId === student.studentId) setPreviewStudentId(next[0] ?? '');
                  }} className="mt-1 size-4" /><span><strong className="block">{student.displayName}</strong><span className="text-xs text-muted">Matrícula {student.enrollmentId} · posição {student.position}</span></span></label>;
                })}</div>}
              </div>

              <div className="lg:col-span-3">
                <Label htmlFor="bulletin-preview-student" className="mb-1.5 block text-sm font-medium">Aluno da prévia/emissão individual</Label>
                <select id="bulletin-preview-student" className={inputClass} disabled={selectedStudents.length === 0} value={previewStudent?.studentId ?? ''} onChange={(event) => setPreviewStudentId(event.currentTarget.value)}><option value="">Selecione ao menos um aluno</option>{selectedStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select>
              </div>
            </Card.Content>
          </Card>

          <div className="flex flex-wrap gap-3">
            <Button variant="primary" isDisabled={!previewStudent || artifactState === 'loading'} onPress={() => void runPreview()} className="focus-visible:ring-2">{artifactState === 'loading' && <Spinner size="sm" />}Gerar prévia</Button>
            <Button variant="secondary" isDisabled={!previewStudent || artifactState === 'loading'} onPress={() => void emitOne()} className="focus-visible:ring-2">Emitir individual</Button>
            <Button variant="secondary" isDisabled={selectedStudents.length === 0 || batchState === 'loading'} onPress={() => void emitBatch()} className="focus-visible:ring-2">{batchState === 'loading' && <Spinner size="sm" />}Emitir lote ({selectedStudents.length})</Button>
            <Button variant="tertiary" isDisabled={!yearId || !classGroupId || historyState === 'loading'} onPress={() => void loadHistory()} className="focus-visible:ring-2">Atualizar histórico</Button>
          </div>

          {(artifactState === 'empty' || artifactState === 'unavailable' || artifactState === 'not-authorized') && <StateAlert state={artifactState} />}
          {artifactNotice && <p className="text-sm" role="status">{artifactNotice}</p>}
          {artifactState === 'ready' && (previewModel || snapshot) && (
            <section aria-labelledby="bulletin-artifact-heading">
              <h3 id="bulletin-artifact-heading" ref={artifactHeadingRef} tabIndex={-1} className="mb-3 text-xl font-semibold outline-none focus-visible:ring-2">{artifactMode === 'preview' ? 'Prévia' : artifactMode === 'emission' ? 'Emissão' : 'Reimpressão'}</h3>
              {snapshot && <p className="mb-3 text-sm">Snapshot <strong>{snapshot.snapshotId}</strong> · versão <strong>{snapshot.snapshotVersion}</strong> · modelVersion {snapshot.modelVersion}</p>}
              <BulletinModelPreview model={snapshot?.model ?? previewModel!} />
            </section>
          )}

          <Card>
            <Card.Header><Card.Title>2. Resultado do lote</Card.Title></Card.Header>
            <Card.Content>
              {batchState === 'idle' && <p className="text-sm text-muted">Nenhum lote emitido nesta sessão.</p>}
              {batchState === 'loading' && <div className="flex items-center gap-2"><Spinner size="sm" />Emitindo lote agregado…</div>}
              {(batchState === 'unavailable' || batchState === 'not-authorized' || batchState === 'empty') && <StateAlert state={batchState} />}
              {batchState === 'ready' && batch && <div className="grid gap-3"><p className="text-sm"><strong>{batch.ready.length}</strong> emissão(ões) pronta(s); <strong>{batch.blocked.length}</strong> bloqueada(s)/insuficiente(s). Cada aluno conserva seu próprio resultado.</p>{batch.ready.map(({ requestIndex, emission }) => <div key={`${requestIndex}:${emission.snapshot.snapshotId}:${emission.snapshot.snapshotVersion}`} className="rounded-xl border border-border p-3 text-sm">Pronto · item {requestIndex + 1} · {emission.snapshot.model.student.displayName} · snapshot {emission.snapshot.snapshotId} v{emission.snapshot.snapshotVersion}</div>)}{batch.blocked.map(({ requestIndex, emission }, index) => <div key={`${requestIndex}:blocked:${index}`} className="rounded-xl border border-border p-3 text-sm">{emission.status} · item {requestIndex + 1} · {emission.reasons.join(', ')}</div>)}</div>}
            </Card.Content>
          </Card>

          <Card>
            <Card.Header><Card.Title>3. Histórico local/preview</Card.Title></Card.Header>
            <Card.Content className="grid gap-3">
              <p className="text-sm text-muted">Registry descartável deste ciclo local/preview. Não há garantia de durabilidade entre restarts ou isolates.</p>
              {historyState === 'loading' && <div className="flex items-center gap-2"><Spinner size="sm" />Carregando snapshots…</div>}
              {(historyState === 'empty' || historyState === 'unavailable' || historyState === 'not-authorized') && <StateAlert state={historyState} />}
              {historyState === 'ready' && history.map((item) => <div key={`${item.snapshotId}:${item.snapshotVersion}`} className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-medium">{item.studentDisplayName} · {modelLabel(item.modelKind)} · {periodLabel(item.period)}</p><p className="text-xs text-muted">Snapshot {item.snapshotId} · versão {item.snapshotVersion} · modelVersion {item.modelVersion} · {item.emittedAt}</p></div><Button size="sm" variant="secondary" onPress={() => void reprint(item)} className="focus-visible:ring-2">Reimprimir esta versão</Button></div>)}
            </Card.Content>
          </Card>

          <Alert status="warning"><Alert.Indicator /><Alert.Content><Alert.Title>Limite de PDF</Alert.Title><Alert.Description>PDF/renderização pendente por decisão arquitetural. Não existe renderer/biblioteca/runtime aprovado no projeto; nenhum segundo motor de template foi criado.</Alert.Description></Alert.Content></Alert>
        </div>
      )}
    </Surface>
  );
}
