import { Avatar, Breadcrumbs, Button, Drawer, Surface, useOverlayState } from '@heroui/react';
import {
  BookOpenCheck,
  ClipboardList,
  Database,
  FileText,
  Home,
  Menu,
  Settings,
  Upload,
  Users,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import type { PlatformCapability } from '../../shared/platform-contract';
import { ImportacoesPage } from './ImportacoesPage';
import { ProfessorDetailPage, ProfessoresPage } from './ProfessoresPage';
import { AlunoDetailPage, AlunosPage, TurmaDetailPage, TurmasPage } from './TurmasAlunosPage';

type BancoNotasIdentity = {
  name?: string;
  roles?: string[];
  capabilities?: PlatformCapability[];
};

type Props = { identity: BancoNotasIdentity };

const navigation = [
  ['/', 'Visão geral', Home],
  ['/alunos', 'Alunos', Users],
  ['/turmas', 'Turmas', BookOpenCheck],
  ['/professores', 'Professores', Users],
  ['/importacoes', 'Importações', Upload],
  ['/conselho', 'Conselho de classe', ClipboardList],
  ['/boletins', 'Boletins', FileText],
  ['/configuracoes', 'Configurações', Settings],
] as const;

function Page({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <main className="bn-main">
      <Breadcrumbs className="mb-5">
        <Breadcrumbs.Item href="/#/sistemas">Centro de Administração</Breadcrumbs.Item>
        <Breadcrumbs.Item href="/banco-de-notas">Banco de Notas</Breadcrumbs.Item>
        <Breadcrumbs.Item>{title}</Breadcrumbs.Item>
      </Breadcrumbs>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </header>
      {children}
    </main>
  );
}

function EmptyPage({ title }: { title: string }) {
  return <Page title={title} />;
}

function Shell({ identity }: Props) {
  const location = useLocation();
  const mobileNavigation = useOverlayState();
  const displayName = identity.name || 'Administrador';
  const identityContext = identity.roles?.[0] ?? 'Conta institucional';
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
              <Menu className="size-4" />
            </Button>
            <Drawer.Backdrop>
              <Drawer.Content placement="left" className="w-72 p-5">
                {navigationContent}
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
          <strong>Banco de Notas</strong>
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <Avatar.Fallback>{displayName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
            </Avatar>
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{displayName}</p>
              <p className="text-xs text-muted">{identityContext}</p>
            </div>
          </div>
        </Surface>
        <Routes location={location}>
          <Route index element={<EmptyPage title="Visão geral" />} />
          <Route path="alunos" element={<AlunosPage />} />
          <Route path="alunos/:id" element={<AlunoDetailPage />} />
          <Route path="turmas" element={<TurmasPage />} />
          <Route path="turmas/:id" element={<TurmaDetailPage />} />
          <Route path="professores" element={<ProfessoresPage />} />
          <Route path="professores/:id" element={<ProfessorDetailPage />} />
          <Route path="importacoes" element={<ImportacoesPage />} />
          <Route path="conselho" element={<EmptyPage title="Conselho de classe" />} />
          <Route path="boletins" element={<EmptyPage title="Boletins" />} />
          <Route path="configuracoes" element={<EmptyPage title="Configurações" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export function BancoNotasApp({ identity }: Props) {
  return (
    <BrowserRouter basename="/banco-de-notas">
      <Shell identity={identity} />
    </BrowserRouter>
  );
}
