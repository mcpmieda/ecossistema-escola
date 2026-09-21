// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SystemHealthHistoryPanelV1 } from '../../src/platform/system-health-history-panel-v1';
import { setupOperationsDomV1 } from '../student-portal/ui/overview/dom-v1';
import { historyFixtureV1, historyPointV1, HISTORY_NOW_V1 } from './history-fixtures-v1';

let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const fullPage = () => ({ ...historyFixtureV1(), points: Array.from({ length: 48 }, (_, index) => historyPointV1(index)),
  nextBefore: historyPointV1(47).bucketAt });
beforeEach(() => {
  setupOperationsDomV1();
  vi.spyOn(Date, 'now').mockReturnValue(HISTORY_NOW_V1);
  fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function openFirstPage() {
  render(<SystemHealthHistoryPanelV1 onDenied={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver histórico' }));
  const older = await screen.findByRole('button', { name: 'Mais antigos' }, { timeout: 10_000 });
  expect(screen.getAllByRole('rowheader')).toHaveLength(48);
  return older;
}
it.each([
  [48, 'Recuperação observada', 'Intervalo sem confirmação'],
  [49, 'Intervalo sem confirmação', 'Recuperação observada'],
] as const)('classifies the boundary against older point %s and clears it on refresh', async (offset, expected, absent) => {
  fetcher.mockResolvedValueOnce(Response.json(fullPage()))
    .mockResolvedValueOnce(Response.json({ ...historyFixtureV1(), points: [
      { ...historyPointV1(offset), maintenanceState: 'intervention' },
    ] }))
    .mockResolvedValueOnce(Response.json(historyFixtureV1()));
  const older = await openFirstPage();
  expect(screen.queryByText('Recuperação observada')).toBeNull();
  fireEvent.click(older);
  expect(await screen.findByText(expected, {}, { timeout: 10_000 })).toBeTruthy();
  expect(screen.queryByText(absent)).toBeNull();
  // One incoming point plus one retained boundary, not the entire previous page.
  expect(screen.getAllByRole('rowheader')).toHaveLength(2);
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ before: historyPointV1(47).bucketAt }));
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar histórico' }));
  expect(await screen.findByText('Última amostra sem ocorrência nos sinais verificados.')).toBeTruthy();
  expect(screen.getAllByRole('rowheader')).toHaveLength(1);
  expect(screen.queryByText(expected)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it('rejects a page that violates the exclusive cursor, without retaining the previous boundary on failure', async () => {
  fetcher.mockResolvedValueOnce(Response.json(fullPage()))
    .mockResolvedValueOnce(Response.json({ ...historyFixtureV1(), points: [historyPointV1(47)] }));
  fireEvent.click(await openFirstPage());
  expect(await screen.findByText('Histórico indisponível. Não há confirmação de normalidade.')).toBeTruthy();
  expect(screen.queryByRole('grid')).toBeNull();
  expect(screen.queryByText('Recuperação observada')).toBeNull();
});
