import { createContext, useContext } from 'react';
import type { WorkspaceYearV2 } from '../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

export interface GradebookYearContextValue {
  readonly year: number | null;
  readonly epoch: number;
  readonly years: readonly WorkspaceYearV2[];
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly failure: string | null;
  readonly targetStudentId: number | null;
  readonly studentNavigationEpoch: number;
  load(): Promise<void>;
  selectYear(year: number | null): void;
  clearAuthorization(): void;
  openStudent(id: number): void;
}
export const GradebookYearContext = createContext<GradebookYearContextValue | null>(null);
export const useGradebookYear = () => useContext(GradebookYearContext);
