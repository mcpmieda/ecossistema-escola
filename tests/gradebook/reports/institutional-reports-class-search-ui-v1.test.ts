import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstitutionalReportsClassSearchV1 } from '../../../src/features/gradebook/reports/institutional-reports-page';

describe('Institutional reports class search composition V1', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = false;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('mantém Buscar e Limpar pesquisa como ações HeroUI distintas', async () => {
    const onSearch = vi.fn();
    const onQueryChange = vi.fn();
    await act(async () => {
      root.render(
        createElement(InstitutionalReportsClassSearchV1, {
          label: 'Pesquisar turma',
          placeholder: 'Código da turma',
          query: 'SINT7B',
          disabled: false,
          loading: false,
          onQueryChange,
          onSearch,
        }),
      );
    });

    const buttons = [...container.querySelectorAll('button')];
    const search = buttons.find((button) => button.textContent?.trim() === 'Buscar');
    const clear = buttons.find((button) => button !== search);

    expect(search).toBeDefined();
    expect(search?.type).toBe('button');
    expect(search?.getAttribute('aria-label')).not.toBe('Limpar pesquisa');
    expect(clear).toBeDefined();
    expect(clear).not.toBe(search);
    expect(clear?.getAttribute('aria-label')).toBeTruthy();
    expect(clear?.textContent?.trim()).not.toBe('Buscar');

    await act(async () => search?.click());
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onQueryChange).not.toHaveBeenCalled();

    await act(async () => clear?.click());
    expect(onQueryChange).toHaveBeenCalledWith('');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
