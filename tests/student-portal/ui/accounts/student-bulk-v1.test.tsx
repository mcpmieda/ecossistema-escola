import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentBulkV1 } from '../../../../src/features/student-portal-admin/accounts/student-bulk-v1';
import {
  createStudentBulkControllerV1,
  type BulkStateV1,
} from '../../../../src/features/student-portal-admin/accounts/student-bulk-controller-v1';
import { createPortalAdminClientV1 } from '../../../../src/features/student-portal-admin/shared/admin-client-v1';
import { opIdV1, OP_CLASS_V1, OP_META_V1, opJsonV1 } from '../overview/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
const query = {
  contractVersion: 1,
  operation: 'bulk-preview',
  action: 'account-reset',
  scope: OP_CLASS_V1,
} as const;
const item = (id: number) => ({
  accountId: opIdV1(id),
  version: 3,
  classId: OP_CLASS_V1.classId,
  name: 'SYNTHETIC BULK ' + id,
  classLabel: 'SYNTHETIC CLASS',
  ineligibility: null,
});
const preview = (ids: number[], total = ids.length, extra = {}) => ({
  ...OP_META_V1,
  state: 'bulk-preview',
  action: query.action,
  scope: OP_CLASS_V1,
  scopeVersion: 17,
  totalCount: total,
  items: ids.map(item),
  proof: 'synthetic_proof_'.repeat(4),
  createdAt: '2026-09-22T12:00:00Z',
  expiresAt: '2099-01-01T00:00:00Z',
  nextCursor: null,
  ...extra,
});
const committed = () =>
  opJsonV1({ ...OP_META_V1, state: 'committed', operationId: opIdV1(9000), version: 4 });
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(fetch: NonNullable<Parameters<typeof createPortalAdminClientV1>[0]>['fetch']) {
  const client = createPortalAdminClientV1({ fetch });
  let state!: BulkStateV1;
  const unauthorized = vi.fn();
  const controller = createStudentBulkControllerV1(
    client,
    (value) => {
      state = value;
    },
    unauthorized,
  );
  return { controller, client, unauthorized, state: () => state };
}
describe('bulk preview and execution', () => {
  it('loads every page beyond 100, keeps page-specific proofs and confirms scope before execution', async () => {
    const bodies: string[] = [];
    const proof2 = 'second_proof_'.repeat(4);
    const s = setup(async (_path, init) => {
      const body = JSON.parse(init.body as string);
      if (body.operation === 'bulk-preview')
        return opJsonV1(
          body.page.cursor
            ? preview([101], 101, { proof: proof2 })
            : preview(
                Array.from({ length: 100 }, (_, i) => i + 1),
                101,
                { nextCursor: 'cursor_'.repeat(6) },
              ),
        );
      bodies.push(init.body as string);
      return committed();
    });
    await s.controller.preview(query);
    expect(s.state().phase).toBe('review');
    expect(s.state().items).toHaveLength(101);
    expect(bodies).toHaveLength(0);
    await s.controller.run();
    expect(bodies).toHaveLength(101);
    expect(JSON.parse(bodies[100]!)).toMatchObject({ proof: proof2, expectedVersion: 3 });
    expect(s.state().items.every((value) => value.result === 'committed')).toBe(true);
    s.controller.dispose();
  });
  it('refuses inconsistent pages before preparing any destructive request', async () => {
    let commands = 0;
    const s = setup(async (_path, init) => {
      const body = JSON.parse(init.body as string);
      if (body.operation !== 'bulk-preview') {
        commands++;
        return committed();
      }
      return opJsonV1(
        body.page.cursor
          ? preview([2], 2, { scopeVersion: 18 })
          : preview([1], 2, { nextCursor: 'cursor_'.repeat(6) }),
      );
    });
    await s.controller.preview(query);
    expect(s.state()).toMatchObject({ phase: 'error', items: [] });
    await s.controller.run();
    expect(commands).toBe(0);
    s.controller.dispose();
  });
  it('shows unavailable accounts without sending commands for them', async () => {
    const bodies: string[] = [];
    const s = setup(async (_path, init) => {
      const body = JSON.parse(init.body as string);
      if (body.operation === 'bulk-preview') return opJsonV1(preview([1, 2], 2, {
        items: [{ ...item(1), ineligibility: 'recovery-unavailable' }, item(2)],
      }));
      bodies.push(init.body as string);
      return committed();
    });
    await s.controller.preview(query);
    expect(s.state().items.map((entry) => entry.result)).toEqual(['skipped', 'pending']);
    await s.controller.run();
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!).accountId).toBe(item(2).accountId);
    expect(s.state().items.map((entry) => entry.result)).toEqual(['skipped', 'committed']);
    s.controller.dispose();
  });
  it('preserves exact intent and bytes after a lost response; retries never regenerate versions or proofs', async () => {
    const bodies: string[] = [];
    let lost = true;
    const s = setup(async (_path, init) => {
      const body = JSON.parse(init.body as string);
      if (body.operation === 'bulk-preview') return opJsonV1(preview([1]));
      bodies.push(init.body as string);
      if (lost) throw new Error('synthetic network loss');
      return committed();
    });
    await s.controller.preview(query);
    await s.controller.run();
    expect(s.state().phase).toBe('unknown');
    await s.controller.preview(query);
    expect(s.state().phase).toBe('unknown');
    lost = false;
    await s.controller.run();
    expect(new Set(bodies).size).toBe(1);
    expect(s.state().phase).toBe('done');
    s.controller.dispose();
  });
  it('cancels future items without rolling back the in-flight item and resumes the same prepared commands', async () => {
    let resolve!: (response: Response) => void;
    const bodies: string[] = [];
    const s = setup(async (_path, init) => {
      const body = JSON.parse(init.body as string);
      if (body.operation === 'bulk-preview') return opJsonV1(preview([1, 2]));
      bodies.push(init.body as string);
      if (bodies.length === 1)
        return new Promise((done) => {
          resolve = done;
        });
      return committed();
    });
    await s.controller.preview(query);
    const running = s.controller.run();
    s.controller.cancel();
    resolve(committed());
    await running;
    expect(s.state().phase).toBe('paused');
    expect(bodies).toHaveLength(1);
    expect(s.state().items[0]!.result).toBe('committed');
    await s.controller.run();
    expect(bodies).toHaveLength(2);
    s.controller.dispose();
  });
  it('records conflicts per item and clears protected data on lost authorization', async () => {
    let status = 409;
    const s = setup(async (_path, init) =>
      JSON.parse(init.body as string).operation === 'bulk-preview'
        ? opJsonV1(preview([1]))
        : opJsonV1({ ...OP_META_V1, state: status === 409 ? 'conflict' : 'forbidden' }, status),
    );
    await s.controller.preview(query);
    await s.controller.run();
    expect(s.state().items[0]).toMatchObject({ result: 'failed', error: 'conflict' });
    status = 403;
    await s.controller.preview(query);
    await s.controller.run();
    expect(s.state().items).toEqual([]);
    expect(s.unauthorized).toHaveBeenCalledOnce();
    s.controller.dispose();
  });
  it('requires the explicit destructive phrase before account reset and displays per-account outcomes', async () => {
    let writes = 0;
    const s = setup(async (_path, init) => {
      if (JSON.parse(init.body as string).operation === 'bulk-preview')
        return opJsonV1(preview([1]));
      writes++;
      return committed();
    });
    render(
      <StrictMode>
        <StudentBulkV1
          client={s.client}
          scope={OP_CLASS_V1}
          scopeLabel="SYNTHETIC CLASS"
          onAuthorizationLost={s.unauthorized}
        />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Redefinir contas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preparar prévia' }));
    const input = await screen.findByRole('textbox', {
      name: 'Digite REDEFINIR CONTAS para confirmar',
    });
    const confirm = screen.getByRole('button', {
      name: 'Confirmar redefinir contas',
    }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(writes).toBe(0);
    fireEvent.change(input, { target: { value: 'REDEFINIR CONTAS' } });
    await act(async () => {
      fireEvent.click(confirm);
    });
    expect(writes).toBe(1);
    expect(await screen.findByText(/Concluído/)).toBeTruthy();
    s.controller.dispose();
  });
});
