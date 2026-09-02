import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Chip, Label, Spinner, Surface } from '@heroui/react';
import {
  AlertTriangle,
  CheckCircle2,
  History,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldAlert,
  Vote,
} from 'lucide-react';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import {
  COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
  type CouncilClosureHistoryReadyV2,
  type CouncilClosureReviewReadyV2,
} from '../../../../shared/gradebook-contracts/council/council-institutional-contract-v2';
import type {
  CouncilClassReferenceV1,
  CouncilStudentReferenceV1,
} from '../../../../shared/gradebook-contracts/council/council-workspace-contract-v1';
import {
  CouncilInstitutionalClientErrorV2,
  requestCouncilClosureCloseV2,
  requestCouncilClosureHistoryV2,
  requestCouncilClosureReviewV2,
  requestCouncilVoteV2,
} from './council-institutional-client-v2';

export interface CouncilInstitutionalPanelV2Props {
  readonly academicYearId: AcademicYearId;
  readonly classReference: CouncilClassReferenceV1;
  readonly classLabel: string;
  readonly focusedStudentReference: CouncilStudentReferenceV1 | null;
  readonly refreshToken: number;
  readonly onMeetingClosedChange: (closed: boolean) => void;
}

type PanelState = 'loading' | 'ready' | 'unavailable' | 'not-authorized';

function clientState(error: unknown): Extract<PanelState, 'unavailable' | 'not-authorized'> {
  return error instanceof CouncilInstitutionalClientErrorV2 && error.code === 'not-authorized'
    ? 'not-authorized'
    : 'unavailable';
}

function nonNegativeInteger(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function CouncilInstitutionalPanelV2({
  academicYearId,
  classReference,
  classLabel,
  focusedStudentReference,
  refreshToken,
  onMeetingClosedChange,
}: CouncilInstitutionalPanelV2Props) {
  const [panelState, setPanelState] = useState<PanelState>('loading');
  const [review, setReview] = useState<CouncilClosureReviewReadyV2 | null>(null);
  const [history, setHistory] = useState<CouncilClosureHistoryReadyV2['entries']>([]);
  const [approvedVotes, setApprovedVotes] = useState('');
  const [failedVotes, setFailedVotes] = useState('');
  const [savingVote, setSavingVote] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [liveMessage, setLiveMessage] = useState('');
  const sequence = useRef(0);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);

  const loadInstitutionalState = useCallback(
    async (signal?: AbortSignal) => {
      const requestSequence = ++sequence.current;
      try {
        const [reviewResponse, historyResponse] = await Promise.all([
          requestCouncilClosureReviewV2(
            {
              operation: 'closure-review',
              contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
              academicYearId,
              classReference,
            },
            signal,
          ),
          requestCouncilClosureHistoryV2(
            {
              operation: 'closure-history',
              contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
              academicYearId,
              classReference,
            },
            signal,
          ),
        ]);
        if (requestSequence !== sequence.current) return;
        if (reviewResponse.outcome !== 'review') {
          setPanelState('unavailable');
          setReview(null);
          return;
        }
        setReview(reviewResponse);
        setHistory(historyResponse.outcome === 'closure-history' ? historyResponse.entries : []);
        setPanelState('ready');
        onMeetingClosedChange(reviewResponse.meeting.state === 'closed');
      } catch (error) {
        if (signal?.aborted || requestSequence !== sequence.current) return;
        setPanelState(clientState(error));
        setReview(null);
      }
    },
    [academicYearId, classReference, onMeetingClosedChange],
  );

  useEffect(() => {
    const controller = new AbortController();
    setPanelState('loading');
    setConfirmingClose(false);
    void loadInstitutionalState(controller.signal);
    return () => {
      sequence.current += 1;
      controller.abort();
    };
  }, [loadInstitutionalState, refreshToken]);

  const focusedReviewItem = useMemo(
    () =>
      review?.items.find((item) => item.studentReference === focusedStudentReference) ?? null,
    [focusedStudentReference, review],
  );

  useEffect(() => {
    setApprovedVotes(focusedReviewItem?.vote ? String(focusedReviewItem.vote.approvedVotes) : '');
    setFailedVotes(focusedReviewItem?.vote ? String(focusedReviewItem.vote.failedVotes) : '');
  }, [focusedReviewItem]);

  const validApprovedVotes = nonNegativeInteger(approvedVotes);
  const validFailedVotes = nonNegativeInteger(failedVotes);
  const voteIsValid = validApprovedVotes !== null && validFailedVotes !== null;
  const meetingClosed = review?.meeting.state === 'closed';

  async function saveVote() {
    if (
      review === null ||
      focusedStudentReference === null ||
      validApprovedVotes === null ||
      validFailedVotes === null ||
      savingVote ||
      meetingClosed
    ) {
      return;
    }
    setSavingVote(true);
    try {
      const response = await requestCouncilVoteV2({
        operation: 'vote',
        contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
        academicYearId,
        classReference,
        studentReference: focusedStudentReference,
        expectedVersion: review.meeting.version,
        approvedVotes: validApprovedVotes,
        failedVotes: validFailedVotes,
      });
      if (response.outcome === 'vote-applied') {
        setLiveMessage(
          response.vote.comparison === 'tie'
            ? 'Contagem registrada com empate. O sistema não executa desempate automático.'
            : 'Contagem numérica opcional registrada.',
        );
        await loadInstitutionalState();
        return;
      }
      if (response.outcome === 'version-conflict' || response.outcome === 'meeting-closed') {
        setLiveMessage('O estado da sessão mudou. A revisão foi recarregada antes de nova tentativa.');
        queueMicrotask(() => conflictRef.current?.focus());
        await loadInstitutionalState();
        return;
      }
      setLiveMessage('A contagem numérica não pôde ser registrada.');
    } catch (error) {
      setPanelState(clientState(error));
      setLiveMessage('O fechamento institucional ficou indisponível durante o registro da contagem.');
    } finally {
      setSavingVote(false);
    }
  }

  function beginCloseConfirmation() {
    if (review === null || !review.canClose || meetingClosed || closing) return;
    setConfirmingClose(true);
    setLiveMessage('Confirmação final de fechamento aberta.');
    queueMicrotask(() => confirmationRef.current?.focus());
  }

  async function confirmClose() {
    if (review === null || !review.canClose || meetingClosed || closing) return;
    setClosing(true);
    try {
      const response = await requestCouncilClosureCloseV2({
        operation: 'closure-close',
        contractVersion: COUNCIL_INSTITUTIONAL_CONTRACT_VERSION_V2,
        academicYearId,
        classReference,
        expectedVersion: review.meeting.version,
        reviewReference: review.reviewReference,
      });
      if (response.outcome === 'closed') {
        setConfirmingClose(false);
        setLiveMessage(`Conselho fechado na versão institucional ${response.version}.`);
        onMeetingClosedChange(true);
        await loadInstitutionalState();
        return;
      }
      if (
        response.outcome === 'version-conflict' ||
        response.outcome === 'review-conflict' ||
        response.outcome === 'closure-blocked' ||
        response.outcome === 'already-closed'
      ) {
        setConfirmingClose(false);
        setLiveMessage('A revisão mudou ou o fechamento já ocorreu. Revise o estado antes de continuar.');
        queueMicrotask(() => conflictRef.current?.focus());
        await loadInstitutionalState();
        return;
      }
      setLiveMessage('O Conselho não pôde ser fechado.');
    } catch (error) {
      setPanelState(clientState(error));
      setLiveMessage('O fechamento institucional ficou indisponível durante a confirmação.');
    } finally {
      setClosing(false);
    }
  }

  if (panelState === 'loading') {
    return (
      <Surface className="rounded-3xl p-4 sm:p-6" aria-busy="true">
        <div className="flex items-center gap-3 text-sm text-muted">
          <Spinner size="sm" />
          Carregando revisão institucional do Conselho…
        </div>
      </Surface>
    );
  }

  if (panelState !== 'ready' || review === null) {
    return (
      <Alert status={panelState === 'not-authorized' ? 'warning' : 'default'}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>
            {panelState === 'not-authorized'
              ? 'Fechamento institucional não autorizado'
              : 'Fechamento V2 aguardando composição'}
          </Alert.Title>
          <Alert.Description>
            {panelState === 'not-authorized'
              ? 'A autorização efetiva permanece exclusivamente no servidor.'
              : 'A frente define o fluxo isolado; o wiring central com providers fica reservado à #343.'}
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const requiredCount = review.blockers.filter((blocker) => blocker.code === 'decision-required').length;
  const inconsistentCount = review.blockers.filter(
    (blocker) => blocker.code === 'decision-inconsistent',
  ).length;
  const insufficientCount = review.items.filter(
    (item) => item.calculated.queueState === 'insufficient-data',
  ).length;
  const voteCount = review.items.filter((item) => item.vote !== null).length;

  return (
    <Card>
      <Card.Header className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <LockKeyhole className="size-4" aria-hidden="true" />
            <Card.Title>Fechamento institucional</Card.Title>
          </div>
          <Card.Description>
            Revisão explícita de {classLabel}. A fotografia é criada no servidor apenas ao confirmar o fechamento.
          </Card.Description>
        </div>
        <Chip variant="soft">
          {meetingClosed ? 'Fechado' : 'Aberto'} · versão {review.meeting.version}
        </Chip>
      </Card.Header>
      <Card.Content className="grid gap-4">
        <div role="status" aria-live="polite" className="sr-only">{liveMessage}</div>
        <div
          ref={conflictRef}
          tabIndex={-1}
          className="outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {meetingClosed ? (
            <Alert status="default">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Sessão encerrada e imutável</Alert.Title>
                <Alert.Description>
                  Novas edições de decisão e contagens ficam bloqueadas. Histórico e fotografia usam somente o estado capturado no fechamento.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : review.canClose ? (
            <Alert status="success">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Revisão consistente para fechamento</Alert.Title>
                <Alert.Description>
                  Todas as decisões exigidas pela fila atual estão registradas. Dados insuficientes permanecem explícitos sem decisão inventada.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Revisão ainda possui pendências</Alert.Title>
                <Alert.Description>
                  O fechamento só captura uma fila consistente; nenhuma regra acadêmica é criada para resolver pendências automaticamente.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </div>

        <section aria-labelledby="council-closure-review-heading" className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="council-closure-review-heading" className="text-sm font-semibold">
                Revisão antes do fechamento
              </h3>
              <p className="mt-1 text-xs text-muted">
                Referência opaca da revisão: {review.reviewReference}
              </p>
            </div>
            <Button size="sm" variant="outline" onPress={() => void loadInstitutionalState()}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Atualizar revisão
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Surface variant="secondary" className="rounded-xl p-3">
              <p className="text-xs text-muted">Alunos na fotografia</p>
              <p className="mt-1 text-lg font-semibold">{review.items.length}</p>
            </Surface>
            <Surface variant="secondary" className="rounded-xl p-3">
              <p className="text-xs text-muted">Decisões pendentes</p>
              <p className="mt-1 text-lg font-semibold">{requiredCount}</p>
            </Surface>
            <Surface variant="secondary" className="rounded-xl p-3">
              <p className="text-xs text-muted">Dados insuficientes preservados</p>
              <p className="mt-1 text-lg font-semibold">{insufficientCount}</p>
            </Surface>
            <Surface variant="secondary" className="rounded-xl p-3">
              <p className="text-xs text-muted">Contagens opcionais registradas</p>
              <p className="mt-1 text-lg font-semibold">{voteCount}</p>
            </Surface>
          </div>
          {inconsistentCount > 0 && (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Decisão incompatível com a projeção oficial atual</Alert.Title>
                <Alert.Description>
                  {inconsistentCount} registro(s) precisam ser revistos antes de qualquer fechamento.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {review.blockers.length > 0 && (
            <ul className="grid gap-2 sm:grid-cols-2" aria-label="Pendências do fechamento">
              {review.blockers.map((blocker) => {
                const item = review.items.find(
                  (candidate) => candidate.studentReference === blocker.studentReference,
                );
                return (
                  <li key={`${blocker.studentReference}:${blocker.code}`}>
                    <Surface variant="secondary" className="rounded-xl p-3 text-sm">
                      <strong>{item?.studentLabel ?? 'Aluno da fila'}</strong>
                      <p className="mt-1 text-xs text-muted">
                        {blocker.code === 'decision-required'
                          ? 'Decisão humana ainda não registrada.'
                          : 'Decisão existente não corresponde mais a um estado elegível para nova deliberação.'}
                      </p>
                    </Surface>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="council-optional-vote-heading" className="grid gap-3">
          <div className="flex items-center gap-2">
            <Vote className="size-4" aria-hidden="true" />
            <div>
              <h3 id="council-optional-vote-heading" className="text-sm font-semibold">
                Votação numérica opcional
              </h3>
              <p className="mt-1 text-xs text-muted">
                A contagem não é necessária para registrar decisão e nunca produz decisão automaticamente.
              </p>
            </div>
          </div>
          {focusedStudentReference === null || focusedReviewItem === null ? (
            <p className="text-sm text-muted">Selecione um aluno da fila para registrar uma contagem opcional.</p>
          ) : meetingClosed ? (
            <p className="text-sm text-muted">A sessão fechada não aceita novas contagens.</p>
          ) : (
            <div className="grid gap-3">
              <p className="text-sm font-medium">{focusedReviewItem.studentLabel}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="council-approved-votes" className="mb-1.5 block text-sm font-medium">
                    Votos por aprovar
                  </Label>
                  <input
                    id="council-approved-votes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={approvedVotes}
                    onChange={(event) => setApprovedVotes(event.currentTarget.value)}
                    className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                </div>
                <div>
                  <Label htmlFor="council-failed-votes" className="mb-1.5 block text-sm font-medium">
                    Votos por não aprovar
                  </Label>
                  <input
                    id="council-failed-votes"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={failedVotes}
                    onChange={(event) => setFailedVotes(event.currentTarget.value)}
                    className="w-full rounded-xl border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  isDisabled={!voteIsValid || savingVote}
                  onPress={() => void saveVote()}
                >
                  <Save className="size-4" aria-hidden="true" />
                  {savingVote ? 'Registrando…' : 'Registrar contagem opcional'}
                </Button>
                <span className="text-xs text-muted">expectedVersion: {review.meeting.version}</span>
              </div>
              {focusedReviewItem.vote?.comparison === 'tie' && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Empate sem resolução automática</Alert.Title>
                    <Alert.Description>
                      A identidade/capability oficial de diretor não está formalizada. O desempate permanece fail-closed; ADMINISTRADOR não é inferido como diretor.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="council-close-heading" className="grid gap-3">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4" aria-hidden="true" />
            <div>
              <h3 id="council-close-heading" className="text-sm font-semibold">Fechar Conselho da turma</h3>
              <p className="mt-1 text-xs text-muted">
                Fechamento é ação humana explícita. Não existe reabertura implícita nesta versão.
              </p>
            </div>
          </div>
          {!meetingClosed && !confirmingClose && (
            <Button
              variant="primary"
              isDisabled={!review.canClose || closing}
              onPress={beginCloseConfirmation}
            >
              <LockKeyhole className="size-4" aria-hidden="true" />
              Revisar e confirmar fechamento
            </Button>
          )}
          {confirmingClose && !meetingClosed && (
            <div
              ref={confirmationRef}
              tabIndex={-1}
              className="grid gap-3 rounded-2xl border border-border p-4 outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <div>
                <p className="font-semibold">Confirmação final</p>
                <p className="mt-1 text-sm text-muted">
                  O sistema congelará a fila, decisões e contagens atuais em uma fotografia imutável e bloqueará novas edições.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button variant="primary" isDisabled={closing} onPress={() => void confirmClose()}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {closing ? 'Fechando…' : 'Confirmar fechamento institucional'}
                </Button>
                <Button variant="outline" isDisabled={closing} onPress={() => setConfirmingClose(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="council-closure-history-heading" className="grid gap-3">
          <div className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            <h3 id="council-closure-history-heading" className="text-sm font-semibold">
              Histórico de fechamentos
            </h3>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted">Nenhum fechamento institucional foi registrado.</p>
          ) : (
            <ol className="grid gap-2">
              {[...history].reverse().map((entry) => (
                <li key={entry.closureReference}>
                  <Surface variant="secondary" className="rounded-xl p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">Versão institucional {entry.version}</strong>
                      <span className="text-xs text-muted">{entry.closedAt}</span>
                    </div>
                    <p className="mt-1 text-sm">Fotografia imutável: {entry.items.length} aluno(s).</p>
                    <p className="mt-1 break-all text-xs text-muted">Ator: {entry.closedBy}</p>
                  </Surface>
                </li>
              ))}
            </ol>
          )}
        </section>

        <Surface variant="secondary" className="rounded-2xl p-4 text-sm text-muted">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Sem participantes nominais, sem regra automática de frequência, sem nova regra acadêmica e sem reabertura automática. A única ação bloqueada por semântica institucional ausente é o desempate que exigiria identidade oficial de diretor.
            </p>
          </div>
        </Surface>
      </Card.Content>
    </Card>
  );
}
