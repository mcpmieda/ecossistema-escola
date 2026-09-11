import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RelationalCouncilFailureV3,
  RelationalCouncilRequestV3,
  RelationalCouncilResponseV3,
  RelationalCouncilWorkspaceV3,
} from '../../../../shared/gradebook-contracts/council/relational-council-v3';
import { useGradebookYear } from '../../../platform/gradebook-year-context';
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
  const [busy, setBusy] = useState({ classes: true, workspace: false, command: false });
  const classesController = useRef<AbortController | null>(null);
  const workspaceController = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const loseAccess = useCallback(() => {
    clearAuthorization?.(); setClasses([]); setClassId(null); setWorkspace(null);
    setFailure('not-authorized'); setBusy({ classes: false, workspace: false, command: false });
  }, [clearAuthorization]);

  const loadClasses = useCallback(async () => {
    if (year === null) return;
    classesController.current?.abort();
    const controller = new AbortController(); classesController.current = controller;
    setBusy((current) => ({ ...current, classes: true })); setFailure(null);
    try {
      const response = await requestRelationalCouncilV3({ contractVersion: 3, operation: 'classes', year, offset: 0, limit: PAGE_SIZE }, controller.signal);
      if (controller.signal.aborted) return;
      if (response.state === 'not-authorized') { loseAccess(); return; }
      if (response.state !== 'ready' || response.operation !== 'classes') { setFailure(response.state === 'ready' ? 'unavailable' : response.state); return; }
      setClasses(response.classes);
      setClassId((current) => current !== null && response.classes.some((item) => item.id === current) ? current : null);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailure('unavailable');
    } finally {
      if (!controller.signal.aborted) setBusy((current) => ({ ...current, classes: false }));
    }
  }, [year, loseAccess]);

  const loadWorkspace = useCallback(async (target: number) => {
    if (year === null) return;
    workspaceController.current?.abort();
    const controller = new AbortController(); workspaceController.current = controller;
    const ticket = ++sequence.current;
    setBusy((current) => ({ ...current, workspace: true })); setFailure(null);
    try {
      const response = await requestRelationalCouncilV3({ contractVersion: 3, operation: 'workspace', year, classId: target }, controller.signal);
      if (controller.signal.aborted || ticket !== sequence.current) return;
      if (response.state === 'not-authorized') { loseAccess(); return; }
      if (response.state !== 'ready' || response.operation === 'classes') { setFailure(response.state === 'ready' ? 'unavailable' : response.state); setWorkspace(null); return; }
      setWorkspace(response.workspace);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError') && ticket === sequence.current) setFailure('unavailable');
    } finally {
      if (!controller.signal.aborted && ticket === sequence.current) setBusy((current) => ({ ...current, workspace: false }));
    }
  }, [year, loseAccess]);

  useEffect(() => {
    void loadClasses();
    return () => { classesController.current?.abort(); workspaceController.current?.abort(); sequence.current += 1; };
  }, [loadClasses]);

  async function selectClass(next: number | null) {
    workspaceController.current?.abort(); sequence.current += 1;
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

  return { year, classes, classId, workspace, failure, busy, loadClasses, loadWorkspace, selectClass, command };
}
