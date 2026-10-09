import { createContext, useContext } from 'react';
import type { WorkspaceYearV2 } from '../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';

export interface GradebookYearContextValue {
  readonly year: number | null;
  readonly years: readonly WorkspaceYearV2[];
  readonly loading: boolean;
  readonly epoch: number;
  readonly failure: string | null;
  clearAuthorization(): void;
  retryAuthorization(): void;
  selectYear(year: number): void;
  refreshYears(preferredYear?: number): Promise<void>;
}
export const GradebookYearContext = createContext<GradebookYearContextValue | null>(null);
export const useGradebookYear = () => useContext(GradebookYearContext);
