import { AuditWorkspacePage } from './audit-workspace-page';
import { ImportDiagnosticsAuditPanelV1 } from './import-diagnostics-audit-panel-v1';

export function GradebookAuditSurface() {
  return (
    <div className="grid gap-5">
      <ImportDiagnosticsAuditPanelV1 />
      <AuditWorkspacePage />
    </div>
  );
}
