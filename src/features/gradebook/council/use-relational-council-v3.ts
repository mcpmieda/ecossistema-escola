import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RelationalCouncilFailureV3,
  RelationalCouncilRequestV3,
  RelationalCouncilResponseV3,
  RelationalCouncilWorkspaceV3,
} from '../../../../shared/gradebook-contracts/council/relational-council-v3';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
import { useLiveRefreshV1 } from '../../../shared/live-data/use-live-refresh-v1';
import { requestRelationalCouncilV3 } from './relational-council-client-v3';

type CouncilClass = Extract<RelationalCouncilResponseV3, { state: 'ready'; operation: 'classes' }>['classes'][number];
type Command = Exclude<RelationalCouncilRequestV3, { operation: 'classes' | 'workspace' }>;
type CommandInput = Command extends infer Value
  ? Value extends Command
    ? Omit<Value, 'contractVersion' | 'year' | 'classId' | 'expectedVersion' | 'idempotencyKey'>
    : never
  : never;
const PAGE_SIZE = 100;

export function useRelationalCouncilV3() {
  const sharedYear = useGradebookYear();
  const year = sharedYear?.year ?? null;
  const clearAuthorization = sharedYear?.clearAuthorization;
  const [classes, setClasses] = useState<readonly CouncilClass[]>([]);
  const [classId, setClassId] = useState<number | null>(null);
  const [workspace, setWorkspace] = useState<RelationalCouncilWorkspaceV3 | null>(null);
  const [failure, setFailure] = useState<RelationalCouncilFailureV3 | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState({ classes: true, workspace: false, command: false });
  const classesController = useRef<AbortController | null>(null);
  const workspaceController = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const draftProtected = useRef(false);
  const selectedClass = useRef<number | null>(null);

  const loseAccess = useCallback(() => {
    clearAuthorization?.(); selectedClass.current = null; setClasses([]); setClassId(null); setWorkspace(null);
    setFailure('not-authorized'); setBusy({ classes: false, workspace: false, command: false });
  }, [clearAuthorization]);

  const loadClasses = useCallback(async (background = false) => {
    if (year === null) return;
    classesController.current?.abort();
    const controller = new AbortController(); classesController.current = controller;
    if (!background) { setBusy((current) => ({ ...current, classes: true })); setFailure(null); }
    try {
      const response = await requestRelationalCouncilV3({ contractVersion: 3, operation: 'classes', year, offset: 0, limit: PAGE_SIZE }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.state === 'not-authorized') { loseAccess(); return false; }
      if (response.state !== 'ready' || response.operation !== 'classes') {
        if (background) setStale(true); else setFailure(response.state === 'ready' ? 'unavailable' : response.state);
        return false;
      }
      setClasses(response.classes);
      if (selectedClass.current !== null && !response.classes.some((item) => item.id === selectedClass.current)) {
        selectedClass.current = null; setClassId(null); setWorkspace(null);
      }
      setStale(false);
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        if (background) setStale(true); else setFailure('unavailable');
        return false;
      }
    } finally {
      if (!background && !controller.signal.aborted) setBusy((current) => ({ ...current, classes: false }));
    }
  }, [year, loseAccess]);

  const loadWorkspace = useCallback(async (target: number, background = false) => {
    if (year === null || (background && draftProtected.current)) return;
    workspaceController.current?.abort();
    const controller = new AbortController(); workspaceController.current = controller;
    const ticket = ++sequence.current;
    if (!background) { setBusy((current) => ({ ...current, workspace: true })); setFailure(null); }
    try {
      const response = await requestRelationalCouncilV3({ contractVersion: 3, operation: 'workspace', year, classId: target }, controller.signal);
      if (controller.signal.aborted || ticket !== sequence.current) return;
      if (response.state === 'not-authorized') { loseAccess(); return false; }
      if (response.state !== 'ready' || response.operation === 'classes') {
        if (background) setStale(true);
        else { setFailure(response.state === 'ready' ? 'unavailable' : response.state); setWorkspace(null); }
        return false;
      }
      if (background && draftProtected.current) return;
      setWorkspace(response.workspace);
      setStale(false);
      return true;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && ticket === sequence.current) {
        if (background) setStale(true); else setFailure('unavailable');
        return false;
      }
    } finally {
      if (!background && !controller.signal.aborted && ticket === sequence.current) setBusy((current) => ({ ...current, workspace: false }));
    }
  }, [year, loseAccess]);

  useEffect(() => {
    void loadClasses();
    return () => { classesController.current?.abort(); workspaceController.current?.abort(); sequence.current += 1; };
  }, [loadClasses]);

  const refresh = useCallback(async () => {
    if (busy.command || draftProtected.current || failure === 'not-authorized') return;
    const refreshed = await loadClasses(true);
    if (refreshed !== true) return refreshed;
    if (classId !== null && selectedClass.current === classId && !draftProtected.current)
      return loadWorkspace(classId, true);
    return refreshed;
  }, [busy.command, classId, failure, loadClasses, loadWorkspace]);
  useLiveRefreshV1(refresh, {
    domains: ['gradebook'], enabled: year !== null,
    canRefresh: () => !busy.classes && !busy.workspace && !busy.command && !draftProtected.current,
  });

  async function selectClass(next: number | null) {
    workspaceController.current?.abort(); sequence.current += 1;
    selectedClass.current = next;
    setClassId(next); setWorkspace(null); setFailure(null);
    if (next !== null) await loadWorkspace(next);
  }

  async function command(request: CommandInput) {
    if (!workspace || classId === null || year === null || busy.command) return null;
    workspaceController.current?.abort(); sequence.current += 1;
    const operation = request.operation;
    const commandRequest = {
      ...request, contractVersion: 3, year, classId, expectedVersion: workspace.session.version,
      idempotencyKey: `${operation}:${crypto.randomUUID()}`,
    } as Command;
    setBusy((current) => ({ ...current, command: true })); setFailure(null);
    try {
      const response = await requestRelationalCouncilV3(commandRequest);
      if (response.state === 'not-authorized') { loseAccess(); return response; }
      if (response.state !== 'ready' || response.operation === 'classes') {
        setFailure(response.state === 'ready' ? 'unavailable' : response.state);
        if (response.state === 'version-conflict' || response.state === 'review-conflict' || response.state === 'session-closed') await loadWorkspace(classId);
        return response;
      }
      setWorkspace(response.workspace);
      setClasses((current) => current.map((item) => item.id === classId ? {
        ...item, sessionState: response.workspace.session.state, sessionVersion: response.workspace.session.version,
      } : item));
      return response;
    } catch {
      setFailure('unavailable'); return null;
    } finally {
      setBusy((current) => ({ ...current, command: false }));
    }
  }

  return { year, classes, classId, workspace, failure, stale, busy, loadClasses, loadWorkspace,
    protectDrafts: (value: boolean) => { draftProtected.current = value; }, selectClass, command };
}
