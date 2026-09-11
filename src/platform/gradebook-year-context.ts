import { createContext, useContext } from 'react';

export interface GradebookYearContextValue {
  readonly year: number | null;
  readonly epoch: number;
  readonly failure: string | null;
  readonly targetStudentId: number | null;
  readonly studentNavigationEpoch: number;
  clearAuthorization(): void;
  retryAuthorization(): void;
  openStudent(id: number): void;
}
export const GradebookYearContext = createContext<GradebookYearContextValue | null>(null);
export const useGradebookYear = () => useContext(GradebookYearContext);
