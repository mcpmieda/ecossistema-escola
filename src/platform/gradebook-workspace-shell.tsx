import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Alert, Button, Spinner, Surface } from '@heroui/react';
import { GradebookYearContextBanner, GradebookYearProvider } from './gradebook-year-provider';
import { useGradebookYear } from './gradebook-year-context';
import { NotesImportPanel } from '../features/gradebook/import/import-panel';

export const GRADEBOOK_WORKSPACE_SURFACES = [
  {
    id: 'importacao',
    label: 'Importação',
    description: 'Importe e reconheça planilhas sem persistir dados acadêmicos no navegador.',
  },
  {
    id: 'operational',
    label: 'Centrais',
    description: 'Localize alunos, turmas, professores e componentes no ano letivo 2026.',
  },
  {
    id: 'audit',
    label: 'Auditoria',
    description: 'Entenda pendências atuais da fonte e as ações sugeridas, sem correção automática.',
  },
  {
    id: 'performance',
    label: 'Desempenho',
    description: 'Explore as lentes oficiais de desempenho sem recalcular resultados na interface.',
  },
  {
    id: 'bulletins',
    label: 'Boletins',
    description: 'Consulte preview, emissão, PDF e histórico baseados no modelo canônico existente.',
  },
  {
    id: 'reports',
    label: 'Relatórios',
    description: 'Produza relatórios institucionais e lotes PDF bounded somente sobre dados oficiais.',
  },
  {
    id: 'council',
    label: 'Conselho',
    description: 'Abra a fila oficial, registre decisões humanas e feche a turma institucionalmente.',
  },
] as const;

export type GradebookWorkspaceSurfaceId = (typeof GRADEBOOK_WORKSPACE_SURFACES)[number]['id'];

const DEFAULT_SURFACE: GradebookWorkspaceSurfaceId = 'importacao';

function workspaceSurfaceFromHash(): GradebookWorkspaceSurfaceId {
  const query = window.location.hash.split('?')[1] ?? '';
  const requested = new URLSearchParams(query).get('area');
  return GRADEBOOK_WORKSPACE_SURFACES.some((surface) => surface.id === requested)
    ? (requested as GradebookWorkspaceSurfaceId)
    : DEFAULT_SURFACE;
}

function workspaceSurfaceHash(surfaceId: GradebookWorkspaceSurfaceId): string {
  return surfaceId === DEFAULT_SURFACE
    ? '#/banco-de-notas'
    : `#/banco-de-notas?area=${encodeURIComponent(surfaceId)}`;
}

function replaceWorkspaceSurfaceHash(surfaceId: GradebookWorkspaceSurfaceId): void {
  const nextHash = workspaceSurfaceHash(surfaceId);
  if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
}

const OperationalWorkspaceSurface = lazy(async () => {
  const module = await import('./gradebook-operational-surface');
  return { default: module.GradebookOperationalSurface };
});

const GradebookAuditSurface = lazy(async () => {
  const module = await import('../features/gradebook/audit-workspace/gradebook-audit-surface');
  return { default: module.GradebookAuditSurface };
});

const PerformancePage = lazy(async () => {
  const module = await import('../features/gradebook/performance/relational-performance-page-v2');
  return { default: module.RelationalPerformancePageV2 };
});

const BulletinPage = lazy(async () => {
  const module = await import('../features/gradebook/bulletins/bulletin-page');
  return { default: module.BulletinPage };
});

const InstitutionalReportsPage = lazy(async () => {
  const module = await import('../features/gradebook/reports/relational-institutional-reports-page-v2');
  return { default: module.GradebookRelationalInstitutionalReportsPage };
});

const CouncilWorkspaceSurface = lazy(async () => {
  const module = await import('./gradebook-council-surface');
  return { default: module.GradebookCouncilSurface };
});

const SURFACE_COMPONENTS: Record<
  Exclude<GradebookWorkspaceSurfaceId, 'importacao'>,
  ComponentType
> = {
  operational: OperationalWorkspaceSurface,
  audit: GradebookAuditSurface,
  performance: PerformancePage,
  bulletins: BulletinPage,
  reports: InstitutionalReportsPage,
  council: CouncilWorkspaceSurface,
};

type SurfaceBoundaryProps = {
  readonly label: string;
  readonly onLeave: () => void;
  readonly children: ReactNode;
};

type SurfaceBoundaryState = { readonly failed: boolean };

class GradebookSurfaceBoundary extends Component<SurfaceBoundaryProps, SurfaceBoundaryState> {
  override state: SurfaceBoundaryState = { failed: false };

  static getDerivedStateFromError(): SurfaceBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{this.props.label} indisponível</Alert.Title>
          <Alert.Description>
            Esta experiência falhou isoladamente. As demais áreas do Banco continuam disponíveis.
          </Alert.Description>
          <div className="mt-3">
            <Button size="sm" variant="outline" onPress={this.props.onLeave}>
              Voltar à Importação
            </Button>
          </div>
        </Alert.Content>
      </Alert>
    );
  }
}

function SurfaceLoading({ label }: { readonly label: string }) {
  return (
    <Surface
      variant="secondary"
      className="rounded-2xl border border-border/60 p-5"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 text-sm text-muted">
        <Spinner size="sm" />
        Carregando {label}…
      </div>
    </Surface>
  );
}

function nextSurfaceFromKey(
  current: GradebookWorkspaceSurfaceId,
  event: KeyboardEvent<HTMLButtonElement>,
): GradebookWorkspaceSurfaceId | null {
  const index = GRADEBOOK_WORKSPACE_SURFACES.findIndex((surface) => surface.id === current);
  if (index < 0) return null;
  if (event.key === 'Home') return GRADEBOOK_WORKSPACE_SURFACES[0].id;
  if (event.key === 'End') return GRADEBOOK_WORKSPACE_SURFACES.at(-1)?.id ?? null;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return null;
  const direction = event.key === 'ArrowRight' ? 1 : -1;
  const nextIndex =
    (index + direction + GRADEBOOK_WORKSPACE_SURFACES.length) %
    GRADEBOOK_WORKSPACE_SURFACES.length;
  return GRADEBOOK_WORKSPACE_SURFACES[nextIndex]?.id ?? null;
}

export function GradebookWorkspaceShell() {
  return <GradebookYearProvider><GradebookWorkspaceShellContent /></GradebookYearProvider>;
}

function GradebookWorkspaceShellContent() {
  const scope = useGradebookYear();
  const [activeSurface, setActiveSurface] = useState<GradebookWorkspaceSurfaceId>(() =>
    workspaceSurfaceFromHash(),
  );
  const [visitedSurfaces, setVisitedSurfaces] = useState<ReadonlySet<GradebookWorkspaceSurfaceId>>(
    () => new Set([workspaceSurfaceFromHash()]),
  );
  const tabRefs = useRef(new Map<GradebookWorkspaceSurfaceId, HTMLButtonElement>());

  const activateSurface = (surfaceId: GradebookWorkspaceSurfaceId) => {
    setVisitedSurfaces((current) => {
      if (current.has(surfaceId)) return current;
      const next = new Set(current);
      next.add(surfaceId);
      return next;
    });
    setActiveSurface(surfaceId);
    replaceWorkspaceSurfaceHash(surfaceId);
  };

  useEffect(() => {
    const onHashChange = () => {
      const requested = workspaceSurfaceFromHash();
      setVisitedSurfaces((current) => {
        if (current.has(requested)) return current;
        const next = new Set(current);
        next.add(requested);
        return next;
      });
      setActiveSurface(requested);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleTabKeyDown = (
    surfaceId: GradebookWorkspaceSurfaceId,
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    const next = nextSurfaceFromKey(surfaceId, event);
    if (next === null) return;
    event.preventDefault();
    activateSurface(next);
    window.requestAnimationFrame(() => tabRefs.current.get(next)?.focus());
  };

  return (
    <section aria-labelledby="gradebook-workspace-heading" className="grid min-w-0 grid-cols-1 gap-4">
      <h2 id="gradebook-workspace-heading" className="sr-only">Banco de notas</h2>
      <div className="gradebook-area-nav">
        <div
          role="tablist"
          aria-label="Áreas do Banco de notas"
          className="gradebook-area-tabs max-w-full overflow-x-auto"
        >
          {GRADEBOOK_WORKSPACE_SURFACES.map((surface) => {
            const selected = surface.id === activeSurface;
            return (
              <button
                key={surface.id}
                ref={(element) => {
                  if (element) tabRefs.current.set(surface.id, element);
                  else tabRefs.current.delete(surface.id);
                }}
                id={`gradebook-tab-${surface.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`gradebook-panel-${surface.id}`}
                tabIndex={selected ? 0 : -1}
                className={`gradebook-area-tab ${
                  selected
                    ? 'gradebook-area-tab--selected'
                    : ''
                }`}
                onClick={() => activateSurface(surface.id)}
                onKeyDown={(event) => handleTabKeyDown(surface.id, event)}
              >
                {surface.label}
              </button>
            );
          })}
        </div>
        <GradebookYearContextBanner />
      </div>

      <p className="sr-only" aria-live="polite">
        {GRADEBOOK_WORKSPACE_SURFACES.find((surface) => surface.id === activeSurface)?.label} ativa.
      </p>

      {GRADEBOOK_WORKSPACE_SURFACES.map((surface) => {
        if (!visitedSurfaces.has(surface.id)) return null;
        const active = surface.id === activeSurface;
        return (
          <div
            key={surface.id}
            id={`gradebook-panel-${surface.id}`}
            role="tabpanel"
            aria-labelledby={`gradebook-tab-${surface.id}`}
            hidden={!active}
            className="min-w-0"
          >
            <p className="sr-only">{surface.description}</p>
            {surface.id === 'importacao' ? (
              <NotesImportPanel />
            ) : (
              <GradebookSurfaceBoundary
                label={surface.label}
                onLeave={() => activateSurface(DEFAULT_SURFACE)}
              >
                <Suspense fallback={<SurfaceLoading label={surface.label} />}>
                  {(() => {
                    const SurfaceComponent = SURFACE_COMPONENTS[surface.id];
                    const scopeKey = surface.id === 'operational'
                      ? `${scope?.epoch}:${scope?.targetStudentId}:${scope?.studentNavigationEpoch}`
                      : scope?.epoch;
                    return <SurfaceComponent key={scopeKey} />;
                  })()}
                </Suspense>
              </GradebookSurfaceBoundary>
            )}
          </div>
        );
      })}
    </section>
  );
}
