import { Alert, Button, Card, Chip, Skeleton, Surface } from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';
import type { SyncAttemptSummary } from '../../shared/banco-notas-sync';

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/banco-notas${path}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!response.ok) throw new Error('sync_attempts_failed');
  return response.json() as Promise<T>;
}
const labels: Record<SyncAttemptSummary['status'], string> = {
  committed: 'Confirmada',
  rejected: 'Rejeitada',
  conflict: 'Conflito',
  duplicate: 'Duplicada',
  failed: 'Falhou',
};
function color(status: SyncAttemptSummary['status']): 'success' | 'warning' | 'danger' {
  return status === 'committed'
    ? 'success'
    : status === 'conflict' || status === 'duplicate'
      ? 'warning'
      : 'danger';
}

export function SyncAttemptsPanel({
  teacherModelId,
  title = 'Tentativas de sincronização',
}: {
  teacherModelId?: string;
  title?: string;
}) {
  const [items, setItems] = useState<SyncAttemptSummary[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<SyncAttemptSummary | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ limit: '20' });
    if (teacherModelId) query.set('teacherModelId', teacherModelId);
    setError(false);
    void read<SyncAttemptSummary[]>(`/v1/sync/attempts?${query}`, controller.signal)
      .then(setItems)
      .catch((caught: unknown) => {
        if ((caught as Error).name !== 'AbortError') setError(true);
      });
    return () => controller.abort();
  }, [reload, teacherModelId]);
  const summary = useMemo(
    () => ({
      committed: items?.filter((item) => item.status === 'committed').length ?? 0,
      conflicts: items?.filter((item) => item.status === 'conflict').length ?? 0,
      duplicates: items?.filter((item) => item.status === 'duplicate').length ?? 0,
      failed:
        items?.filter((item) => item.status === 'failed' || item.status === 'rejected').length ?? 0,
      lastSuccess: items?.find((item) => item.status === 'committed')?.completedAt ?? null,
      averageDuration:
        items && items.some((item) => item.durationMs !== null)
          ? Math.round(
              items.reduce((total, item) => total + (item.durationMs ?? 0), 0) /
                items.filter((item) => item.durationMs !== null).length,
            )
          : null,
    }),
    [items],
  );
  return (
    <Surface className="bn-card mt-5" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted">
            Sem valores de nota; somente estado, contagens, motivo e duração.
          </p>
        </div>
        <Button size="sm" variant="outline" onPress={() => setReload((value) => value + 1)}>
          Atualizar
        </Button>
      </div>
      {error ? (
        <Alert status="warning" className="mt-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Attempts indisponíveis</Alert.Title>
            <Alert.Description>A observabilidade não pôde ser carregada agora.</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : !items ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Card>
              <Card.Content>
                <p className="text-xs text-muted">Confirmadas</p>
                <p className="text-2xl font-semibold">{summary.committed}</p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Content>
                <p className="text-xs text-muted">Conflitos</p>
                <p className="text-2xl font-semibold">{summary.conflicts}</p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Content>
                <p className="text-xs text-muted">Rejeitadas/falhas</p>
                <p className="text-2xl font-semibold">{summary.failed}</p>
              </Card.Content>
            </Card>
            <Card>
              <Card.Content>
                <p className="text-xs text-muted">Duplicatas</p>
                <p className="text-2xl font-semibold">{summary.duplicates}</p>
              </Card.Content>
            </Card>
          </div>
          <p className="mt-3 text-xs text-muted">
            Último sucesso:{' '}
            {summary.lastSuccess ? new Date(summary.lastSuccess).toLocaleString('pt-BR') : 'nenhum'}{' '}
            · duração média:{' '}
            {summary.averageDuration === null ? '—' : `${summary.averageDuration} ms`}
          </p>
          <div className="mt-4 grid gap-2">
            {items.length === 0 ? (
              <p className="text-sm text-muted">Nenhuma tentativa registrada.</p>
            ) : (
              items.map((item) => (
                <Button
                  key={item.attemptId}
                  variant="ghost"
                  className="h-auto justify-between px-3 py-2"
                  onPress={() => setSelected(item)}
                >
                  <span className="min-w-0 text-left">
                    <span className="block truncate text-sm font-medium">{item.requestId}</span>
                    <span className="block text-xs text-muted">
                      {item.changeCount} mudança(s) · {item.reasonCode ?? 'sem bloqueio'}
                    </span>
                  </span>
                  <Chip size="sm" color={color(item.status)} variant="soft">
                    {labels[item.status]}
                  </Chip>
                </Button>
              ))
            )}
          </div>
        </>
      )}
      {selected && (
        <Card className="mt-4">
          <Card.Header>
            <Card.Title>Detalhe da tentativa</Card.Title>
            <Card.Description>{selected.requestId}</Card.Description>
          </Card.Header>
          <Card.Content>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Status</dt>
                <dd>{labels[selected.status]}</dd>
              </div>
              <div>
                <dt className="text-muted">Motivo</dt>
                <dd>{selected.reasonCode ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Mudanças</dt>
                <dd>{selected.changeCount}</dd>
              </div>
              <div>
                <dt className="text-muted">Conflitos</dt>
                <dd>{selected.conflictCount}</dd>
              </div>
              <div>
                <dt className="text-muted">Duração</dt>
                <dd>{selected.durationMs === null ? '—' : `${selected.durationMs} ms`}</dd>
              </div>
              <div>
                <dt className="text-muted">Concluída</dt>
                <dd>{new Date(selected.completedAt).toLocaleString('pt-BR')}</dd>
              </div>
            </dl>
          </Card.Content>
          <Card.Footer>
            <Button size="sm" variant="outline" onPress={() => setSelected(null)}>
              Fechar detalhe
            </Button>
          </Card.Footer>
        </Card>
      )}
    </Surface>
  );
}
