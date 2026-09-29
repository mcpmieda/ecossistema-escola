// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  claimPanelHashV1,
  panelHashAccountIdV1,
  readPanelHashParamV1,
  writePanelHashParamsV1,
} from '../../../src/features/student-portal-admin/shared/panel-hash-v1';

const account = '75600000-0000-4000-8000-000000009901';

describe('ADM view kept in the address (owner request 29/09/2026)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState(null, '', '/#/painel-do-aluno?area=accounts');
  });

  it('keeps the area and sets or removes only the given keys, without a history entry', () => {
    const length = window.history.length;
    writePanelHashParamsV1({ turma: '756001', aluno: account });
    expect(window.location.hash).toBe(`#/painel-do-aluno?area=accounts&turma=756001&aluno=${account}`);
    expect(panelHashAccountIdV1('aluno')).toBe(account);
    writePanelHashParamsV1({ aluno: null });
    expect(readPanelHashParamV1('aluno')).toBeNull();
    expect(readPanelHashParamV1('area')).toBe('accounts');
    expect(window.history.length).toBe(length);
  });

  it('accepts only account identifiers', () => {
    writePanelHashParamsV1({ aluno: 'nome do aluno' });
    expect(panelHashAccountIdV1('aluno')).toBeNull();
  });

  it('restores for the same administrator and starts clean for another one', () => {
    claimPanelHashV1('identity-a');
    writePanelHashParamsV1({ turma: '756001', aluno: account });
    claimPanelHashV1('identity-a');
    expect(readPanelHashParamV1('turma')).toBe('756001');
    claimPanelHashV1('identity-b');
    expect(readPanelHashParamV1('turma')).toBeNull();
    expect(readPanelHashParamV1('aluno')).toBeNull();
    expect(readPanelHashParamV1('area')).toBe('accounts');
    expect(window.sessionStorage.getItem('pa-panel-owner-v1')).not.toContain('identity');
  });
});
