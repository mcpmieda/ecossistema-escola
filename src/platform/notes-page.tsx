import { Component, lazy, Suspense, type ReactNode } from 'react';
import { Alert, Button, Spinner, Surface } from '@heroui/react';

const GradebookWorkspacePage = lazy(async () => {
  const module = await import('./gradebook-workspace-page');
  return { default: module.GradebookWorkspacePage };
});

type GradebookRouteBoundaryState = { readonly failed: boolean };

class GradebookRouteBoundary extends Component<{ readonly children: ReactNode }, GradebookRouteBoundaryState> {
  override state: GradebookRouteBoundaryState = { failed: false };

  static getDerivedStateFromError(): GradebookRouteBoundaryState {
    return { failed: true };
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Alert status="danger" role="alert">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Banco de notas indisponível</Alert.Title>
          <Alert.Description>
            O carregamento desta área falhou isoladamente. O restante do Centro continua disponível.
          </Alert.Description>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onPress={() => window.location.assign('#/visao-geral')}>
              Voltar à visão geral
            </Button>
            <Button size="sm" variant="secondary" onPress={() => window.location.reload()}>
              Recarregar
            </Button>
          </div>
        </Alert.Content>
      </Alert>
    );
  }
}

export function NotesPage() {
  return (
    <GradebookRouteBoundary>
      <Suspense
        fallback={
          <Surface
            variant="secondary"
            className="grid min-h-48 place-items-center rounded-[2rem] border border-border/60 p-6"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center gap-3 text-sm text-muted">
              <Spinner size="sm" />
              Carregando Banco de notas…
            </div>
          </Surface>
        }
      >
        <GradebookWorkspacePage />
      </Suspense>
    </GradebookRouteBoundary>
  );
}
