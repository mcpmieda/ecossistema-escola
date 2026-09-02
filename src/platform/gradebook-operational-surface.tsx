import { OperationalWorkspacePage } from '../features/gradebook/operational-workspace/operational-workspace-page';
import { TeacherAssignmentMaintenanceWorkspace } from '../features/gradebook/operational-workspace/teacher-assignment-maintenance-workspace';

export function GradebookOperationalSurface() {
  return (
    <>
      <OperationalWorkspacePage />
      <TeacherAssignmentMaintenanceWorkspace />
    </>
  );
}
