// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DurationEditorV1,
  durationLabelV1,
} from '../../../../src/features/student-portal-admin/settings/security-duration-v1';
import { setupOperationsDomV1 } from '../overview/dom-v1';
beforeEach(setupOperationsDomV1);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('displays units clearly without rounding an existing custom interval', () => {
  expect(durationLabelV1(2592000)).toBe('30 dias');
  expect(durationLabelV1(43200)).toBe('12 h');
  expect(durationLabelV1(905)).toBe('15 min 5 s');
});
it('offers only contract-safe intervals and converts the selected human duration back to exact seconds', async () => {
  function Demo() {
    const [value, set] = useState('905');
    return (
      <>
        <DurationEditorV1
          label="Tempo de bloqueio"
          value={value}
          min={60}
          max={86400}
          disabled={false}
          onChange={set}
        />
        <output>{value}</output>
      </>
    );
  }
  render(<Demo />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '15 min 5 s Tempo de bloqueio' }));
  expect(screen.getByRole('option', { name: '15 min 5 s' })).toBeTruthy();
  expect(screen.queryByRole('option', { name: '30 s' })).toBeNull();
  expect(screen.queryByRole('option', { name: '30 dias' })).toBeNull();
  await user.click(screen.getByRole('option', { name: '30 min' }));
  expect(document.querySelector('output')?.textContent).toBe('1800');
});
