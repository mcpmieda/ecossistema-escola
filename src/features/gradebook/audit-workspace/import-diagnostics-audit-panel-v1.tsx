import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Chip, Spinner, Surface } from '@heroui/react';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import type { GradebookImportDiagnosticsAuditRecordV1 } from '../../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import { listGradebookImportDiagnosticsAuditV1 } from '../import/import-diagnostics-client-v1';

type State = 'loading' | 'ready' | 'empty' | 'unavailable' | 'not-authorized';

function instant(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
    : value;
}

function location(value: GradebookImportDiagnosticsAuditRecordV1): string {
  const student = value.studentNumber
    ? `Aluno nº ${value.studentNumber}${value.studentName ? ` — ${value.studentName}` : ''}`
    : null;
  return [
    student,
    value.classCode && `Turma ${value.classCode}`,
    value.period,
    value.fieldLabel,
  ]
    .filter(Boolean)
    .join(' · ');
}

function AuditOccurrence({ value }: { readonly value: GradebookImportDiagnosticsAuditRecordV1 }) {
  const blocking = value.severity === 'blocking-error';
  return (
    <Surface variant="secondary" className="rounded-xl border border-border/60 p-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="mr-auto min-w-0">
          <p className="font-medium">{value.message}</p>
          <p className="mt-1 text-sm text-muted">{value.fileName}</p>
        </div>
        <Chip size="sm" color={blocking ? 'danger' : 'warning'}>
          {blocking ? 'Bloqueante' : 'Aviso'}
        </Chip>
      </div>
      <dl className="mt-3 grid gap-1 text-sm">
        {location(value) && (
          <div>
            <dt className="inline font-medium">Localização: </dt>
            <dd className="inline">{location(value)}</dd>
          </div>
        )}
        {value.subject && (
          <div>
            <dt className="inline font-medium">Disciplina: </dt>
            <dd className="inline">{value.subject}</dd>
          </div>
        )}
        {value.foundValue && (
          <div>
            <dt className="inline font-medium">Encontrado: </dt>
            <dd className="inline">“{value.foundValue}”</dd>
          </div>
        )}
        {value.cause && (
          <div>
            <dt className="inline font-medium">O que aconteceu: </dt>
            <dd className="inline">{value.cause}</dd>
          </div>
        )}
        <div>
          <dt className="inline font-medium">Como corrigir: </dt>
          <dd className="inline">{value.recommendedAction}</dd>
        </div>
        <div className="text-muted">
          <dt className="inline font-medium">Auditoria: </dt>
          <dd className="inline">
            primeira observação {instant(value.firstObservedAt)} · última {instant(value.lastObservedAt)} ·{' '}
            {value.observations} ocorrência(s)
          </dd>
        </div>
      </dl>
      {(value.sheetName || value.cellAddress) && (
        <details className="mt-2 text-xs text-muted">
          <summary className="cursor-pointer">Detalhes técnicos</summary>
          <p className="mt-1">{[value.sheetName, value.cellAddress].filter(Boolean).join(' · ')}</p>
        </details>
      )}
    </Surface>
  );
}

export function ImportDiagnosticsAuditPanelV1() {
  const [state, setState] = useState<State>('loading');
  const [items, setItems] = useState<readonly GradebookImportDiagnosticsAuditRecordV1[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    setItems([]);
    setNextOffset(null);
    const response = await listGradebookImportDiagnosticsAuditV1({ limit: 50, offset: 0 });
    if (response.state === 'not-authorized') {
      setState('not-authorized');
      return;
    }
    if (response.state !== 'ready') {
      setState('unavailable');
      return;
    }
    setItems(response.items);
    setNextOffset(response.nextOffset);
    setState(response.items.length > 0 ? 'ready' : 'empty');
  }, []);

  const loadMore = useCallback(async () => {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await listGradebookImportDiagnosticsAuditV1({
        limit: 50,
        offset: nextOffset,
      });
      if (response.state !== 'ready') return;
      setItems((current) => [...current, ...response.items]);
      setNextOffset(response.nextOffset);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextOffset]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Surface variant="default" className="rounded-2xl border border-border/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-accent" />
            <h2 className="text-lg font-semibold">Erros e avisos de importação</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted">
            Histórico dos problemas detectados nas planilhas, inclusive arquivos bloqueados antes de
            qualquer gravação acadêmica. A mesma ocorrência no mesmo conteúdo de arquivo não cria
            duplicatas: a Auditoria atualiza a última observação e a contagem.
          </p>
        </div>
        <Button size="sm" variant="secondary" isDisabled={state === 'loading'} onPress={() => void load()}>
          <RefreshCw className="size-4" />
          Atualizar
        </Button>
      </div>

      {state === 'loading' && (
        <div className="mt-5 flex items-center gap-2 text-sm text-muted" role="status">
          <Spinner size="sm" />
          Carregando ocorrências…
        </div>
      )}
      {state === 'empty' && (
        <Alert status="success" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Nenhum erro ou aviso de importação registrado</Alert.Title>
            <Alert.Description>As próximas ocorrências aparecerão aqui automaticamente.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state === 'not-authorized' && (
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Acesso não autorizado</Alert.Title>
            <Alert.Description>Sua sessão não possui autorização para consultar esta Auditoria.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state === 'unavailable' && (
        <Alert status="warning" className="mt-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Auditoria de importação indisponível</Alert.Title>
            <Alert.Description>Não foi possível carregar as ocorrências neste momento.</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {state === 'ready' && (
        <div className="mt-5 grid gap-3">
          {items.map((item) => (
            <AuditOccurrence key={item.id} value={item} />
          ))}
          {nextOffset !== null && (
            <div className="flex justify-center pt-2">
              <Button
                size="sm"
                variant="secondary"
                isPending={loadingMore}
                isDisabled={loadingMore}
                onPress={() => void loadMore()}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      )}
    </Surface>
  );
}
