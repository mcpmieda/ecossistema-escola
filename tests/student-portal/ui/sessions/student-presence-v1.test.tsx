import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StudentPresenceV1 } from '../../../../src/features/student-portal-admin/sessions/student-presence-v1';
import {
  operationsMockV1,
  opJsonV1,
  OP_CLASS_V1,
  OP_ACCOUNT_V1,
  OP_META_V1,
} from '../overview/fixtures-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';

beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const presence = (count: number) =>
  opJsonV1({
    ...OP_META_V1,
    state: 'presence',
    connectedStudents: count,
    observedAt: '2026-09-22T12:00:00Z',
    windowSeconds: 60,
  });
it('reads an authenticated aggregate initially and only refreshes on explicit action', async () => {
  const query = vi.fn<NonNullable<NonNullable<Parameters<typeof operationsMockV1>[0]>['query']>>(
    async () => presence(3),
  );
  const mock = operationsMockV1({ query });
  render(<StudentPresenceV1 {...mock.props} scope={OP_CLASS_V1} />);
  expect(await screen.findByText('3')).toBeTruthy();
  expect(query).toHaveBeenCalledOnce();
  expect(query.mock.calls[0]![0]).toMatchObject({
    operation: 'presence',
    scope: OP_CLASS_V1,
    page: { limit: 1 },
  });
  fireEvent(window, new Event('focus'));
  expect(query).toHaveBeenCalledOnce();
  query.mockImplementationOnce(async () => presence(4));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar conexões' }));
  expect(await screen.findByText('4')).toBeTruthy();
});
it('discards a late response after scope/identity change', async () => {
  let resolve!: (response: Response) => void;
  const query = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    )
    .mockImplementation(async () => presence(1));
  const mock = operationsMockV1({ query });
  const view = render(<StudentPresenceV1 {...mock.props} scope={OP_CLASS_V1} />);
  view.rerender(
    <StudentPresenceV1 {...mock.props} identityKey="synthetic-second" scope={OP_ACCOUNT_V1} />,
  );
  expect(await screen.findByText('1')).toBeTruthy();
  await act(async () => {
    resolve(presence(99));
  });
  expect(screen.queryByText('99')).toBeNull();
  expect(screen.getByText('1')).toBeTruthy();
});
it('removes counts on denial and notifies the authorization boundary', async () => {
  const query = vi
    .fn()
    .mockImplementationOnce(async () => presence(3))
    .mockImplementation(async () => opJsonV1({ ...OP_META_V1, state: 'forbidden' }, 403));
  const mock = operationsMockV1({ query }),
    onAuthorizationLost = vi.fn();
  render(<StudentPresenceV1 {...mock.props} onAuthorizationLost={onAuthorizationLost} />);
  expect(await screen.findByText('3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar conexões' }));
  await screen.findByText('Não foi possível consultar as conexões.');
  expect(screen.queryByText('3')).toBeNull();
  expect(onAuthorizationLost).toHaveBeenCalledOnce();
  expect(
    (screen.getByRole('button', { name: 'Atualizar conexões' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
