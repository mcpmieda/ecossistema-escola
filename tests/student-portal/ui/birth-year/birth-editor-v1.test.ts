import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createBirthEditorV1,
  emptyBirthEditorV1,
} from '../../../../src/features/student-portal-admin/birth-year/birth-editor-v1';
import { BIRTH_META_V1, birthIdV1, birthJsonV1, birthMockV1 } from './fixtures-v1';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-13T20:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});
function setup(mock = birthMockV1(), canWrite = true) {
  let state = emptyBirthEditorV1();
  const lost = vi.fn();
  const editor = createBirthEditorV1({
    ...mock.props,
    canWrite,
    publish: (value) => {
      state = value;
    },
    onAuthorizationLost: lost,
  });
  return { mock, editor, state: () => state, lost };
}
describe('birth editor concurrency and autosave', () => {
  it('debounces rapid input, never saves partial/invalid/empty drafts and uses distinct CAS versions', async () => {
    const { mock, editor, state } = setup();
    await editor.load();
    for (const value of ['2', '20', '201', '0000', '200 ', '']) {
      editor.edit(birthIdV1(1), value);
      await vi.advanceTimersByTimeAsync(800);
    }
    expect(mock.writes).toHaveLength(0);
    expect(mock.births.get(birthIdV1(1))?.year).toBe('2000');
    editor.edit(birthIdV1(1), '2001');
    await vi.advanceTimersByTimeAsync(300);
    editor.edit(birthIdV1(1), '2002');
    await vi.advanceTimersByTimeAsync(599);
    expect(mock.writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({
      expectedVersion: 19,
      item: { expectedVersion: 7, year: '2002', confirmation: 'unconfirmed-test' },
    });
    expect(state().rows[0]?.status).toBe('saved');
    editor.clear();
  });
  it('clears only after an explicit review and leaves a canceled clear untouched', async () => {
    const { mock, editor, state } = setup();
    await editor.load();
    editor.edit(birthIdV1(1), '');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(0);
    editor.review('clear', birthIdV1(1));
    editor.cancelReview();
    expect(mock.writes).toHaveLength(0);
    editor.review('clear', birthIdV1(1));
    await editor.confirmReview();
    expect(mock.writes[0]).toMatchObject({
      operation: 'birth-write',
      expectedVersion: 19,
      item: { action: 'clear', expectedVersion: 7 },
    });
    expect(state().rows[0]?.record.birth.year).toBeNull();
    expect(state().rows[0]?.status).toBe('saved');
    editor.clear();
  });
  it('does not overwrite a newer draft with an old response and serializes writes across rows', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true,
      active = 0,
      maxActive = 0;
    const mock = birthMockV1({
      write: async (input) => {
        active++;
        maxActive = Math.max(maxActive, active);
        if (first) {
          first = false;
          await gate;
        }
        active--;
        return mock.defaultWrite(input);
      },
    });
    const { editor, state } = setup(mock);
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    const saving = editor.flush(birthIdV1(1));
    editor.edit(birthIdV1(1), '2002');
    editor.edit(birthIdV1(2), '2003');
    await vi.advanceTimersByTimeAsync(800);
    expect(mock.writes).toHaveLength(1);
    release();
    await saving;
    expect(state().rows[0]?.year).toBe('2002');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(3);
    expect(maxActive).toBe(1);
    const last = mock.writes.find(
      (input, i) =>
        i > 0 && input.operation === 'birth-write' && input.item.accountId === birthIdV1(1),
    );
    expect(last).toMatchObject({ expectedVersion: 20, item: { expectedVersion: 8, year: '2002' } });
    editor.clear();
  });
  it('repeats exactly the same uncertain request and accepts no new intent before resolving it', async () => {
    let lost = true;
    const mock = birthMockV1({
      write: async (input) => {
        const response = mock.defaultWrite(input);
        if (lost) {
          lost = false;
          throw new Error('synthetic-lost-reply');
        }
        return response;
      },
    });
    const { editor, state } = setup(mock);
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    await editor.flush(birthIdV1(1));
    expect(state().singleFailure).toMatchObject({ retryable: true, committed: false });
    editor.edit(birthIdV1(1), '2002');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(1);
    await editor.retry();
    expect(mock.bodies[0]).toBe(mock.bodies[1]);
    expect(state().rows[0]?.year).toBe('2002');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(3);
    expect(mock.bodies[2]).not.toBe(mock.bodies[0]);
    editor.clear();
  });
  it('retries only the read after a committed write whose fresh query failed', async () => {
    let fail = true;
    const mock = birthMockV1({
      query(query) {
        if (fail && mock.writes.length && query.scope.kind === 'account') {
          fail = false;
          return Promise.resolve(birthJsonV1({ ...BIRTH_META_V1, state: 'unavailable' }, 503));
        }
      },
    });
    const { editor, state } = setup(mock);
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    await editor.flush(birthIdV1(1));
    expect(state().singleFailure).toMatchObject({ committed: true, retryable: true });
    await vi.advanceTimersByTimeAsync(1000);
    await editor.retry();
    expect(mock.writes).toHaveLength(1);
    expect(state().rows[0]?.status).toBe('saved');
    editor.clear();
  });
  it('does not silently rebase over another operator after a successful commit', async () => {
    let changed = false;
    const mock = birthMockV1({
      query(query) {
        if (!changed && mock.writes.length && query.scope.kind === 'account') {
          changed = true;
          mock.accounts[0]!.version++;
          const old = mock.births.get(birthIdV1(1))!;
          mock.births.set(birthIdV1(1), {
            ...old,
            year: '2005',
            version: old.version + 1,
            accountVersion: mock.accounts[0]!.version,
          });
        }
      },
    });
    const { editor, state } = setup(mock);
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    await editor.flush(birthIdV1(1));
    expect(state().singleFailure).toMatchObject({
      committed: true,
      retryable: false,
      error: { state: 'conflict' },
    });
    editor.edit(birthIdV1(1), '2002');
    await vi.advanceTimersByTimeAsync(2000);
    expect(mock.writes).toHaveLength(1);
    await editor.load();
    expect(state().rows[0]?.year).toBe('2005');
    editor.clear();
  });
  it('never promotes a test year through editing/copying; legitimate provenance requires its own review', async () => {
    const { mock, editor, state } = setup();
    await editor.load();
    editor.edit(birthIdV1(1), '2000');
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(0);
    editor.edit(birthIdV1(2), '2000');
    await editor.flush(birthIdV1(2));
    expect(mock.writes[0]).toMatchObject({ item: { confirmation: 'unconfirmed-test' } });
    editor.review('provenance', birthIdV1(1));
    expect(mock.writes).toHaveLength(1);
    await editor.confirmReview();
    await vi.advanceTimersByTimeAsync(600);
    expect(mock.writes[1]).toMatchObject({ item: { year: '2000', confirmation: 'confirmed' } });
    expect(state().rows[0]?.record.birth.confirmation).toBe('confirmed');
    editor.edit(birthIdV1(1), '2001');
    expect(state().rows[0]?.confirmation).toBe('unconfirmed-test');
    editor.clear();
  });
  it('uses scopeVersion only for a reviewed batch and preserves each selected year/field CAS', async () => {
    const { mock, editor, state } = setup();
    await editor.load();
    editor.setMode('batch');
    editor.edit(birthIdV1(1), '2001');
    editor.edit(birthIdV1(2), '2002');
    editor.select(birthIdV1(1), true);
    editor.select(birthIdV1(2), true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(0);
    editor.review('batch-set');
    editor.edit(birthIdV1(1), '2009');
    expect(state().rows[0]?.year).toBe('2001');
    await editor.confirmReview();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes[0]).toMatchObject({
      operation: 'birth-batch',
      expectedVersion: 47,
      expectedCount: 2,
      items: [
        { year: '2001', expectedVersion: 7 },
        { year: '2002', expectedVersion: 0 },
      ],
    });
    expect(state().batch.state).toBe('complete');
    editor.clear();
  });
  it('clears protected data and queued writes on authorization loss', async () => {
    const mock = birthMockV1({
      write: async () => birthJsonV1({ ...BIRTH_META_V1, state: 'unauthenticated' }, 401),
    });
    const { editor, state, lost } = setup(mock);
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    editor.edit(birthIdV1(2), '2002');
    await editor.flush(birthIdV1(1));
    expect(state()).toMatchObject({ state: 'error', rows: [], review: null });
    expect(lost).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(1);
    editor.clear();
  });
  it('cancels debounce and late responses on cleanup, permits reuse and enforces read-only', async () => {
    const { mock, editor, state } = setup();
    await editor.load();
    editor.edit(birthIdV1(1), '2001');
    editor.clear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mock.writes).toHaveLength(0);
    expect(state().rows).toHaveLength(0);
    await editor.load();
    editor.edit(birthIdV1(1), '2002');
    await editor.flush(birthIdV1(1));
    expect(mock.writes).toHaveLength(1);
    editor.clear();
    const readonly = setup(mock, false);
    await readonly.editor.load();
    readonly.editor.edit(birthIdV1(1), '2003');
    readonly.editor.review('clear', birthIdV1(1));
    await readonly.editor.flush(birthIdV1(1));
    expect(mock.writes).toHaveLength(1);
    expect(readonly.state().review).toBeNull();
    readonly.editor.clear();
  });
});
