// @vitest-environment jsdom
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssessmentNamesV1 } from '../../../src/features/gradebook/settings/assessment-names-v1';
import {
  GradebookYearContext,
  type GradebookYearContextValue,
} from '../../../src/platform/gradebook-year-context';
import { setupOperationsDomV1 } from '../../student-portal/ui/overview/dom-v1';
const context = (year = 2026): GradebookYearContextValue => ({
  year,
  years: [],
  loading: false,
  epoch: 1,
  failure: null,
  targetStudentId: null,
  studentNavigationEpoch: 0,
  clearAuthorization: vi.fn(),
  retryAuthorization: vi.fn(),
  selectYear: vi.fn(),
  refreshYears: async () => {},
  openStudent: vi.fn(),
});
const ready = (year = 2026, version = 0, names = {}) => ({
  contractVersion: 1,
  state: 'ready',
  year,
  version,
  names,
});
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function Demo({
  scope = context(),
  active = true,
}: {
  scope?: GradebookYearContextValue;
  active?: boolean;
}) {
  return (
    <GradebookYearContext.Provider value={scope}>
      <AssessmentNamesV1 isActive={active} />
    </GradebookYearContext.Provider>
  );
}
describe('HeroUI assessment names', () => {
  it('is usable under StrictMode, exposes six uniquely labelled fields and autosaves without a save button', async () => {
    const requests: Record<string, unknown>[] = [];
    let saved = ready();
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, options) => {
      const request = JSON.parse(String(options?.body));
      requests.push(request);
      if (request.operation === 'save') saved = ready(2026, 1, request.names);
      return Response.json(saved);
    });
    vi.stubGlobal('fetch', fetch);
    render(
      <StrictMode>
        <Demo />
      </StrictMode>,
    );
    const user = userEvent.setup();
    const field = await screen.findByRole('textbox', { name: 'Avaliação 2 do 1º trimestre' });
    expect(screen.getAllByRole('textbox')).toHaveLength(6);
    expect(requests.filter((r) => r.operation === 'save')).toHaveLength(0);
    await user.type(field, 'Simulado');
    await waitFor(() => expect(requests.filter((r) => r.operation === 'save')).toHaveLength(1), {
      timeout: 2500,
    });
    await screen.findByText('Salvo');
    expect(requests.find((r) => r.operation === 'save')).toMatchObject({
      year: 2026,
      expectedVersion: 0,
      names: { '1:2': 'Simulado' },
    });
    expect(screen.queryByRole('button', { name: /salvar/i })).toBeNull();
  });
  it('pauses reads while hidden and clears the previous year before showing another context', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_input, options) => {
      const r = JSON.parse(String(options?.body));
      return Response.json(ready(r.year, 0, { '1:1': `Prova ${r.year}` }));
    });
    vi.stubGlobal('fetch', fetch);
    const view = render(<Demo active={false} />);
    expect(fetch).not.toHaveBeenCalled();
    view.rerender(<Demo active />);
    const field = await screen.findByRole('textbox', { name: 'Avaliação 1 do 1º trimestre' });
    expect((field as HTMLInputElement).value).toBe('Prova 2026');
    view.rerender(<Demo scope={context(2025)} />);
    expect(screen.queryByDisplayValue('Prova 2026')).toBeNull();
    await screen.findByDisplayValue('Prova 2025');
    expect(fetch.mock.calls.every(([, options]) => options?.cache === 'no-store')).toBe(true);
  });
  it('discards a late previous-context response and wipes names on an authorization error', async () => {
    let resolve!: (r: Response) => void;
    const late = new Promise<Response>((r) => {
      resolve = r;
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementationOnce(() => late)
      .mockResolvedValueOnce(Response.json(ready(2025, 0, { '1:1': 'Atual' })))
      .mockResolvedValueOnce(new Response('', { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const scope = context(2025);
    const view = render(<Demo />);
    view.rerender(<Demo scope={scope} />);
    await screen.findByDisplayValue('Atual');
    await act(async () => {
      resolve(Response.json(ready(2026, 0, { '1:1': 'Obsoleto' })));
      await late;
    });
    expect(screen.queryByDisplayValue('Obsoleto')).toBeNull();
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'Avaliação 1 do 1º trimestre' }), '!');
    await waitFor(() => expect(scope.clearAuthorization).toHaveBeenCalledOnce(), { timeout: 2500 });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByDisplayValue('Atual!')).toBeNull();
  });
});
