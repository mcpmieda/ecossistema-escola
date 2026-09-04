import { useEffect, useState } from 'react';
import { Alert, Button, Card, Chip, Label, Spinner } from '@heroui/react';
import { CalendarPlus, RefreshCw } from 'lucide-react';
import type { AcademicYearManagementItemV1 } from '../../../../shared/gradebook-contracts/operational-workspace/academic-year-management-v1';
import { createAcademicYearV1, listAcademicYearsV1 } from './academic-year-management-client-v1';

export function AcademicYearManagementPanelV1() {
  const [items, setItems] = useState<readonly AcademicYearManagementItemV1[]>([]);
  const [year, setYear] = useState('2026');
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'not-authorized'>(
    'loading',
  );
  const [writing, setWriting] = useState(false);
  const [message, setMessage] = useState('');

  async function load(signal?: AbortSignal) {
    setState('loading');
    const response = await listAcademicYearsV1(signal);
    if (response.state === 'ready') {
      setItems(response.items);
      setState('ready');
      return;
    }
    setState(response.state === 'not-authorized' ? 'not-authorized' : 'unavailable');
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  async function create() {
    const candidate = Number(year);
    if (!Number.isSafeInteger(candidate) || candidate < 2000 || candidate > 9999 || writing) return;
    setWriting(true);
    setMessage('');
    try {
      const response = await createAcademicYearV1(candidate);
      if (response.state === 'created' || response.state === 'already-present') {
        setMessage(
          response.state === 'created'
            ? `Ano letivo ${candidate} cadastrado.`
            : `O ano letivo ${candidate} já estava cadastrado.`,
        );
        await load();
      } else {
        setState(response.state === 'not-authorized' ? 'not-authorized' : 'unavailable');
      }
    } finally {
      setWriting(false);
    }
  }

  return (
    <Card variant="default" className="mb-5 overflow-hidden">
      <Card.Header className="flex flex-row items-start justify-between gap-3 border-b border-border/60">
        <div>
          <Card.Title>Ano letivo</Card.Title>
          <Card.Description>
            Cadastre 2026 agora e mantenha esta opção para os próximos anos.
          </Card.Description>
        </div>
        <Button
          size="sm"
          variant="outline"
          isDisabled={state === 'loading'}
          onPress={() => void load()}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Atualizar
        </Button>
      </Card.Header>
      <Card.Content className="grid gap-4 p-5">
        {message && (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {state === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Spinner size="sm" />
            Carregando anos letivos…
          </p>
        )}
        {state === 'not-authorized' && (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>Cadastro não autorizado para esta sessão.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {state === 'unavailable' && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>O cadastro de anos letivos está indisponível.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {state === 'ready' && (
          <div className="flex flex-wrap gap-2" aria-label="Anos letivos cadastrados">
            {items.length === 0 ? (
              <span className="text-sm text-muted">Nenhum ano cadastrado.</span>
            ) : (
              items.map((item) => (
                <Chip
                  key={item.id}
                  size="sm"
                  variant="soft"
                  color={item.status === 'active' ? 'success' : 'default'}
                >
                  {item.year} ·{' '}
                  {item.status === 'active'
                    ? 'Ativo'
                    : item.status === 'planned'
                      ? 'Planejado'
                      : 'Encerrado'}
                </Chip>
              ))
            )}
          </div>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,220px)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <div>
            <Label htmlFor="academic-year-value" className="mb-1.5 block text-sm font-medium">
              Novo ano letivo
            </Label>
            <input
              id="academic-year-value"
              type="number"
              min="2000"
              max="9999"
              value={year}
              onChange={(event) => setYear(event.currentTarget.value)}
              className="h-10 w-full rounded-xl border border-border bg-transparent px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            isDisabled={writing || state === 'not-authorized'}
          >
            <CalendarPlus className="size-4" aria-hidden="true" />
            {writing ? 'Cadastrando…' : 'Cadastrar ano letivo'}
          </Button>
        </form>
      </Card.Content>
    </Card>
  );
}
