import { GradebookWorkspaceShell } from './gradebook-workspace-shell';
import { PageHeader } from './presentation';

export function GradebookWorkspacePage() {
  return (
    <>
      <PageHeader
        eyebrow="Banco de notas"
        title="Banco de notas"
        description="Importação, operação, auditoria, desempenho, boletins e Conselho em experiências isoladas no mesmo shell institucional."
      />
      <GradebookWorkspaceShell />
    </>
  );
}
