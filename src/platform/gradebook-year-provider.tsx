import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Spinner } from '@heroui/react';
import { RefreshCw } from 'lucide-react';
import type { WorkspaceYearV2 } from '../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { GradebookYearContext, useGradebookYear } from './gradebook-year-context';

// A tab-local navigation preference only. Never store catalogues or academic payloads.
const YEAR_PREFERENCE = 'gradebook.selected-year.v1';
function rememberedYear(): number | null {
  try {
    const raw = window.sessionStorage.getItem(YEAR_PREFERENCE);
    return raw !== null && /^\d{4}$/u.test(raw) && Number(raw) >= 2000 ? Number(raw) : null;
  } catch { return null; }
}
function rememberYear(value: number | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(YEAR_PREFERENCE);
    else window.sessionStorage.setItem(YEAR_PREFERENCE, String(value));
  } catch { /* Storage is optional; the shared in-memory context still works. */ }
}

export function GradebookYearProvider({ children }: { readonly children: ReactNode }) {
  const [year, setYear] = useState<number | null>(null);
  const yearRef = useRef<number | null>(null);
  const yearsRef = useRef<readonly WorkspaceYearV2[]>([]);
  const [epoch, setEpoch] = useState(0);
  const [years, setYears] = useState<readonly WorkspaceYearV2[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [targetStudentId, setTargetStudentId] = useState<number | null>(null);
  const [studentNavigationEpoch, setStudentNavigationEpoch] = useState(0);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  const selectYear = useCallback((value: number | null) => {
    if (value !== null && !yearsRef.current.some((option) => option.year === value)) return;
    rememberYear(value);
    if (yearRef.current === value) return;
    yearRef.current = value;
    setYear(value); setEpoch((current) => current + 1); setTargetStudentId(null);
  }, []);
  const clearAuthorization = useCallback(() => {
    pending.current?.abort(); yearsRef.current = []; setYears([]); setLoaded(false); setLoading(false);
    setFailure('A sessão não possui autorização. Entre novamente com uma conta autorizada.');
    selectYear(null);
  }, [selectYear]);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setFailure(null);
    try {
      const { requestOperationalWorkspaceV2 } = await import('../features/gradebook/operational-workspace/operational-workspace-client-v2');
      if (controller.signal.aborted) return;
      const response = await requestOperationalWorkspaceV2({ contractVersion: 2, operation: 'bootstrap' }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.state === 'not-authorized') { clearAuthorization(); return; }
      if (response.state !== 'ready' || response.operation !== 'bootstrap') throw new Error('year-catalog-unavailable');
      yearsRef.current = response.years; setYears(response.years); setLoaded(true);
      const preferred = yearRef.current ?? rememberedYear();
      // The latest registered catalogue is a navigation default, never a source year.
      const next = response.years.some((option) => option.year === preferred) ? preferred :
        response.years.reduce<number | null>((latest, option) => latest === null || option.year > latest ? option.year : latest, null);
      selectYear(next);
    } catch {
      if (!controller.signal.aborted) setFailure('Não foi possível carregar os anos. Tente novamente.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [clearAuthorization, selectYear]);
  const openStudent = useCallback((id: number) => {
    setTargetStudentId(id); setStudentNavigationEpoch((current) => current + 1);
    window.location.hash = '#/banco-de-notas?area=operational';
  }, []);
  const value = useMemo(() => ({ year, epoch, years, loaded, loading, failure, targetStudentId, studentNavigationEpoch, load, selectYear, clearAuthorization, openStudent }),
    [year, epoch, years, loaded, loading, failure, targetStudentId, studentNavigationEpoch, load, selectYear, clearAuthorization, openStudent]);
  return <GradebookYearContext.Provider value={value}>{children}</GradebookYearContext.Provider>;
}

export function GradebookYearSelector({ autoLoad = true }: { readonly autoLoad?: boolean }) {
  const scope = useGradebookYear();
  const load = scope?.load;
  const loaded = scope?.loaded;
  const failure = scope?.failure;
  useEffect(() => { if (autoLoad && !loaded && !failure) void load?.(); }, [autoLoad, loaded, load, failure]);
  if (!scope) return null;
  return <div aria-label="Contexto anual compartilhado" className="flex min-w-0 flex-wrap items-center justify-end gap-2">
    <label className="flex items-center gap-2 text-sm font-medium">Ano letivo
      <select aria-label="Ano letivo do Banco" value={scope.year ?? ''} disabled={scope.loading || !scope.years.length}
        className="h-9 min-w-24 rounded-xl border border-separator bg-surface px-3 text-sm focus-visible:ring-2 focus-visible:ring-focus"
        onChange={(event) => scope.selectYear(event.target.value ? Number(event.target.value) : null)}>
        {scope.year === null ? <option value="">{scope.loading ? 'Carregando…' : scope.loaded ? 'Sem anos' : 'Ano'}</option> : null}
        {scope.years.map((value) => <option key={value.year} value={value.year}>{value.year}</option>)}
      </select>
    </label>
    <Button size="sm" variant="ghost" isIconOnly aria-label="Atualizar anos" isDisabled={scope.loading} onPress={() => void scope.load()}>
      {scope.loading ? <Spinner size="sm"/> : <RefreshCw size={16} aria-hidden="true"/>}
    </Button>
    {scope.failure ? <Alert status="warning" className="basis-full"><Alert.Content><Alert.Title>Ano indisponível</Alert.Title><Alert.Description>{scope.failure}</Alert.Description></Alert.Content></Alert> : null}
  </div>;
}
