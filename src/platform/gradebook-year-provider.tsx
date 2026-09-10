import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button } from '@heroui/react';
import type { WorkspaceYearV2 } from '../../shared/gradebook-contracts/operational-workspace/operational-workspace-transport-v2';
import { GradebookYearContext, useGradebookYear } from './gradebook-year-context';

export function GradebookYearProvider({ children }: { readonly children: ReactNode }) {
  const [year, setYear] = useState<number | null>(null);
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
    setYear(value); setEpoch((current) => current + 1); setTargetStudentId(null);
  }, []);
  const clearAuthorization = useCallback(() => {
    pending.current?.abort(); setYears([]); setLoaded(false); setLoading(false);
    setFailure('A sessão não possui autorização. Entre novamente com uma conta autorizada.');
    selectYear(null);
  }, [selectYear]);
  const load = useCallback(async () => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setFailure(null); setYears([]); setLoaded(false); selectYear(null);
    try {
      // Importation does not preload the catalogue client or start academic requests.
      const { requestOperationalWorkspaceV2 } = await import('../features/gradebook/operational-workspace/operational-workspace-client-v2');
      if (controller.signal.aborted) return;
      const response = await requestOperationalWorkspaceV2({ contractVersion: 2, operation: 'bootstrap' }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.state === 'not-authorized') { clearAuthorization(); return; }
      if (response.state !== 'ready' || response.operation !== 'bootstrap') throw new Error('year-catalog-unavailable');
      setYears(response.years); setLoaded(true);
    } catch {
      if (!controller.signal.aborted) setFailure('Não foi possível carregar os anos cadastrados. Tente novamente.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [clearAuthorization, selectYear]);
  const openStudent = useCallback((id: number) => {
    setTargetStudentId(id);
    setStudentNavigationEpoch((current) => current + 1);
    // The identifier stays only in memory, not the URL or browser history.
    window.location.hash = '#/banco-de-notas?area=operational';
  }, []);
  const value = useMemo(() => ({ year, epoch, years, loaded, loading, failure, targetStudentId, studentNavigationEpoch, load, selectYear, clearAuthorization, openStudent }),
    [year, epoch, years, loaded, loading, failure, targetStudentId, studentNavigationEpoch, load, selectYear, clearAuthorization, openStudent]);
  return <GradebookYearContext.Provider value={value}>{children}</GradebookYearContext.Provider>;
}

export function GradebookYearSelector() {
  const scope = useGradebookYear();
  if (!scope) return null;
  return <section aria-label="Contexto anual compartilhado" className="grid min-w-0 grid-cols-1 gap-3 rounded-2xl border border-border/60 bg-surface p-4">
    <div className="flex flex-wrap items-end gap-3">
      <Button variant="secondary" isDisabled={scope.loading} onPress={() => void scope.load()}>{scope.loaded ? 'Atualizar anos' : 'Carregar anos'}</Button>
      <label className="grid gap-1 text-sm">Ano letivo do Banco
        <select aria-label="Ano letivo do Banco" value={scope.year ?? ''} disabled={scope.loading || !scope.years.length}
          className="rounded-xl border border-separator bg-surface px-3 py-2 focus-visible:ring-2 focus-visible:ring-focus"
          onChange={(event) => scope.selectYear(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Selecione o ano</option>{scope.years.map((value) => <option key={value.year} value={value.year}>{value.year}</option>)}
        </select>
      </label>
      <p className="text-xs text-muted">Compartilhado por Centrais e Desempenho. A troca limpa as consultas anteriores.</p>
    </div>
    {scope.loaded && scope.years.length === 0 ? <p>Nenhum ano cadastrado.</p> : null}
    {scope.failure ? <Alert status="warning"><Alert.Content><Alert.Title>Ano indisponível</Alert.Title><Alert.Description>{scope.failure}</Alert.Description></Alert.Content></Alert> : null}
  </section>;
}
