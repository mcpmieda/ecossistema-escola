import {
  Alert,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  Kbd,
  Label,
  SearchField,
  Skeleton,
  Surface,
} from '@heroui/react';
import { BookOpenCheck, GraduationCap, RefreshCw, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type {
  PesquisaBucket,
  PesquisaClassGroupItem,
  PesquisaGlobalResult,
  PesquisaStudentItem,
  PesquisaTeacherItem,
} from '../../shared/banco-notas-pesquisa';

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function search(query: string, signal: AbortSignal): Promise<PesquisaGlobalResult> {
  const response = await fetch(
    `/api/banco-notas/v1/pesquisa?q=${encodeURIComponent(query)}&limitPerType=6`,
    { credentials: 'same-origin', signal },
  );
  const payload = (await response.json().catch(() => ({}))) as PesquisaGlobalResult & {
    message?: string;
  };
  if (!response.ok) {
    throw new ApiError(payload.message ?? 'Não foi possível concluir a pesquisa.', response.status);
  }
  return payload;
}

function ContextChips({ values }: { values: string[] }) {
  if (values.length === 0)
    return <span className="text-sm text-muted">Sem contexto relacionado</span>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {values.slice(0, 4).map((value) => (
        <Chip key={value} size="sm" variant="soft">
          {value}
        </Chip>
      ))}
      {values.length > 4 && (
        <Chip size="sm" variant="soft">
          +{values.length - 4}
        </Chip>
      )}
    </div>
  );
}

function ResultCard({
  title,
  description,
  count,
  hasMore,
  allHref,
  icon,
  children,
}: React.PropsWithChildren<{
  title: string;
  description: string;
  count: number;
  hasMore: boolean;
  allHref: string;
  icon: React.ReactNode;
}>) {
  const navigate = useNavigate();
  return (
    <Card className="overflow-hidden">
      <Card.Header className="border-b border-border/60">
        <div className="flex w-full items-start justify-between gap-3">
          <div>
            <Card.Title className="flex items-center gap-2">
              {icon} {title}
            </Card.Title>
            <Card.Description>{description}</Card.Description>
          </div>
          <Chip size="sm" variant="soft" aria-label={`${count} resultados em ${title}`}>
            {count}
          </Chip>
        </div>
      </Card.Header>
      <Card.Content className="grid gap-3 p-4">{children}</Card.Content>
      {hasMore && (
        <Card.Footer className="border-t border-border/60">
          <Button variant="outline" size="sm" onPress={() => navigate(allHref)}>
            Ver todos em {title}
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}

function EmptyGroup({ label }: { label: string }) {
  return <p className="py-6 text-center text-sm text-muted">Nenhum resultado em {label}.</p>;
}

function Students({
  bucket,
  query,
}: {
  bucket: PesquisaBucket<PesquisaStudentItem>;
  query: string;
}) {
  const navigate = useNavigate();
  const retorno = `/pesquisa?q=${encodeURIComponent(query)}`;
  return (
    <ResultCard
      title="Alunos"
      description="Pessoas canônicas e suas turmas comprovadas."
      count={bucket.total}
      hasMore={bucket.hasMore}
      allHref={`/alunos?q=${encodeURIComponent(query)}`}
      icon={<GraduationCap className="size-5" />}
    >
      {bucket.items.length === 0 ? (
        <EmptyGroup label="alunos" />
      ) : (
        bucket.items.map((item) => (
          <Surface key={item.id} className="rounded-xl border border-border/60 p-3">
            <Button
              variant="ghost"
              className="h-auto w-full justify-start px-0 text-left font-medium"
              onPress={() => navigate(`/alunos/${item.id}?retorno=${encodeURIComponent(retorno)}`)}
            >
              {item.displayName}
            </Button>
            <ContextChips values={item.classGroups} />
          </Surface>
        ))
      )}
    </ResultCard>
  );
}

function Teachers({
  bucket,
  query,
}: {
  bucket: PesquisaBucket<PesquisaTeacherItem>;
  query: string;
}) {
  const navigate = useNavigate();
  const retorno = `/pesquisa?q=${encodeURIComponent(query)}`;
  return (
    <ResultCard
      title="Professores"
      description="Docentes canônicos, componentes e turmas."
      count={bucket.total}
      hasMore={bucket.hasMore}
      allHref={`/professores?q=${encodeURIComponent(query)}`}
      icon={<Users className="size-5" />}
    >
      {bucket.items.length === 0 ? (
        <EmptyGroup label="professores" />
      ) : (
        bucket.items.map((item) => (
          <Surface key={item.id} className="rounded-xl border border-border/60 p-3">
            <Button
              variant="ghost"
              className="h-auto w-full justify-start px-0 text-left font-medium"
              onPress={() =>
                navigate(`/professores/${item.id}?retorno=${encodeURIComponent(retorno)}`)
              }
            >
              {item.displayName}
            </Button>
            <ContextChips values={[...item.components, ...item.classGroups]} />
          </Surface>
        ))
      )}
    </ResultCard>
  );
}

function ClassGroups({
  bucket,
  query,
}: {
  bucket: PesquisaBucket<PesquisaClassGroupItem>;
  query: string;
}) {
  const navigate = useNavigate();
  const retorno = `/pesquisa?q=${encodeURIComponent(query)}`;
  return (
    <ResultCard
      title="Turmas"
      description="Turmas, anos, professores e componentes relacionados."
      count={bucket.total}
      hasMore={bucket.hasMore}
      allHref={`/turmas?q=${encodeURIComponent(query)}`}
      icon={<BookOpenCheck className="size-5" />}
    >
      {bucket.items.length === 0 ? (
        <EmptyGroup label="turmas" />
      ) : (
        bucket.items.map((item) => (
          <Surface key={item.id} className="rounded-xl border border-border/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <Button
                variant="ghost"
                className="h-auto justify-start px-0 text-left font-medium"
                onPress={() =>
                  navigate(`/turmas/${item.id}?retorno=${encodeURIComponent(retorno)}`)
                }
              >
                {item.name}
              </Button>
              {item.acompanhamentoAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    navigate(
                      `/acompanhamento/turmas/${item.id}?retorno=${encodeURIComponent(retorno)}`,
                    )
                  }
                >
                  Acompanhamento
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">{item.schoolYearName}</p>
            <ContextChips values={[...item.components, ...item.teachers]} />
          </Surface>
        ))
      )}
    </ResultCard>
  );
}

export function PesquisaGlobalPage() {
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';
  const [input, setInput] = useState(urlQuery);
  const [result, setResult] = useState<PesquisaGlobalResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [reload, setReload] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const query = urlQuery.trim().replace(/\s+/gu, ' ');

  useEffect(() => {
    if (urlQuery !== input) setInput(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const normalized = input.trim().replace(/\s+/gu, ' ');
      if (normalized === query) return;
      const next = new URLSearchParams(params);
      if (normalized) next.set('q', normalized);
      else next.delete('q');
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, params, query, setParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !editing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === inputRef.current) setInput('');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (query.length < 2) {
      setResult(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setResult(null);
    setError(null);
    search(query, controller.signal)
      .then(setResult)
      .catch((failure: unknown) => {
        if (failure instanceof DOMException && failure.name === 'AbortError') return;
        setError(failure instanceof Error ? failure : new Error('Falha inesperada na pesquisa.'));
      });
    return () => controller.abort();
  }, [query, reload]);

  const total = useMemo(
    () =>
      result
        ? result.results.students.total +
          result.results.teachers.total +
          result.results.classGroups.total
        : 0,
    [result],
  );
  const forbidden = error instanceof ApiError && error.status === 403;

  return (
    <main className="bn-main">
      <Breadcrumbs className="mb-5">
        <Breadcrumbs.Item href="/#sistemas">Centro de Administração</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/banco-de-notas">Banco de Notas</Breadcrumbs.Item>
        <Breadcrumbs.Item>Pesquisa</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pesquisa Global</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
          Encontre alunos, professores e turmas nos registros canônicos do Banco de Notas.
        </p>
      </header>
      <Surface className="bn-card">
        <SearchField value={input} onChange={setInput} aria-label="Pesquisa Global">
          <Label>Pesquisar alunos, professores ou turmas</Label>
          <SearchField.Group>
            <Search className="size-4 text-muted" />
            <SearchField.Input ref={inputRef} placeholder="Digite ao menos 2 caracteres" />
            <SearchField.ClearButton />
            <Kbd variant="light" className="hidden shrink-0 sm:flex">
              <Kbd.Content>/</Kbd.Content>
            </Kbd>
          </SearchField.Group>
        </SearchField>
        <p className="mt-2 text-xs text-muted">
          A pesquisa ignora diferenças de caixa e acentos comuns. Use Esc para limpar.
        </p>
      </Surface>

      <div className="mt-5" aria-live="polite" aria-atomic="true">
        {query.length < 2 ? (
          <Surface className="bn-card text-center">
            <Search className="mx-auto size-8 text-muted" />
            <h2 className="mt-3 font-semibold">
              {query.length === 0 ? 'Comece sua pesquisa' : 'Continue digitando'}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {query.length === 0
                ? 'Digite um nome de aluno, professor ou turma.'
                : 'Digite pelo menos 2 caracteres.'}
            </p>
          </Surface>
        ) : error ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>
                {forbidden ? 'Sem permissão' : 'Não foi possível pesquisar'}
              </Alert.Title>
              <Alert.Description>
                {forbidden
                  ? 'Seu perfil não possui autorização administrativa para esta consulta.'
                  : error.message}
              </Alert.Description>
            </Alert.Content>
            {!forbidden && (
              <Button size="sm" variant="outline" onPress={() => setReload((value) => value + 1)}>
                <RefreshCw className="size-4" /> Tentar novamente
              </Button>
            )}
          </Alert>
        ) : !result ? (
          <div className="grid gap-5 lg:grid-cols-3" aria-label="Carregando resultados">
            {[0, 1, 2].map((item) => (
              <Skeleton key={item} className="h-72 rounded-2xl" />
            ))}
          </div>
        ) : total === 0 ? (
          <Surface className="bn-card text-center">
            <Search className="mx-auto size-8 text-muted" />
            <h2 className="mt-3 font-semibold">Nenhum resultado para “{result.query}”</h2>
            <p className="mt-2 text-sm text-muted">
              Confira a grafia ou tente um nome, turma ou componente mais curto.
            </p>
          </Surface>
        ) : (
          <section aria-label={`Resultados para ${result.query}`}>
            <p className="mb-4 text-sm text-muted">
              {total} resultado(s) encontrado(s) para “{result.query}”.
            </p>
            <div className="grid items-start gap-5 lg:grid-cols-3">
              <Students bucket={result.results.students} query={result.query} />
              <Teachers bucket={result.results.teachers} query={result.query} />
              <ClassGroups bucket={result.results.classGroups} query={result.query} />
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
