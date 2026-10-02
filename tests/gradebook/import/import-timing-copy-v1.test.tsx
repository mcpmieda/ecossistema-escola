import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimingDiagnostics } from '../../../src/features/gradebook/import/import-panel';
import { ImportTimingReportV1 } from '../../../src/features/gradebook/import/import-timing-report-v1';
import {
  emptyImportCommitAffectedRowsV1,
  type ImportCommitDiagnosticsV1,
} from '../../../shared/gradebook-contracts/imports/import-commit-diagnostics-v1';

const clipboardDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
let remoteRequest: ReturnType<typeof vi.fn>;

function clipboard(value: { writeText: (text: string) => Promise<void> } | undefined) {
  Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value });
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function report(finished = true, count = 18) {
  const value = new ImportTimingReportV1();
  value.begin(
    1,
    'initial',
    Array.from({ length: count }, (_, index) => index),
  );
  value.record(1, { stage: 'library-wait', sheetJsWaitMs: 3 });
  value.record(1, {
    stage: 'recognition-batch',
    totalMs: 24,
    recognitionCallMs: 21,
    recognitionFinishedAtMs: 24,
    fileCount: count,
    recognizedCount: count,
    failureCount: 0,
  });
  for (let index = 0; index < count; index++) {
    value.record(1, {
      stage: 'recognition-file',
      sourceFileIndex: index,
      fileIndex: index,
      outcome: 'recognized',
      fileReadMs: 1,
      manifestMs: 2,
      recognitionMs: 4,
      fileName: 'sentinela-nome-privado',
      sha256: 'sentinela-hash-privado',
      request: { token: 'sentinela-token-privado', student: 'sentinela-aluno-privado' },
      cause: new Error('sentinela-erro-privado'),
    });
    value.record(1, { stage: 'canonical-local', sourceFileIndex: index, localPreparationMs: 2 });
    value.record(1, {
      stage: 'audit-request',
      sourceFileIndex: index,
      phase: 'initial-observation',
      outcome: 'recorded',
      auditRequestMs: 5,
    });
    value.record(1, { stage: 'academic-dispatch', sourceFileIndex: index });
    value.record(1, {
      stage: 'persist-request',
      sourceFileIndex: index,
      state: 'no-changes',
      persistRequestMs: 7,
    });
  }
  if (finished)
    value.record(1, {
      stage: 'batch-complete',
      outcome: 'completed',
      processedItems: count,
      confirmedRequests: count,
      batchElapsedMs: 80,
    });
  return value;
}

beforeEach(() => {
  remoteRequest = vi.fn();
  vi.stubGlobal('fetch', remoteRequest);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (clipboardDescriptor)
    Object.defineProperty(globalThis.navigator, 'clipboard', clipboardDescriptor);
  else delete (globalThis.navigator as unknown as { clipboard?: Clipboard }).clipboard;
});

describe('relatório de tempo — botão real de cópia', () => {
  it('G-T15: falha ao obter snapshot recebe feedback seguro sem rejeição não tratada', async () => {
    const value = report();
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    clipboard({ writeText });
    const getReport = vi.fn<() => string>(() => {
      throw new Error('sentinela-coletor-privada');
    });
    render(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

    fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Não foi possível'),
    );
    expect(screen.getByRole('status').textContent).not.toContain('sentinela-');
    expect(
      screen.getByRole('button', { name: 'Copiar diagnóstico' }).hasAttribute('disabled'),
    ).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
    expect(remoteRequest).not.toHaveBeenCalled();
  });
  it('G-T01/G-T04/G-T17: copia início, 18 posições e fim do coletor real apesar da cauda limitada', async () => {
    const value = report();
    const getReport = vi.fn(() => value.exportText());
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    clipboard({ writeText });
    const view = render(
      <TimingDiagnostics visible summary={value.summary()} getReport={getReport} />,
    );
    view.rerender(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

    expect(getReport).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
    });

    expect(getReport).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledExactlyOnceWith(value.exportText());
    const copied = JSON.parse(writeText.mock.calls[0]![0]);
    expect(copied).toEqual(value.snapshot());
    expect(copied.runs[0].recognition).toMatchObject({
      stage: 'recognition-batch',
      recognitionCallMs: 21,
    });
    expect(copied.runs[0].files).toHaveLength(18);
    expect(copied.runs[0].files[0].recognition).toMatchObject({
      sourceFileIndex: 0,
      fileReadMs: 1,
    });
    expect(copied.runs[0].final).toMatchObject({ stage: 'batch-complete', confirmedRequests: 18 });
    expect(copied.runs[0].recentEvents).toHaveLength(50);
    expect(copied.runs[0].discardedEvents).toBeGreaterThan(0);
    expect(writeText.mock.calls[0]![0]).not.toContain('sentinela-');
    expect(screen.getByRole('status').textContent).toBe('Diagnóstico copiado.');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(remoteRequest).not.toHaveBeenCalled();
  });

  it.each(['absent', 'rejected', 'synchronous'] as const)(
    'G-T05: Clipboard %s oferece o mesmo snapshot sanitizado para cópia manual',
    async (failure) => {
      const value = report();
      const expected = value.exportText();
      const writeText = vi.fn<(text: string) => Promise<void>>(() => {
        if (failure === 'synchronous') throw new Error('sentinela-clipboard-privado');
        return Promise.reject(new Error('sentinela-clipboard-privado'));
      });
      clipboard(failure === 'absent' ? undefined : { writeText });
      const getReport = vi.fn(() => value.exportText());
      render(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
      });

      expect(getReport).toHaveBeenCalledTimes(1);
      if (failure === 'absent') expect(writeText).not.toHaveBeenCalled();
      else expect(writeText).toHaveBeenCalledExactlyOnceWith(expected);
      expect(screen.getByRole('status').textContent).toContain('Não foi possível copiar.');
      expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
      const manual = screen.getByRole('textbox', {
        name: 'Diagnóstico para cópia manual',
      }) as HTMLTextAreaElement;
      expect(manual.readOnly).toBe(true);
      expect(manual.value).toBe(expected);
      expect(manual.value).not.toContain('sentinela-');
      expect(
        screen.getByRole('button', { name: 'Copiar diagnóstico' }).hasAttribute('disabled'),
      ).toBe(false);
      expect(remoteRequest).not.toHaveBeenCalled();
    },
  );

  it('G-T06: aguarda confirmação do Clipboard e copia snapshot em andamento com fim ausente', async () => {
    const value = report(false, 2);
    const pending = deferred();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => pending.promise);
    clipboard({ writeText });
    const getReport = vi.fn(() => value.exportText());
    const view = render(
      <TimingDiagnostics visible summary={value.summary()} getReport={getReport} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));

    expect(screen.getByRole('status').textContent).toBe('Copiando diagnóstico…');
    expect(
      screen.getByRole('button', { name: 'Copiar diagnóstico' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText('Em andamento')).toBeDefined();
    expect(JSON.parse(writeText.mock.calls[0]![0]).runs[0]).toMatchObject({
      status: 'in-progress',
      final: null,
    });
    value.record(1, { stage: 'batch-complete', outcome: 'completed', processedItems: 2 });
    view.rerender(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);
    expect(getReport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status').textContent).toBe('Copiando diagnóstico…');

    await act(async () => {
      pending.resolve();
      await pending.promise;
    });

    expect(screen.getByRole('status').textContent).toBe('Diagnóstico copiado.');
    expect(JSON.parse(writeText.mock.calls[0]![0]).runs[0].final).toBeNull();
    expect(remoteRequest).not.toHaveBeenCalled();
  });

  it('G-T05/G-T06: rejeição tardia mantém o snapshot do clique, mesmo após o lote finalizar', async () => {
    const value = report(false, 2);
    const pending = deferred();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => pending.promise);
    clipboard({ writeText });
    const getReport = vi.fn(() => value.exportText());
    const expected = value.exportText();
    const view = render(
      <TimingDiagnostics visible summary={value.summary()} getReport={getReport} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
    value.record(1, { stage: 'batch-complete', outcome: 'completed' });
    view.rerender(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

    await act(async () => {
      pending.reject(new Error('sentinela-rejeicao-privada'));
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toContain('Não foi possível copiar.');
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe(expected);
    expect(
      JSON.parse((screen.getByRole('textbox') as HTMLTextAreaElement).value).runs[0].final,
    ).toBeNull();
    expect(getReport).toHaveBeenCalledTimes(1);
    expect(remoteRequest).not.toHaveBeenCalled();
  });

  it('G-T11/G-T20: informa descarte da cauda, retomadas omitidas e cobertura parcial', () => {
    const value = report();
    value.begin(2, 'resume', [17]);
    value.record(2, { stage: 'batch-complete', outcome: 'auth-required' });
    value.begin(3, 'resume', [17]);
    value.record(3, { stage: 'batch-complete', outcome: 'confirmation-required' });
    value.begin(4, 'resume', [17]);
    value.failure(4);
    value.record(4, { stage: 'batch-complete', outcome: 'auth-required' });
    const getReport = vi.fn(() => value.exportText());

    render(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

    expect(screen.getByText(/Pausado · Diagnóstico parcial/u).textContent).toContain(
      `${value.summary().discardedEvents} eventos recentes descartados`,
    );
    expect(screen.getByText(/Pausado · Diagnóstico parcial/u).textContent).toContain(
      '2 retomadas intermediárias omitidas',
    );
    expect(screen.getByText(/Tempos e contagens ficam somente em memória/u).textContent).toContain(
      'recarregar ou fechar a tela apaga o histórico',
    );
    expect(getReport).not.toHaveBeenCalled();
  });

  it.each(['resolve', 'reject'] as const)(
    'G-T13: Clipboard %s após unmount não reaparece nem envia pedido remoto',
    async (outcome) => {
      const value = report();
      const pending = deferred();
      const writeText = vi.fn<(text: string) => Promise<void>>(() => pending.promise);
      clipboard({ writeText });
      const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const getReport = vi.fn(() => value.exportText());
      const view = render(
        <TimingDiagnostics visible summary={value.summary()} getReport={getReport} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
      view.unmount();

      await act(async () => {
        if (outcome === 'resolve') pending.resolve();
        else pending.reject(new Error('sentinela-clipboard-unmount'));
        await Promise.resolve();
      });

      expect(view.container.textContent).toBe('');
      expect(errorLog).not.toHaveBeenCalled();
      expect(getReport).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(remoteRequest).not.toHaveBeenCalled();
    },
  );

  it('G-T12: resposta tardia do Clipboard anterior não altera o diagnóstico do novo lote', async () => {
    const value = report();
    const pending = deferred();
    clipboard({ writeText: vi.fn<(text: string) => Promise<void>>(() => pending.promise) });
    const getReport = vi.fn(() => value.exportText());
    const view = render(
      <TimingDiagnostics visible summary={value.summary()} getReport={getReport} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
    value.begin(2, 'initial', [0]);
    view.rerender(<TimingDiagnostics visible summary={value.summary()} getReport={getReport} />);

    await act(async () => {
      pending.reject(new Error('sentinela-clipboard-lote-anterior'));
      await Promise.resolve();
    });

    expect(screen.getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Em andamento')).toBeDefined();
    expect(getReport).toHaveBeenCalledTimes(1);
    expect(remoteRequest).not.toHaveBeenCalled();
  });
});

describe('Adendo I confirmed direct-write categories in the text actually copied', () => {
  it('retains the seventh original position after tail eviction and copies only bounded validated counts', async () => {
    const value = report(false, 18);
    const rows = emptyImportCommitAffectedRowsV1();
    rows.disciplina.update = 1;
    const diagnostic: ImportCommitDiagnosticsV1 = {
      version: 1,
      scope: 'direct-import-statements',
      coverage: 'complete',
      transaction: 'committed',
      attempted: rows,
      confirmed: rows,
      unmeasuredStatements: 0,
      excludedEffects: 'sql-functions-triggers-portal',
    };
    value.record(1, { stage: 'persist-request', commitDiagnostics: diagnostic }, 6);
    for (let index = 0; index < 501; index++)
      value.record(1, { stage: 'audit-request' }, index % 18);
    value.record(1, { stage: 'batch-complete', outcome: 'completed' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    clipboard({ writeText });
    render(
      <TimingDiagnostics visible summary={value.summary()} getReport={() => value.exportText()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Copiar diagnóstico' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = writeText.mock.calls[0]![0] as string;
    const copied = JSON.parse(text);
    expect(copied.runs[0].files[6].sourceFileIndex).toBe(6);
    expect(copied.runs[0].files[6].commitDiagnostics).toEqual(diagnostic);
    expect(copied.runs[0].files[6].commitDiagnostics.confirmed.nota).toEqual({
      insert: 0,
      update: 0,
      delete: 0,
    });
    expect(copied.runs[0].recentEvents).toHaveLength(50);
    expect(copied.runs[0].coverage.commitDiagnosticsMeasured).toBe(1);
    expect(text).not.toContain('sentinela');
    expect(remoteRequest).not.toHaveBeenCalled();
    // The optional diagnostic is detached on collection and on export.
    rows.disciplina.update = 888;
    expect(
      value.snapshot().runs[0]!.files[6]!.commitDiagnostics!.confirmed!.disciplina.update,
    ).toBe(1);
  });

  it('keeps absent/invalid diagnostics unavailable instead of fabricating zero or leaking nested fields', () => {
    const value = report(false, 18);
    value.record(
      1,
      {
        stage: 'persist-request',
        commitDiagnostics: { password: 'PRIVATE-I-SENTINEL', confirmed: { nota: 0 } },
      },
      6,
    );
    expect(value.snapshot().runs[0]!.files[6]!.commitDiagnostics).toBeNull();
    expect(value.exportText()).not.toContain('PRIVATE-I-SENTINEL');
    expect(value.snapshot().runs[0]!.files[0]!.commitDiagnostics).toBeNull();
  });
});
