import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Alert, Button, Chip } from '@heroui/react';
import { CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1 } from '../../shared/gradebook-contracts/current-academic-year-v1';
import { GradebookYearContext, useGradebookYear } from './gradebook-year-context';

export function GradebookYearProvider({ children }: { readonly children: ReactNode }) {
  const [epoch, setEpoch] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<number | null>(null);
  const [studentNavigationEpoch, setStudentNavigationEpoch] = useState(0);
  const clearAuthorization = useCallback(() => {
    setFailure('A sessão não possui autorização. Entre novamente com uma conta autorizada.');
  }, []);
  const retryAuthorization = useCallback(() => {
    setFailure(null); setEpoch((current) => current + 1); setTargetStudentId(null);
  }, []);
  const openStudent = useCallback((id: number) => {
    setTargetStudentId(id); setStudentNavigationEpoch((current) => current + 1);
    window.location.hash = '#/banco-de-notas?area=operational';
  }, []);
  const value = useMemo(() => ({ year: CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1, epoch, failure, targetStudentId, studentNavigationEpoch, clearAuthorization, retryAuthorization, openStudent }),
    [epoch, failure, targetStudentId, studentNavigationEpoch, clearAuthorization, retryAuthorization, openStudent]);
  return <GradebookYearContext.Provider value={value}>{children}</GradebookYearContext.Provider>;
}

export function GradebookYearContextBanner() {
  const scope = useGradebookYear();
  if (!scope) return null;
  return <div aria-label="Contexto acadêmico atual" className="flex min-w-0 flex-wrap items-center justify-end gap-2">
    <span className="text-sm font-medium">Ano letivo</span><Chip size="sm" variant="soft">{CURRENT_GRADEBOOK_ACADEMIC_YEAR_V1}</Chip>
    {scope.failure ? <Alert status="warning" className="basis-full"><Alert.Content><Alert.Title>Sessão indisponível</Alert.Title><Alert.Description>{scope.failure}</Alert.Description></Alert.Content><Button size="sm" variant="secondary" onPress={scope.retryAuthorization}>Tentar novamente</Button></Alert> : null}
  </div>;
}
