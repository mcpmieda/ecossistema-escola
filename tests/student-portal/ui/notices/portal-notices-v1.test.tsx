import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createPortalStatusClientV1,
  PortalClosedNoticeV1,
  PortalSignedInNoticesV1,
  usePortalNoticesV1,
  type PortalStatusClientV1,
} from '../../../../src/features/student-portal/shell/portal-notices-v1';
import type { PortalNoticesV1 } from '../../../../shared/student-portal-contracts/notices-v1';

const base: PortalNoticesV1 = {
  access: 'open',
  accessOpensAt: null,
  gradesReleaseAt: null,
  disclosureEnded: null,
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.clear();
});

it('reads notices only from the fixed status route', async () => {
  const fetcher = vi.fn(
    async (_path: string, _init: RequestInit) =>
      new Response(
        JSON.stringify({
          contractVersion: 1,
          requestId: '00000000-0000-4000-8000-000000000001',
          state: 'status',
          scope: 'school',
          serverNow: '2026-10-01T15:00:00.000Z',
          notices: base,
        }),
        { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
      ),
  );
  const response = await createPortalStatusClientV1({ fetch: fetcher })();
  expect(response.notices).toEqual(base);
  expect(fetcher.mock.calls[0]![0]).toBe('/api/student/status');
  expect(fetcher.mock.calls[0]![1].method).toBe('GET');
});

it('closes the login with a countdown and asks for a refresh at zero', () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-01T12:00:00-03:00') });
  render(
    <PortalClosedNoticeV1
      notices={{ ...base, access: 'closed', gradesReleaseAt: '2026-10-02T13:01:05-03:00' }}
    />,
  );
  expect(screen.getByText('Portal fechado no momento')).toBeTruthy();
  expect(screen.getByText(/Notas liberadas em 02\/10 às 13:01/u)).toBeTruthy();
  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
    'Faltam 1 dia, 1 hora e 1 minuto',
  );
  expect(screen.queryByRole('button', { name: /QR/u })).toBeNull();
  act(() => {
    vi.advanceTimersByTime(25 * 3600_000 + 65_000);
  });
  expect(screen.getByText('As notas foram liberadas!')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Atualizar página' })).toBeTruthy();
});

it('falls back to the opening date when no release date is set', () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-01T12:00:00-03:00') });
  render(
    <PortalClosedNoticeV1
      notices={{ ...base, access: 'closed', accessOpensAt: '2026-10-05T07:00:00-03:00' }}
    />,
  );
  expect(screen.getByText(/O Portal abre em 05\/10 às 07:00/u)).toBeTruthy();
});

it('shows the release countdown only while the student has no grades', () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-01T12:00:00-03:00') });
  const notices = { ...base, gradesReleaseAt: '2026-10-02T12:00:00-03:00' };
  const view = render(<PortalSignedInNoticesV1 notices={notices} hasGrades={false} />);
  expect(screen.getByRole('timer')).toBeTruthy();
  view.rerender(<PortalSignedInNoticesV1 notices={notices} hasGrades />);
  expect(screen.queryByRole('timer')).toBeNull();
});

it('remembers "Entendi" on this device for that closing only', () => {
  const ended = { period: 'T2' as const, at: '2026-09-20T18:00:00-03:00' };
  const view = render(
    <PortalSignedInNoticesV1 notices={{ ...base, disclosureEnded: ended }} hasGrades />,
  );
  expect(screen.getByText(/notas do 2º trimestre foi encerrada em 20\/09 às 18:00/u)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
  expect(screen.queryByText('Lançamento de notas encerrado')).toBeNull();
  view.unmount();
  render(<PortalSignedInNoticesV1 notices={{ ...base, disclosureEnded: ended }} hasGrades />);
  expect(screen.queryByText('Lançamento de notas encerrado')).toBeNull();
  cleanup();
  render(
    <PortalSignedInNoticesV1
      notices={{ ...base, disclosureEnded: { period: 'T3', at: '2026-12-10T18:00:00-03:00' } }}
      hasGrades
    />,
  );
  expect(screen.getByText('Lançamento de notas encerrado')).toBeTruthy();
});

// Last on purpose: it teaches the module the server clock for the rest of the file.
it('counts down on the server clock, not on a wrong phone clock', async () => {
  vi.useFakeTimers({ now: Date.parse('2026-10-01T12:00:00-03:00') });
  const read: PortalStatusClientV1 = () =>
    Promise.resolve({
      contractVersion: 1,
      requestId: '00000000-0000-4000-8000-000000000001',
      state: 'status',
      scope: 'school',
      // The phone is 10 minutes behind the server.
      serverNow: '2026-10-01T12:10:00-03:00',
      notices: { ...base, access: 'closed', gradesReleaseAt: '2026-10-01T12:20:00-03:00' },
    });
  function Probe() {
    const notices = usePortalNoticesV1(read, 'anonymous')?.value;
    return notices ? <PortalClosedNoticeV1 notices={notices} /> : null;
  }
  render(<Probe />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByRole('timer').getAttribute('aria-label')).toBe(
    'Faltam 0 dias, 0 horas e 10 minutos',
  );
});
