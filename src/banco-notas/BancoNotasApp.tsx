import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button,
  Chip,
  Drawer,
  Label,
  SearchField,
  Separator,
  Spinner,
  Surface,
  useOverlayState,
} from '@heroui/react';
import {
  BookOpenCheck,
  CalendarRange,
  Database,
  FileUp,
  History,
  Home,
  LogOut,
  Menu,
  Settings,
  Users,
} from 'lucide-react';
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type {
  DataSource,
  SchoolYear,
  SourceAssignment,
  Teacher,
} from '../../shared/banco-notas-contract';

type Props = { identity: { name?: string } };
const navigation = [
  ['/', 'Visão geral', Home],
  ['/turmas', 'Turmas', CalendarRange],
  ['/alunos', 'Alunos', Users],
  ['/professores', 'Professores', Users],
  ['/componentes', 'Componentes', BookOpenCheck],
  ['/conselho', 'Conselho de Classe', History],
  ['/boletins', 'Boletins', BookOpenCheck],
  ['/importacoes', 'Importações', FileUp],
  ['/modelos', 'Modelos dos professores', BookOpenCheck],
  ['/auditoria', 'Auditoria', History],
  ['/configuracoes/fonte', 'Configurações · Fonte', Settings],
] as const;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/banco-notas${path}`, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? 'Não foi possível concluir a operação.');
  return payload as T;
}

function Overview() {
  return (
    <Page
      title="Visão geral"
      description="Fundação operacional para fontes, modelos, importações e conciliação de notas."
    >
      <div className="bn-grid">
        {['Fontes de dados', 'Importações', 'Modelos docentes', 'Conciliações'].map((label) => (
          <Surface key={label} className="bn-card">
            <p className="text-sm text-muted">{label}</p>
            <p className="mt-2 text-2xl font-semibold">Preparado</p>
            <Chip className="mt-4" size="sm" color="accent" variant="soft">
              Fase 1
            </Chip>
          </Surface>
        ))}
      </div>
    </Page>
  );
}
function Planned({ title }: { title: string }) {
  return (
    <Page title={title} description="Área planejada no contrato da Fase 1.">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Estrutura pronta</Alert.Title>
          <Alert.Description>
            Os dados e permissões desta área já têm contratos; o fluxo operacional será ativado na
            fase correspondente.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    </Page>
  );
}
function Page({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <header className="mb-6">
        <Chip color="accent" variant="soft" size="sm">
          Banco de Notas
        </Chip>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">{description}</p>
      </header>
      {children}
    </div>
  );
}

function SourceConfiguration() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [assignments, setAssignments] = useState<SourceAssignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [yearId, setYearId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const [y, s, a, t] = await Promise.all([
        api<SchoolYear[]>('/v1/school-years'),
        api<DataSource[]>('/v1/data-sources'),
        api<SourceAssignment[]>('/v1/source-assignments'),
        api<Teacher[]>('/v1/teachers'),
      ]);
      setYears(y);
      setSources(s);
      setAssignments(a);
      setTeachers(t);
      setYearId((current) => current || y[0]?.id || '');
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  async function createYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/v1/school-years', {
        method: 'POST',
        body: JSON.stringify({
          year: Number(data.get('year')),
          name: data.get('name'),
          startsOn: data.get('startsOn'),
          endsOn: data.get('endsOn'),
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }
  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      await api('/v1/data-sources', {
        method: 'POST',
        body: JSON.stringify({
          schoolYearId: yearId,
          type: data.get('type'),
          name: data.get('name'),
          description: data.get('description') || '',
        }),
      });
      event.currentTarget.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }
  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const teacherId = String(data.get('teacherId') || '');
    try {
      await api('/v1/source-assignments', {
        method: 'POST',
        body: JSON.stringify({
          schoolYearId: yearId,
          sourceId: data.get('sourceId'),
          scope: teacherId ? 'teacher_override' : 'school_year_default',
          teacherId: teacherId || null,
          authorityMode: data.get('authorityMode'),
          effectiveFrom: data.get('effectiveFrom'),
          effectiveTo: null,
          syncEnabled: data.get('syncEnabled') === 'on',
          reason: data.get('reason'),
        }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }
  return (
    <Page
      title="Configurações · Fonte"
      description="Defina a fonte padrão do ano e substituições explícitas por professor. Sincronização permanece desligada por padrão."
    >
      {message && (
        <Alert status="danger" className="mb-5">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Atenção</Alert.Title>
            <Alert.Description>{message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      {loading ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <Surface className="bn-card">
            <h2 className="font-semibold">Novo ano letivo</h2>
            <form className="bn-form" onSubmit={createYear}>
              <input name="year" type="number" min="2000" max="2200" required placeholder="Ano" />
              <input name="name" required placeholder="Nome" />
              <input name="startsOn" type="date" required />
              <input name="endsOn" type="date" required />
              <Button type="submit" variant="primary">
                Criar ano
              </Button>
            </form>
          </Surface>
          <Surface className="bn-card">
            <h2 className="font-semibold">Nova fonte</h2>
            <select value={yearId} onChange={(e) => setYearId(e.target.value)}>
              {years.map((year) => (
                <option key={year.id} value={year.id}>
                  {year.name}
                </option>
              ))}
            </select>
            <form className="bn-form" onSubmit={createSource}>
              <input name="name" required placeholder="Nome da fonte" />
              <select name="type">
                <option value="legacy_import">Importação legada</option>
                <option value="linked_teacher_model">Modelo docente conectado</option>
              </select>
              <input name="description" placeholder="Descrição" />
              <Button isDisabled={!yearId} type="submit" variant="primary">
                Adicionar fonte
              </Button>
            </form>
          </Surface>
          <Surface className="bn-card">
            <h2 className="font-semibold">Autoridade da fonte</h2>
            <form className="bn-form" onSubmit={assign}>
              <select name="sourceId" required>
                <option value="">Selecione a fonte</option>
                {sources
                  .filter((s) => s.schoolYearId === yearId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <select name="teacherId">
                <option value="">Padrão do ano</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    Substituir para {t.displayName}
                  </option>
                ))}
              </select>
              <select name="authorityMode">
                <option value="authoritative">Autoritativa</option>
                <option value="reference_only">Somente referência</option>
              </select>
              <input name="effectiveFrom" type="date" required />
              <input name="reason" required minLength={3} placeholder="Motivo da configuração" />
              <label className="flex items-center gap-2 text-sm text-muted">
                <input name="syncEnabled" type="checkbox" className="size-4" />
                Ativar sincronização para esta vigência
              </label>
              <Button isDisabled={!yearId} type="submit" variant="primary">
                Salvar vigência
              </Button>
            </form>
          </Surface>
          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Vigências configuradas</h2>
            <div className="mt-4 grid gap-2">
              {assignments.length ? (
                assignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                  >
                    <span>
                      {a.scope === 'school_year_default' ? 'Padrão anual' : 'Exceção docente'} ·{' '}
                      {sources.find((s) => s.id === a.sourceId)?.name ?? a.sourceId}
                    </span>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={a.authorityMode === 'authoritative' ? 'accent' : 'default'}
                    >
                      {a.authorityMode} · sync {a.syncEnabled ? 'ligada' : 'desligada'}
                    </Chip>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">Nenhuma vigência cadastrada.</p>
              )}
            </div>
          </Surface>
          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Estado das fontes</h2>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {sources.length ? (
                sources.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{item.name}</strong>
                      <Chip size="sm" variant="soft">
                        {item.environment}
                      </Chip>
                    </div>
                    <p className="mt-2 text-muted">
                      Migração: {item.migrationState} · Última reconciliação: não executada
                    </p>
                    <p className="mt-1 text-muted">
                      Conflitos aceitos: nenhum; sobreposições autoritativas são rejeitadas.
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Nenhuma fonte cadastrada; não há reconciliações ou conflitos.
                </p>
              )}
            </div>
          </Surface>
        </div>
      )}
    </Page>
  );
}

function Shell({ identity }: Props) {
  const location = useLocation();
  const mobileNavigation = useOverlayState();
  const navigationContent = (
    <>
      <Link to="/" className="flex items-center gap-3 font-semibold">
        <Database className="size-5" />
        Banco de Notas
      </Link>
      <nav className="mt-8 grid gap-1">
        {navigation.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={mobileNavigation.close}
            className={({ isActive }) => `bn-nav ${isActive ? 'bn-nav-active' : ''}`}
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </>
  );
  return (
    <div className="bn-shell">
      <aside className="bn-sidebar">{navigationContent}</aside>
      <div className="min-w-0">
        <Surface className="bn-topbar">
          <Drawer state={mobileNavigation}>
            <Button isIconOnly variant="outline" className="lg:hidden" aria-label="Abrir navegação">
              <Menu />
            </Button>
            <Drawer.Backdrop variant="blur">
              <Drawer.Content placement="left" className="max-w-[300px]">
                <Drawer.Dialog
                  aria-label="Navegação do Banco de Notas"
                  className="h-full rounded-none p-0"
                >
                  <Drawer.CloseTrigger />
                  <Drawer.Body className="p-6">{navigationContent}</Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
          <Breadcrumbs>
            <Breadcrumbs.Item href="/banco-de-notas">Banco de Notas</Breadcrumbs.Item>
            <Breadcrumbs.Item>
              {navigation.find(([to]) => to === location.pathname)?.[1] ?? 'Área'}
            </Breadcrumbs.Item>
          </Breadcrumbs>
          <div className="hidden items-center gap-2 xl:flex">
            <Chip size="sm" variant="soft">
              Ano não selecionado
            </Chip>
            <Chip size="sm" variant="soft" color="warning">
              Fonte não configurada
            </Chip>
            <SearchField name="banco-notas-search" className="w-56">
              <Label className="sr-only">Pesquisar no Banco de Notas</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Pesquisar" />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
          </div>
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <Avatar.Fallback>{identity.name?.slice(0, 1) ?? 'A'}</Avatar.Fallback>
            </Avatar>
            <span className="hidden text-sm sm:block">{identity.name}</span>
            <form method="post" action="/auth/logout">
              <Button isIconOnly size="sm" variant="ghost" type="submit" aria-label="Sair">
                <LogOut />
              </Button>
            </form>
          </div>
        </Surface>
        <main className="bn-main">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/configuracoes/fonte" element={<SourceConfiguration />} />
            {navigation.slice(1, -1).map(([path, title]) => (
              <Route key={path} path={path} element={<Planned title={title} />} />
            ))}
            <Route path="*" element={<Planned title="Área não encontrada" />} />
          </Routes>
          <Separator className="mt-10" />
          <p className="pt-5 text-xs text-muted">Banco de Notas · modelo genérico e auditável</p>
        </main>
      </div>
    </div>
  );
}
export function BancoNotasApp(props: Props) {
  return (
    <BrowserRouter basename="/banco-de-notas">
      <Shell {...props} />
    </BrowserRouter>
  );
}
