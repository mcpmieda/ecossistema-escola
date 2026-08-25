import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Alert,
  Avatar,
  Breadcrumbs,
  Button,
  Chip,
  Description,
  Drawer,
  Input,
  Label,
  ListBox,
  SearchField,
  Select,
  Separator,
  Spinner,
  Surface,
  Switch,
  TextField,
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

function SourceSelect({
  label,
  value,
  onChange,
  items,
  placeholder,
  isDisabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: Array<{ id: string; label: string }>;
  placeholder: string;
  isDisabled?: boolean;
}) {
  return (
    <Select
      value={value || null}
      onChange={(next) => onChange(next === null ? '' : String(next))}
      placeholder={placeholder}
      isDisabled={isDisabled}
    >
      <Label>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {items.map((item) => (
            <ListBox.Item key={item.id} id={item.id} textValue={item.label}>
              {item.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function SourceConfiguration() {
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [sources, setSources] = useState<DataSource[]>([]);
  const [assignments, setAssignments] = useState<SourceAssignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [yearId, setYearId] = useState('');
  const [sourceType, setSourceType] = useState('legacy_import');
  const [assignmentSourceId, setAssignmentSourceId] = useState('');
  const [assignmentTeacherId, setAssignmentTeacherId] = useState('__default__');
  const [authorityMode, setAuthorityMode] = useState('authoritative');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [sourceEditId, setSourceEditId] = useState('');
  const [sourceEnvironment, setSourceEnvironment] = useState('homologation');
  const [sourceMigrationState, setSourceMigrationState] = useState('not_started');
  const [sourceStatus, setSourceStatus] = useState('active');
  const [assignmentEditId, setAssignmentEditId] = useState('');
  const [assignmentEditAuthority, setAssignmentEditAuthority] = useState('authoritative');
  const [assignmentEditStatus, setAssignmentEditStatus] = useState('active');
  const [assignmentEditSync, setAssignmentEditSync] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const sourcesForYear = useMemo(
    () => sources.filter((item) => item.schoolYearId === yearId),
    [sources, yearId],
  );
  const assignmentsForYear = useMemo(
    () => assignments.filter((item) => item.schoolYearId === yearId),
    [assignments, yearId],
  );

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

  useEffect(() => {
    if (!sourcesForYear.some((item) => item.id === assignmentSourceId)) {
      setAssignmentSourceId('');
    }
    if (!sourcesForYear.some((item) => item.id === sourceEditId)) setSourceEditId('');
    if (!assignmentsForYear.some((item) => item.id === assignmentEditId)) {
      setAssignmentEditId('');
    }
  }, [assignmentEditId, assignmentSourceId, assignmentsForYear, sourceEditId, sourcesForYear]);

  function selectSourceForEdit(id: string) {
    setSourceEditId(id);
    const selected = sources.find((item) => item.id === id);
    if (!selected) return;
    setSourceEnvironment(selected.environment);
    setSourceMigrationState(selected.migrationState);
    setSourceStatus(selected.status);
  }

  function selectAssignmentForEdit(id: string) {
    setAssignmentEditId(id);
    const selected = assignments.find((item) => item.id === id);
    if (!selected) return;
    setAssignmentEditAuthority(selected.authorityMode);
    setAssignmentEditStatus(selected.status);
    setAssignmentEditSync(selected.syncEnabled);
  }

  async function createYear(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
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
      form.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    try {
      await api('/v1/data-sources', {
        method: 'POST',
        body: JSON.stringify({
          schoolYearId: yearId,
          type: sourceType,
          name: data.get('name'),
          description: data.get('description') || '',
        }),
      });
      form.reset();
      setSourceType('legacy_import');
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const teacherId = assignmentTeacherId === '__default__' ? null : assignmentTeacherId;
    try {
      await api('/v1/source-assignments', {
        method: 'POST',
        body: JSON.stringify({
          schoolYearId: yearId,
          sourceId: assignmentSourceId,
          scope: teacherId ? 'teacher_override' : 'school_year_default',
          teacherId,
          authorityMode,
          effectiveFrom: data.get('effectiveFrom'),
          effectiveTo: data.get('effectiveTo') || null,
          syncEnabled,
          reason: data.get('reason'),
        }),
      });
      form.reset();
      setAssignmentSourceId('');
      setAssignmentTeacherId('__default__');
      setAuthorityMode('authoritative');
      setSyncEnabled(false);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }

  async function updateSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceEditId) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/v1/data-sources/${sourceEditId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          environment: sourceEnvironment,
          migrationState: sourceMigrationState,
          status: sourceStatus,
          reason: data.get('reason'),
        }),
      });
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha.');
    }
  }

  async function updateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentEditId) return;
    const data = new FormData(event.currentTarget);
    try {
      await api(`/v1/source-assignments/${assignmentEditId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          authorityMode: assignmentEditAuthority,
          status: assignmentEditStatus,
          syncEnabled: assignmentEditSync,
          effectiveFrom: data.get('effectiveFrom') || undefined,
          effectiveTo: data.get('effectiveTo') || null,
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
              <TextField name="year" isRequired>
                <Label>Ano</Label>
                <Input variant="secondary" type="number" min={2000} max={2200} placeholder="2026" />
              </TextField>
              <TextField name="name" isRequired>
                <Label>Nome</Label>
                <Input variant="secondary" placeholder="Ano letivo 2026" />
              </TextField>
              <TextField name="startsOn" isRequired>
                <Label>Início</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <TextField name="endsOn" isRequired>
                <Label>Fim</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <Button type="submit" variant="primary">
                Criar ano
              </Button>
            </form>
          </Surface>

          <Surface className="bn-card">
            <h2 className="font-semibold">Nova fonte</h2>
            <div className="bn-form">
              <SourceSelect
                label="Ano letivo"
                value={yearId}
                onChange={setYearId}
                placeholder="Selecione o ano"
                items={years.map((year) => ({ id: year.id, label: year.name }))}
              />
            </div>
            <form className="bn-form" onSubmit={createSource}>
              <TextField name="name" isRequired>
                <Label>Nome da fonte</Label>
                <Input variant="secondary" placeholder="Ex.: Modelo conectado" />
              </TextField>
              <SourceSelect
                label="Tipo"
                value={sourceType}
                onChange={setSourceType}
                placeholder="Selecione o tipo"
                items={[
                  { id: 'legacy_import', label: 'Importação legada' },
                  { id: 'linked_teacher_model', label: 'Modelo docente conectado' },
                ]}
              />
              <TextField name="description">
                <Label>Descrição</Label>
                <Input variant="secondary" placeholder="Descrição opcional" />
              </TextField>
              <Button isDisabled={!yearId} type="submit" variant="primary">
                Adicionar fonte
              </Button>
            </form>
          </Surface>

          <Surface className="bn-card">
            <h2 className="font-semibold">Autoridade da fonte</h2>
            <form className="bn-form" onSubmit={assign}>
              <SourceSelect
                label="Fonte"
                value={assignmentSourceId}
                onChange={setAssignmentSourceId}
                placeholder="Selecione a fonte"
                isDisabled={!yearId}
                items={sourcesForYear.map((item) => ({ id: item.id, label: item.name }))}
              />
              <SourceSelect
                label="Escopo"
                value={assignmentTeacherId}
                onChange={setAssignmentTeacherId}
                placeholder="Padrão do ano"
                items={[
                  { id: '__default__', label: 'Padrão do ano' },
                  ...teachers.map((teacher) => ({
                    id: teacher.id,
                    label: `Substituir para ${teacher.displayName}`,
                  })),
                ]}
              />
              <SourceSelect
                label="Autoridade"
                value={authorityMode}
                onChange={setAuthorityMode}
                placeholder="Selecione"
                items={[
                  { id: 'authoritative', label: 'Autoritativa' },
                  { id: 'reference_only', label: 'Somente referência' },
                ]}
              />
              <TextField name="effectiveFrom" isRequired>
                <Label>Vigência inicial</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <TextField name="effectiveTo">
                <Label>Vigência final</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <TextField name="reason" isRequired>
                <Label>Motivo</Label>
                <Input variant="secondary" minLength={3} placeholder="Motivo da configuração" />
              </TextField>
              <Switch isSelected={syncEnabled} onChange={setSyncEnabled}>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <Label>Ativar sincronização para esta vigência</Label>
                  <Description>Permanece desligada por padrão.</Description>
                </Switch.Content>
              </Switch>
              <Button isDisabled={!yearId || !assignmentSourceId} type="submit" variant="primary">
                Salvar vigência
              </Button>
            </form>
          </Surface>

          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Editar fonte existente</h2>
            <form className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5" onSubmit={updateSource}>
              <SourceSelect
                label="Fonte"
                value={sourceEditId}
                onChange={selectSourceForEdit}
                placeholder="Selecione a fonte"
                items={sourcesForYear.map((item) => ({ id: item.id, label: item.name }))}
              />
              <SourceSelect
                label="Ambiente"
                value={sourceEnvironment}
                onChange={setSourceEnvironment}
                placeholder="Ambiente"
                items={[
                  { id: 'homologation', label: 'Homologação' },
                  { id: 'production', label: 'Produção' },
                ]}
              />
              <SourceSelect
                label="Migração"
                value={sourceMigrationState}
                onChange={setSourceMigrationState}
                placeholder="Estado"
                items={[
                  { id: 'not_started', label: 'Não iniciada' },
                  { id: 'preparing', label: 'Preparando' },
                  { id: 'reconciling', label: 'Reconciliando' },
                  { id: 'ready', label: 'Pronta' },
                  { id: 'blocked', label: 'Bloqueada' },
                ]}
              />
              <SourceSelect
                label="Status"
                value={sourceStatus}
                onChange={setSourceStatus}
                placeholder="Status"
                items={[
                  { id: 'active', label: 'Ativa' },
                  { id: 'inactive', label: 'Inativa' },
                  { id: 'archived', label: 'Arquivada' },
                ]}
              />
              <div className="grid gap-3">
                <TextField name="reason" isRequired>
                  <Label>Motivo da alteração</Label>
                  <Input variant="secondary" minLength={3} />
                </TextField>
                <Button isDisabled={!sourceEditId} type="submit" variant="primary">
                  Atualizar fonte
                </Button>
              </div>
            </form>
          </Surface>

          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Editar vigência existente</h2>
            <form
              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              onSubmit={updateAssignment}
            >
              <SourceSelect
                label="Vigência"
                value={assignmentEditId}
                onChange={selectAssignmentForEdit}
                placeholder="Selecione a vigência"
                items={assignmentsForYear.map((item) => ({
                  id: item.id,
                  label: `${item.scope === 'school_year_default' ? 'Padrão anual' : 'Exceção docente'} · ${sources.find((source) => source.id === item.sourceId)?.name ?? item.sourceId}`,
                }))}
              />
              <SourceSelect
                label="Autoridade"
                value={assignmentEditAuthority}
                onChange={setAssignmentEditAuthority}
                placeholder="Autoridade"
                items={[
                  { id: 'authoritative', label: 'Autoritativa' },
                  { id: 'reference_only', label: 'Somente referência' },
                ]}
              />
              <SourceSelect
                label="Status"
                value={assignmentEditStatus}
                onChange={setAssignmentEditStatus}
                placeholder="Status"
                items={[
                  { id: 'active', label: 'Ativa' },
                  { id: 'inactive', label: 'Inativa' },
                ]}
              />
              <Switch isSelected={assignmentEditSync} onChange={setAssignmentEditSync}>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <Switch.Content>
                  <Label>Sincronização</Label>
                  <Description>Alteração exige justificativa.</Description>
                </Switch.Content>
              </Switch>
              <TextField name="effectiveFrom">
                <Label>Nova vigência inicial</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <TextField name="effectiveTo">
                <Label>Nova vigência final</Label>
                <Input variant="secondary" type="date" />
              </TextField>
              <TextField name="reason" isRequired>
                <Label>Motivo da alteração</Label>
                <Input variant="secondary" minLength={3} />
              </TextField>
              <Button isDisabled={!assignmentEditId} type="submit" variant="primary">
                Atualizar vigência
              </Button>
            </form>
          </Surface>

          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Vigências configuradas</h2>
            <div className="mt-4 grid gap-2">
              {assignmentsForYear.length ? (
                assignmentsForYear.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm"
                  >
                    <span>
                      {item.scope === 'school_year_default' ? 'Padrão anual' : 'Exceção docente'} ·{' '}
                      {sources.find((source) => source.id === item.sourceId)?.name ?? item.sourceId}
                    </span>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={item.authorityMode === 'authoritative' ? 'accent' : 'default'}
                    >
                      {item.authorityMode} · sync {item.syncEnabled ? 'ligada' : 'desligada'}
                    </Chip>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">Nenhuma vigência cadastrada para este ano.</p>
              )}
            </div>
          </Surface>

          <Surface className="bn-card xl:col-span-3">
            <h2 className="font-semibold">Estado das fontes</h2>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {sourcesForYear.length ? (
                sourcesForYear.map((item) => (
                  <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <strong>{item.name}</strong>
                      <Chip size="sm" variant="soft">
                        {item.environment}
                      </Chip>
                    </div>
                    <p className="mt-2 text-muted">
                      Migração: {item.migrationState} · Status: {item.status}
                    </p>
                    <p className="mt-1 text-muted">
                      Reconciliação detalhada será exposta quando o fluxo de reconciliação da Fase 2
                      estiver conectado; nenhum resultado fictício é apresentado aqui.
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">Nenhuma fonte cadastrada para este ano.</p>
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
              Ano selecionado em Configurações
            </Chip>
            <Chip size="sm" variant="soft" color="warning">
              Autoridade por vigência
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
