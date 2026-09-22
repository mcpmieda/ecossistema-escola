import { act, screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
export async function enterDateV1(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [date, time = '00:00'] = value.split('T');
  const [year, month, day] = date!.split('-');
  const [hour, minute] = time.split(':');
  const first = screen.getByRole('spinbutton', { name: `ano, ${label}` });
  const field = first.closest('[role="group"]') ?? first.parentElement!;
  for (const [part, text] of [
    ['ano', year],
    ['mês', month],
    ['dia', day],
    ['hora', hour],
    ['minuto', minute],
  ]) {
    const segment = within(field as HTMLElement).getByRole('spinbutton', {
      name: `${part}, ${label}`,
    });
    act(() => segment.focus());
    await user.keyboard(text! + '{Tab}');
  }
}
