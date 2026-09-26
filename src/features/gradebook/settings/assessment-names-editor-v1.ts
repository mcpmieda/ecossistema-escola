import {
  assessmentNamesSchemaV1,
  sameAssessmentNamesV1,
  type AssessmentNamesV1,
  type AssessmentNamesReadyV1,
  type AssessmentNamesResponseV1,
} from '../../../../shared/gradebook-contracts/settings/assessment-names-v1';
import { requestAssessmentNamesV1 } from './assessment-names-client-v1';

type Failure = Exclude<AssessmentNamesResponseV1['state'], 'ready'>;
export interface AssessmentNamesEditorStateV1 {
  phase: 'loading' | 'ready' | 'saving' | 'error';
  base: AssessmentNamesReadyV1 | null;
  draft: AssessmentNamesV1;
  dirty: boolean;
  failure: Failure | null;
}
export const emptyAssessmentNamesEditorV1 = (): AssessmentNamesEditorStateV1 => ({
  phase: 'loading',
  base: null,
  draft: {},
  dirty: false,
  failure: null,
});

/** One transient writer, checked version, and no automatic rebasing of concurrent edits. */
export function createAssessmentNamesEditorV1(options: {
  year: number;
  publish: (value: AssessmentNamesEditorStateV1) => void;
  send?: typeof requestAssessmentNamesV1;
  onChanged?: () => void;
  onAuthorizationLost?: () => void;
}) {
  const send = options.send ?? requestAssessmentNamesV1;
  let state = emptyAssessmentNamesEditorV1(),
    revision = 0,
    disposed = false;
  let active: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const normalized = () =>
    assessmentNamesSchemaV1.safeParse(
      Object.fromEntries(
        Object.entries(state.draft)
          .filter(([, value]) => value?.trim())
          .map(([key, value]) => [key, value!.trim()]),
      ),
    );
  const emit = (patch: Partial<AssessmentNamesEditorStateV1> = {}) => {
    state = { ...state, ...patch };
    if (!disposed) options.publish({ ...state, draft: { ...state.draft } });
  };
  const fail = (failure: Failure) => {
    emit({
      phase: 'error',
      failure,
      ...(failure === 'not-authorized' ? { base: null, draft: {}, dirty: false } : {}),
    });
    if (failure === 'not-authorized') options.onAuthorizationLost?.();
  };
  async function load(discard = false) {
    if (disposed || active || (!discard && state.dirty)) return;
    clearTimeout(timer);
    const controller = new AbortController();
    active = controller;
    if (!state.base) emit({ phase: 'loading', failure: null });
    try {
      const result = await send(
        { contractVersion: 1, operation: 'read', year: options.year },
        controller.signal,
      );
      if (disposed || controller.signal.aborted) return;
      if (result.state !== 'ready') {
        fail(result.state);
        return false;
      }
      // Editing during a background read wins; don't overwrite a fresh local draft.
      if (state.dirty && !discard) {
        emit({ phase: 'ready' });
        return;
      }
      revision++;
      emit({ base: result, draft: result.names, dirty: false, phase: 'ready', failure: null });
      return true;
    } catch {
      if (!disposed && !controller.signal.aborted) {
        fail('unavailable');
        return false;
      }
    } finally {
      if (active === controller) active = undefined;
      if (state.phase === 'ready') schedule();
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (!disposed && state.dirty && state.phase !== 'error')
      timer = setTimeout(() => void save(), 650);
  }
  async function save() {
    if (
      disposed ||
      active ||
      !state.base ||
      !state.dirty ||
      state.failure === 'conflict' ||
      state.failure === 'not-authorized'
    )
      return;
    clearTimeout(timer);
    const parsed = normalized();
    if (!parsed.success) {
      fail('invalid-request');
      return;
    }
    const generation = revision,
      controller = new AbortController();
    active = controller;
    emit({ phase: 'saving', failure: null });
    try {
      const result = await send(
        {
          contractVersion: 1,
          operation: 'save',
          year: options.year,
          expectedVersion: state.base!.version,
          names: parsed.data,
        },
        controller.signal,
      );
      if (disposed || controller.signal.aborted) return;
      if (result.state !== 'ready') {
        fail(result.state);
        return;
      }
      const current = normalized();
      const dirty = !current.success || !sameAssessmentNamesV1(current.data, result.names);
      emit({
        base: result,
        ...(generation === revision ? { draft: result.names } : {}),
        dirty,
        phase: 'ready',
        failure: null,
      });
      options.onChanged?.();
    } catch {
      if (!disposed && !controller.signal.aborted) fail('unavailable');
    } finally {
      if (active === controller) active = undefined;
      if (state.phase === 'ready') schedule();
    }
  }
  function edit(key: keyof AssessmentNamesV1, value: string) {
    if (disposed || !state.base || state.failure === 'not-authorized') return;
    revision++;
    const draft = { ...state.draft, [key]: value };
    const parsed = assessmentNamesSchemaV1.safeParse(
      Object.fromEntries(
        Object.entries(draft)
          .filter(([, text]) => text?.trim())
          .map(([key, text]) => [key, text!.trim()]),
      ),
    );
    const dirty = !parsed.success || !sameAssessmentNamesV1(parsed.data, state.base.names);
    emit({
      draft,
      dirty,
      ...(state.phase !== 'saving' && state.failure !== 'conflict'
        ? { phase: 'ready', failure: null }
        : {}),
    });
    schedule();
  }
  return {
    load: () => load(),
    refresh: () => load(),
    edit,
    save,
    reload: () => load(true),
    canRefresh: () => !disposed && !active && !state.dirty && state.failure !== 'not-authorized',
    dispose() {
      disposed = true;
      clearTimeout(timer);
      active?.abort();
      active = undefined;
      state = emptyAssessmentNamesEditorV1();
    },
  };
}
