import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Label, ListBox, Select, Spinner } from '@heroui/react';
import type { WorkspaceYearV2 } from '../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { requestOperationalWorkspaceV2 } from '../features/gradebook/operational-workspace/operational-workspace-client-v2';
import { GradebookYearContext, useGradebookYear } from './gradebook-year-context';

export function GradebookYearProvider({ children }: { readonly children: ReactNode }) {
  const [year, setYear] = useState<number | null>(null);
  const [years, setYears] = useState<readonly WorkspaceYearV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [epoch, setEpoch] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<number | null>(null);
  const [studentNavigationEpoch, setStudentNavigationEpoch] = useState(0);
  const requestSequence = useRef(0);
  const yearRef = useRef<number | null>(null);
  const clearAuthorization = useCallback(() => {
    setFailure('A sessão não possui autorização. Entre novamente com uma conta autorizada.');
  }, []);
  const retryAuthorization = useCallback(() => {
    setFailure(null); setEpoch((current) => current + 1); setTargetStudentId(null);
  }, []);
  const selectYear = useCallback((nextYear: number) => {
    if (!years.some((item) => item.year === nextYear)) return;
    if (yearRef.current === nextYear) return;
    yearRef.current = nextYear;
    setYear(nextYear);
    setEpoch((value) => value + 1);
    setTargetStudentId(null);
  }, [years]);
  const refreshYears = useCallback(async (preferredYear?: number) => {
    const ticket = ++requestSequence.current;
    setLoading(true);
    let response;
    try {
      response = await requestOperationalWorkspaceV2({ contractVersion: 2, operation: 'bootstrap' });
    } catch {
      if (ticket === requestSequence.current) {
        setFailure('Não foi possível carregar os anos letivos disponíveis.');
        setLoading(false);
      }
      return;
    }
    if (ticket !== requestSequence.current) return;
    if (response.state === 'not-authorized') {
      setFailure('A sessão não possui autorização. Entre novamente com uma conta autorizada.');
      yearRef.current = null;
      setYears([]); setYear(null); setLoading(false); return;
    }
    if (response.state !== 'ready' || response.operation !== 'bootstrap') {
      setFailure('Não foi possível carregar os anos letivos disponíveis.');
      setLoading(false); return;
    }
    setFailure(null);
    setYears(response.years);
    const current = yearRef.current;
    const next = preferredYear !== undefined && response.years.some((item) => item.year === preferredYear)
      ? preferredYear
      : current !== null && response.years.some((item) => item.year === current)
        ? current
        : response.years[0]?.year ?? null;
    yearRef.current = next;
    setYear(next);
    if (next !== current) {
      setEpoch((value) => value + 1);
      setTargetStudentId(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void refreshYears(); return () => { requestSequence.current += 1; }; }, [refreshYears]);
  const openStudent = useCallback((id: number) => {
    setTargetStudentId(id); setStudentNavigationEpoch((current) => current + 1);
    window.location.hash = '#/banco-de-notas?area=operational';
  }, []);
  const value = useMemo(() => ({ year, years, loading, epoch, failure, targetStudentId, studentNavigationEpoch, clearAuthorization, retryAuthorization, selectYear, refreshYears, openStudent }),
    [year, years, loading, epoch, failure, targetStudentId, studentNavigationEpoch, clearAuthorization, retryAuthorization, selectYear, refreshYears, openStudent]);
  return <GradebookYearContext.Provider value={value}>{children}</GradebookYearContext.Provider>;
}

export function GradebookYearContextBanner() {
  const scope = useGradebookYear();
  if (!scope) return null;
  return <div aria-label="Contexto acadêmico atual" className="flex min-w-0 flex-wrap items-end justify-end gap-2">
    <Select selectedKey={scope.year === null ? null : String(scope.year)} isDisabled={scope.loading || scope.years.length === 0} onSelectionChange={(key) => { if (key !== null) scope.selectYear(Number(key)); }}>
      <Label className="mb-1 block text-xs font-medium text-muted">Ano letivo global</Label>
      <Select.Trigger className="min-h-10 min-w-36"><Select.Value />{scope.loading ? <Spinner size="sm" /> : <Select.Indicator />}</Select.Trigger>
      <Select.Popover><ListBox>{scope.years.map((item) => <ListBox.Item key={item.year} id={String(item.year)} textValue={String(item.year)}>{item.year}<ListBox.ItemIndicator /></ListBox.Item>)}</ListBox></Select.Popover>
    </Select>
    {scope.failure ? <Alert status="warning" className="basis-full"><Alert.Content><Alert.Title>Contexto indisponível</Alert.Title><Alert.Description>{scope.failure}</Alert.Description></Alert.Content><Button size="sm" variant="secondary" onPress={() => { scope.retryAuthorization(); void scope.refreshYears(); }}>Tentar novamente</Button></Alert> : null}
  </div>;
}
