import { screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
export async function enterDateV1(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
) {
  const [date, time = '00:00'] = value.split('T');
  const [year, month, day] = date!.split('-');
  const [hour, minute] = time.split(':');
  for (const [part, text] of [
    ['ano', year],
    ['mês', month],
    ['dia', day],
    ['hora', hour],
    ['minuto', minute],
  ]) {
    const segment = screen.getByRole('spinbutton', { name: `${part}, ${label}` });
    await user.click(segment);
    await user.keyboard(text! + '{Tab}');
  }
}
