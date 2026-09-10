import { RelationalWorkspacePageV2 as OperationalWorkspacePage } from '../features/gradebook/operational-workspace/relational-workspace-page-v2';

// The V1 maintenance components remain preserved but are not invoked against the new schema.
export function GradebookOperationalSurface() {
  return <OperationalWorkspacePage />;
}
