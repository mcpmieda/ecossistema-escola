import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, Spinner, Surface } from '@heroui/react';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  History,
  Save,
  Scale,
  UserRoundCheck,
  UsersRound,
  XCircle,
} from 'lucide-react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import {
  COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
  type CouncilClassReferenceV1,
  type CouncilDecisionSelectionV1,
  type CouncilOfficialPeriodResultV1,
  type CouncilQueueItemV1,
  type CouncilQueueRequestV1,
  type CouncilQueueStateV1,
  type CouncilStudentDetailV1,
  type CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import type { AcademicGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  CouncilWorkspaceClientErrorV1,
  requestCouncilDecisionV1,
  requestCouncilQueueV1,
  requestCouncilStudentV1,
} from './council-workspace-client';

export interface CouncilWorkspacePageProps {
  readonly academicYearId: AcademicYearId;
  readonly classReference: CouncilClassReferenceV1;
  readonly classLabel: string;
}

type ViewState = 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';
type DecisionChoice = CouncilDecisionSelectionV1['outcome'];

const STATE_LABELS: Record<CouncilQueueStateV1, string> = {
  'follows-official-annual-result': 'Segue resultado anual oficial',
  'eligible-for-council': 'Elegível para Conselho',
  'not-eligible-for-council': 'Não elegível para Conselho',
  'insufficient-data': 'Dados insuficientes',
};

const APPROVED_DECISION = {
  outcome: 'approved',
  resultingState: 'approved-by-council',
} as const satisfies CouncilDecisionSelectionV1;
const FAILED_DECISION = {
  outcome: 'failed',
  resultingState: 'failed-by-council-decision',
} as const satisfies CouncilDecisionSelectionV1;

function gradeValueLabel(value: AcademicGradeValueV1): string {
  switch (value.state) {
    case 'numeric':
      return String(value.value);
    case 'official-zero':
      return '0 (zero oficial)';
    case 'legacy-zero':
      return '0 (zero legado)';
    case 'absent':
      return 'Não lançada';
    case 'not-applicable':
      return 'Não aplicável';
    case 'insufficient-data':
      return 'Dados insuficientes';
  }
}

function clientState(error: unknown): Extract<ViewState, 'unavailable' | 'not-authorized'> {
  return error instanceof CouncilWorkspaceClientErrorV1 && error.code === 'not-authorized'
    ? 'not-authorized'
    : 'unavailable';
}

function QueueStateChip({ state }: { state: CouncilQueueStateV1 }) {
  const Icon =
    state === 'eligible-for-council'
      ? UserRoundCheck
      : state === 'not-eligible-for-council'
        ? XCircle
        : state === 'insufficient-data'
          ? AlertTriangle
          : CheckCircle2;
  return (
    <Chip size="sm" variant="soft">
      <Icon className="mr-1 size-3.5" aria-hidden="true" />
      {STATE_LABELS[state]}
    </Chip>
  );
}

function PeriodResult({ result }: { result: CouncilOfficialPeriodResultV1 }) {
  return (
    <Surface variant="secondary" className="min-w-0 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-sm">{result.period}</strong>
        <Chip size="sm" variant="soft">
          {result.coverage.state}
        </Chip>
      </div>
      <p className="mt-2 text-lg font-semibold">{gradeValueLabel(result.value)}</p>
      <p className="mt-1 text-xs text-muted">
        {result.evidence.length} evidência{result.evidence.length === 1 ? '' : 's'} oficial
        {result.evidence.length === 1 ? '' : 'is'}
      </p>
    </Surface>
  );
}

function AnnualOverview({ detail }: { detail: CouncilStudentDetailV1 }) {
  return (
    <section aria-labelledby="council-annual-overview-heading" className="grid gap-3">
      <div>
        <h3 id="council-annual-overview-heading" className="text-base font-semibold">
          Visão anual — T1, T2, T3 e REC
        </h3>
        <p className="mt-1 text-sm text-muted">
          Resultados oficiais já resolvidos. Esta tela não recalcula nota, recuperação ou elegibilidade.
        </p>
      </div>
      {detail.annualView.length === 0 ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Sem visão anual suficiente</Alert.Title>
            <Alert.Description>
              A fonte oficial não forneceu componentes anuais resolvidos para este aluno.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : (
        <div className="grid gap-3">
          {detail.annualView.map((component) => (
            <Card key={component.componentReference}>
              <Card.Header className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Card.Title className="truncate">{component.componentLabel}</Card.Title>
                  <Card.Description>
                    Estado anual oficial: {component.annualState.replaceAll('-', ' ')}
                  </Card.Description>
                </div>
                <Chip size="sm" variant="soft">
                  Cobertura {component.annualCoverage.state}
                </Chip>
              </Card.Header>
              <Card.Content>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {component.periods.map((period) => (
                    <PeriodResult key={`${component.componentReference}:${period.period}`} result={period} />
                  ))}
                </div>
              </Card.Content>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceDetails({ detail }: { detail: CouncilStudentDetailV1 }) {
  const evidence = detail.annualView.flatMap((component) =>
    component.periods.flatMap((period) =>
      period.evidence.map((item) => ({
        key: `${component.componentReference}:${period.period}:${item.reference}`,
        component: component.componentLabel,
        period: period.period,
        ...item,
      })),
    ),
  );
  return (
    <section aria-labelledby="council-evidence-heading" className="grid gap-3">
      <div>
        <h3 id="council-evidence-heading" className="text-base font-semibold">
          Evidências oficiais
        </h3>
        <p className="mt-1 text-sm text-muted">Referências opacas fornecidas pela fonte oficial.</p>
      </div>
      {evidence.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma referência de evidência foi projetada.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {evidence.map((item) => (
            <li key={item.key}>
              <Surface variant="secondary" className="rounded-xl p-3">
                <p className="text-sm font-medium">{item.component} · {item.period}</p>
                <p className="mt-1 text-sm">{item.label}</p>
                <p className="mt-1 break-all text-xs text-muted">Ref. {item.reference}</p>
              </Surface>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DecisionHistory({ detail }: { detail: CouncilStudentDetailV1 }) {
  return (
    <section aria-labelledby="council-history-heading" className="grid gap-3">
      <div className="flex items-center gap-2">
        <History className="size-4" aria-hidden="true" />
        <h3 id="council-history-heading" className="text-base font-semibold">Histórico versionado</h3>
      </div>
      {detail.history.length === 0 ? (
        <p className="text-sm text-muted">Nenhuma decisão humana foi registrada.</p>
      ) : (
        <ol className="grid gap-2">
          {[...detail.history].reverse().map((entry) => (
            <li key={entry.decisionReference}>
              <Surface variant="secondary" className="rounded-xl p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">
                    Versão {entry.version} · {entry.decision.outcome === 'approved' ? 'Aprovado pelo Conselho' : 'Não aprovado pelo Conselho'}
                  </strong>
                  <span className="text-xs text-muted">{entry.decidedAt}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{entry.justification}</p>
                <p className="mt-2 break-all text-xs text-muted">Ator: {entry.actorReference}</p>
              </Surface>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function WorkspaceFailure({ state }: { state: Extract<ViewState, 'empty' | 'unavailable' | 'not-authorized'> }) {
  if (state === 'not-authorized') {
    return (
      <Alert status="warning">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Acesso não autorizado</Alert.Title>
          <Alert.Description>Sua sessão não possui autorização para operar o Conselho.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  if (state === 'unavailable') {
    return (
      <Alert status="danger">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Conselho indisponível neste ambiente</Alert.Title>
          <Alert.Description>
            O workspace permanece fechado quando sua fonte oficial não está composta em local/preview.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }
  return (
    <Alert status="default">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>Fila vazia</Alert.Title>
        <Alert.Description>Não há alunos projetados para esta turma no recorte atual.</Alert.Description>
      </Alert.Content>
    </Alert>
  );
}

export function CouncilWorkspacePage({
  academicYearId,
  classReference,
  classLabel,
}: CouncilWorkspacePageProps) {
  const [viewState, setViewState] = useState<ViewState>('loading');
  const [items, setItems] = useState<readonly CouncilQueueItemV1[]>([]);
  const [nextCursor, setNextCursor] = useState<CouncilQueueRequestV1['page']['cursor']>(null);
  const [detail, setDetail] = useState<CouncilStudentDetailV1 | null>(null);
  const [studentLoading, setStudentLoading] = useState(false);
  const [decisionChoice, setDecisionChoice] = useState<DecisionChoice>('approved');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);
  const [versionConflict, setVersionConflict] = useState<number | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const queueSequence = useRef(0);
  const studentSequence = useRef(0);

  const loadStudent = useCallback(
    async (studentReference: CouncilStudentReferenceV1, focusHeading = true) => {
      const sequence = ++studentSequence.current;
      setStudentLoading(true);
      setVersionConflict(null);
      try {
        const response = await requestCouncilStudentV1({
          operation: 'student',
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          classReference,
          studentReference,
        });
        if (sequence !== studentSequence.current) return;
        if (response.outcome !== 'detail') {
          setDetail(null);
          setLiveMessage('Não foi possível abrir o aluno selecionado.');
          return;
        }
        setDetail(response.detail);
        setJustification('');
        setDecisionChoice('approved');
        setLiveMessage(`Aluno ${response.detail.studentLabel} em foco.`);
        if (focusHeading) queueMicrotask(() => headingRef.current?.focus());
      } catch (error) {
        if (sequence !== studentSequence.current) return;
        setViewState(clientState(error));
        setDetail(null);
      } finally {
        if (sequence === studentSequence.current) setStudentLoading(false);
      }
    },
    [academicYearId, classReference],
  );

  const loadQueue = useCallback(
    async (cursor: CouncilQueueRequestV1['page']['cursor'], append: boolean) => {
      const sequence = ++queueSequence.current;
      if (!append) setViewState('loading');
      try {
        const response = await requestCouncilQueueV1({
          operation: 'queue',
          contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
          academicYearId,
          classReference,
          page: { limit: 30, cursor },
        });
        if (sequence !== queueSequence.current) return;
        if (response.outcome !== 'items') {
          if (!append) {
            setItems([]);
            setDetail(null);
            setViewState(response.outcome === 'no-results' ? 'empty' : 'unavailable');
          }
          setNextCursor(null);
          return;
        }
        setItems((current) => (append ? [...current, ...response.items] : response.items));
        setNextCursor(response.nextCursor);
        setViewState('ready');
        if (!append && response.items[0]) {
          await loadStudent(response.items[0].studentReference, false);
        }
      } catch (error) {
        if (sequence !== queueSequence.current) return;
        setViewState(clientState(error));
      }
    },
    [academicYearId, classReference, loadStudent],
  );

  useEffect(() => {
    queueSequence.current += 1;
    studentSequence.current += 1;
    setItems([]);
    setDetail(null);
    setNextCursor(null);
    setVersionConflict(null);
    setLiveMessage(`Carregando fila de ${classLabel}.`);
    void loadQueue(null, false);
  }, [classLabel, loadQueue]);

  async function saveDecision() {
    if (detail === null || saving) return;
    const selected = decisionChoice === 'approved' ? APPROVED_DECISION : FAILED_DECISION;
    setSaving(true);
    setVersionConflict(null);
    try {
      const response = await requestCouncilDecisionV1({
        operation: 'decision',
        contractVersion: COUNCIL_WORKSPACE_CONTRACT_VERSION_V1,
        academicYearId,
        classReference,
        studentReference: detail.studentReference,
        expectedVersion: detail.version,
        decision: selected,
        justification,
      });
      if (response.outcome === 'version-conflict') {
        setVersionConflict(response.currentVersion ?? detail.version);
        setLiveMessage('Conflito de versão. Recarregue o aluno antes de decidir novamente.');
        queueMicrotask(() => conflictRef.current?.focus());
        return;
      }
      if (response.outcome !== 'applied') {
        setLiveMessage(
          response.outcome === 'decision-unavailable'
            ? 'A decisão está indisponível para o estado calculado atual.'
            : 'A decisão não pôde ser registrada.',
        );
        return;
      }
      setDetail((current) =>
        current === null
          ? current
          : {
              ...current,
              currentDecision: response.record,
              history: [...current.history, response.record],
              version: response.version,
            },
      );
      setItems((current) =>
        current.map((item) =>
          item.studentReference === detail.studentReference
            ? { ...item, currentDecisionVersion: response.version }
            : item,
        ),
      );
      setJustification('');
      setLiveMessage(`Decisão registrada na versão ${response.version}.`);
    } catch (error) {
      setViewState(clientState(error));
      setLiveMessage('O Conselho ficou indisponível durante o registro da decisão.');
    } finally {
      setSaving(false);
    }
  }

  if (viewState === 'loading') {
    return (
      <Surface className="grid min-h-64 place-items-center rounded-3xl p-6" aria-busy="true">
        <div className="grid justify-items-center gap-3 text-center">
          <Spinner size="lg" />
          <p className="text-sm text-muted">Carregando fila do Conselho…</p>
        </div>
      </Surface>
    );
  }

  if (viewState !== 'ready') return <WorkspaceFailure state={viewState} />;

  return (
    <div className="grid gap-4">
      <div role="status" aria-live="polite" className="sr-only">{liveMessage}</div>
      <Surface className="rounded-3xl p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted">
              <UsersRound className="size-4" aria-hidden="true" />
              Conselho de Classe
            </div>
            <h2 className="mt-1 text-xl font-semibold">{classLabel}</h2>
            <p className="mt-1 text-sm text-muted">Ano acadêmico: {academicYearId}</p>
          </div>
          <Chip variant="soft">Decisão humana separada do cálculo</Chip>
        </div>
      </Surface>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(15rem,0.34fr)_minmax(0,1fr)]">
        <Card className="min-w-0 self-start">
          <Card.Header>
            <Card.Title>Fila da turma</Card.Title>
            <Card.Description>{items.length} aluno(s) carregado(s)</Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="grid gap-2" aria-label="Fila de alunos do Conselho">
              {items.map((item) => (
                <li key={item.studentReference}>
                  <Button
                    variant={detail?.studentReference === item.studentReference ? 'secondary' : 'ghost'}
                    className="h-auto w-full justify-start whitespace-normal px-3 py-3 text-left"
                    aria-current={detail?.studentReference === item.studentReference ? 'true' : undefined}
                    onPress={() => void loadStudent(item.studentReference)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{item.studentLabel}</span>
                      <span className="mt-1 block text-xs text-muted">{item.calculated.reason}</span>
                      <span className="mt-2 inline-flex"><QueueStateChip state={item.calculated.queueState} /></span>
                    </span>
                    <span className="ml-2 shrink-0 text-xs text-muted">v{item.currentDecisionVersion}</span>
                  </Button>
                </li>
              ))}
            </ul>
            {nextCursor !== null && (
              <div className="mt-3 flex justify-center">
                <Button size="sm" variant="outline" onPress={() => void loadQueue(nextCursor, true)}>
                  Carregar mais
                </Button>
              </div>
            )}
          </Card.Content>
        </Card>

        <div className="min-w-0">
          {studentLoading ? (
            <Surface className="grid min-h-64 place-items-center rounded-3xl" aria-busy="true">
              <Spinner />
            </Surface>
          ) : detail === null ? (
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Selecione um aluno</Alert.Title>
                <Alert.Description>A fila mantém o aluno principal em foco sem abrir detalhes em lote.</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <div className="grid gap-4">
              <Card>
                <Card.Header className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <Card.Title>
                      <h2 ref={headingRef} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-focus">
                        {detail.studentLabel}
                      </h2>
                    </Card.Title>
                    <Card.Description>{detail.calculated.reason}</Card.Description>
                  </div>
                  <QueueStateChip state={detail.calculated.queueState} />
                </Card.Header>
                <Card.Content className="grid gap-3 sm:grid-cols-3">
                  <Surface variant="secondary" className="rounded-xl p-3">
                    <p className="text-xs text-muted">Estado anual oficial</p>
                    <p className="mt-1 text-sm font-semibold">{detail.calculated.officialAnnualState.replaceAll('-', ' ')}</p>
                  </Surface>
                  <Surface variant="secondary" className="rounded-xl p-3">
                    <p className="text-xs text-muted">Componentes não aprovados</p>
                    <p className="mt-1 text-sm font-semibold">{detail.calculated.failedComponentCount ?? 'Não concluído'}</p>
                  </Surface>
                  <Surface variant="secondary" className="rounded-xl p-3">
                    <p className="text-xs text-muted">Cobertura oficial</p>
                    <p className="mt-1 text-sm font-semibold">{detail.calculated.coverage.state}</p>
                  </Surface>
                </Card.Content>
              </Card>

              <AnnualOverview detail={detail} />
              <EvidenceDetails detail={detail} />

              <Card>
                <Card.Header>
                  <div className="flex items-center gap-2">
                    <Scale className="size-4" aria-hidden="true" />
                    <Card.Title>Decisão humana</Card.Title>
                  </div>
                  <Card.Description>
                    Só existe depois de registro explícito. Versão atual: {detail.version}.
                  </Card.Description>
                </Card.Header>
                <Card.Content className="grid gap-4">
                  {detail.calculated.queueState !== 'eligible-for-council' ? (
                    <Alert status="warning">
                      <Alert.Indicator />
                      <Alert.Content>
                        <Alert.Title>Decisão indisponível</Alert.Title>
                        <Alert.Description>
                          O estado oficial projetado não habilita decisão de Conselho nesta V1.
                        </Alert.Description>
                      </Alert.Content>
                    </Alert>
                  ) : (
                    <>
                      {detail.currentDecision && (
                        <Alert status="default">
                          <Alert.Indicator />
                          <Alert.Content>
                            <Alert.Title>Já existe decisão registrada</Alert.Title>
                            <Alert.Description>
                              Uma edição cria nova versão e exige nova justificativa; o histórico anterior é preservado.
                            </Alert.Description>
                          </Alert.Content>
                        </Alert>
                      )}
                      {versionConflict !== null && (
                        <div ref={conflictRef} tabIndex={-1} className="outline-none focus-visible:ring-2 focus-visible:ring-focus">
                          <Alert status="danger">
                            <Alert.Indicator />
                            <Alert.Content>
                              <Alert.Title>Conflito de versão</Alert.Title>
                              <Alert.Description>
                                Outra alteração chegou primeiro. Versão atual informada: {versionConflict}.
                              </Alert.Description>
                              <div className="mt-3">
                                <Button size="sm" variant="outline" onPress={() => void loadStudent(detail.studentReference, false)}>
                                  Recarregar antes de editar
                                </Button>
                              </div>
                            </Alert.Content>
                          </Alert>
                        </div>
                      )}
                      <div className="grid gap-2 sm:grid-cols-2" role="group" aria-label="Decisão do Conselho">
                        <Button
                          variant={decisionChoice === 'approved' ? 'primary' : 'outline'}
                          aria-pressed={decisionChoice === 'approved'}
                          onPress={() => setDecisionChoice('approved')}
                        >
                          <CheckCircle2 className="size-4" aria-hidden="true" />
                          Aprovar pelo Conselho
                        </Button>
                        <Button
                          variant={decisionChoice === 'failed' ? 'primary' : 'outline'}
                          aria-pressed={decisionChoice === 'failed'}
                          onPress={() => setDecisionChoice('failed')}
                        >
                          <XCircle className="size-4" aria-hidden="true" />
                          Não aprovar pelo Conselho
                        </Button>
                      </div>
                      <div>
                        <Label htmlFor="council-justification" className="mb-1.5 block text-sm font-medium">
                          Justificativa obrigatória
                        </Label>
                        <textarea
                          id="council-justification"
                          value={justification}
                          maxLength={4000}
                          rows={5}
                          onChange={(event) => setJustification(event.currentTarget.value)}
                          className="w-full resize-y rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                          aria-describedby="council-justification-help"
                        />
                        <p id="council-justification-help" className="mt-1 text-xs text-muted">
                          O navegador não envia ator, papel, capability ou instante confiável.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="primary"
                          isDisabled={justification.trim().length === 0 || saving || versionConflict !== null}
                          onPress={() => void saveDecision()}
                        >
                          <Save className="size-4" aria-hidden="true" />
                          {saving ? 'Registrando…' : detail.version === 0 ? 'Registrar decisão' : 'Registrar nova versão'}
                        </Button>
                        <span className="text-xs text-muted">expectedVersion: {detail.version}</span>
                      </div>
                    </>
                  )}
                </Card.Content>
              </Card>

              <DecisionHistory detail={detail} />

              <Surface variant="secondary" className="rounded-2xl p-4 text-sm text-muted">
                <div className="flex items-start gap-2">
                  <BookOpenCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <p>
                    Conselho V1 exibe resultados já resolvidos e registra deliberação humana. Não possui votação,
                    desempate, regra automática de frequência, participantes nominais nem cálculo acadêmico próprio.
                  </p>
                </div>
              </Surface>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
