// @vitest-environment jsdom
import { act, createElement } from 'react';
import { buildPerformanceAnalysisV3 } from '../../../server/gradebook/application/read-models/performance/performance-analysis-v3';
import { projectPerformanceFactsV2, EMPTY_PERFORMANCE_CLOSING_V2 } from '../../../server/gradebook/application/results/relational-performance-facts-v2';
import { performanceAnalysisRequestSchemaV3 } from '../../../shared/gradebook-contracts/performance/performance-analysis-v3';
import { performanceTermComparisonResponseSchemaV4 } from '../../../shared/gradebook-contracts/performance/performance-term-comparison-v4';
import { requestPerformanceAnalysisV3 } from '../../../src/features/gradebook/performance/performance-analysis-client-v3';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GradebookWorkspaceShell } from '../../../src/platform/gradebook-workspace-shell';
import { requestRelationalPerformanceV2 } from '../../../src/features/gradebook/performance/relational-performance-client-v2';
import { performanceResponseMatchesV2, performanceResponseSchemaV2, type PerformanceRequestV2 } from '../../../shared/gradebook-contracts/performance/relational-performance-v2';

const context = { year: 2026, minimumApprovalMilli: 60000, maxCouncilComponents: 2 };
const common = { transportVersion: 2, state: 'ready', context, readAt: '2026-05-01T12:00:00.000Z', authority: 'calculated-preview' };
const offering = { id: 10, subject: { id: 1, label: 'MATEMATICA SINTETICA' }, teacher: { id: 1, label: 'DOCENTE SINTETICO' } };
const cell = { offerId: 10, valueMilli: 24000, maximumMilli: 30000, state: 'complete', level: 'at-or-above', sourceReferenceMilli: 24000, sourceComparison: 'match', recoveryApplicable: false, warningCodes: [] };
const student = { id: 1, name: 'ALUNO SINTETICO', number: 1, status: null, statusLabel: 'Sem situação especial', indicatorEligible: true, councilPrevious: null };
const row = { student, calculatedAnnual: { state: 'in-progress', label: 'EM CURSO', councilEligibility: 'not-applicable' }, formalCouncilDecision: null, cells: [cell] };
const selected = { classGroup: { id: 10, label: 'A1' }, period: 1, mode: 'regular' };
const matrix = { ...common, ...selected, operation: 'matrix', offers: [offering], rows: [row], comparison: { available: false, reason: 'comparability-not-contracted' }, statistics: { classRows: 1, visibleRows: 1, eligibleRows: 1, recoveryUnknownRows: 0, consideredCells: 1, completeCells: 1, noShowCells: 0, incompleteCells: 0, attentionRows: 0 } };
const request: PerformanceRequestV2 = { transportVersion: 2, operation: 'matrix', year: 2026, classId: 10, period: 1, mode: 'regular', statuses: [null, 7] };
const catalog = { ...common, operation: 'classes', statusOptions: [{ value: null, label: 'Sem situação especial' }, { value: 7, label: 'Estava no' }], classes: [{ id: 10, label: 'A1' }], nextOffset: null };
let root: Root | null = null;
let host: HTMLDivElement;
let mock: ReturnType<typeof vi.fn<typeof fetch>>;
let requests: Record<string, unknown>[];
const reply = (data: unknown, status = 200) => Response.json(data, { status });

const animationsDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'getAnimations');
beforeEach(() => {
  Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', (media: string) => ({ media, matches: false, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: () => true }));
  vi.stubGlobal('ResizeObserver', class { observe = vi.fn(); unobserve = vi.fn(); disconnect = vi.fn(); });
  requests = [];
  mock = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>; requests.push(body);
    if (body.operation === 'classes') return reply({ ...catalog, context: { ...context, year: body.year } });
    if (body.operation === 'term-comparison') return reply(comparisonFixture(body));
    if (body.operation === 'analysis') return reply(analysisFixture(body));
    if (body.operation === 'matrix') return reply({ ...matrix, period: body.period, mode: body.mode });
    if (body.operation === 'student-detail') return reply({ ...common, ...selected, operation: 'student-detail', row, offers: [offering], trajectory: [{ offerId: 10, terms: [cell, cell, cell] }] });
    if (body.operation === 'context') return reply({ contractVersion: 2, state: 'ready', operation: 'context', context, counts: { students: 1, classes: 1, teachers: 1, subjects: 1, offers: 1, currentBindings: 1, historicalBindings: 0 } });
    if (body.operation === 'center') return reply({ contractVersion: 2, state: 'ready', operation: 'center', context, center: { entity: { kind: 'student', id: 1, label: student.name }, classInfo: null, studentInfo: { councilPrevious: null }, bindings: [], offers: [], nextOffset: null } });
    throw new Error('unexpected-synthetic-request');
  });
  vi.stubGlobal('fetch', mock);
  host = document.createElement('div'); document.body.appendChild(host);
  window.location.hash = '#/banco-de-notas?area=performance';
});
afterEach(async () => { if (root) await act(async () => { root!.unmount(); }); root = null; host.remove(); vi.unstubAllGlobals(); if (animationsDescriptor) Object.defineProperty(Element.prototype, 'getAnimations', animationsDescriptor); else Reflect.deleteProperty(Element.prototype, 'getAnimations'); });
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); }); }
async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await settle();
  }
  expect(predicate()).toBe(true);
}
async function mount() { root = createRoot(host); await act(async () => { root!.render(createElement(GradebookWorkspaceShell)); }); await settle(); }
async function click(text: string) {
  const button = [...document.querySelectorAll<HTMLElement>('button,[role=tab]')].find((element) => element.textContent === text);
  if (!button) throw new Error(`missing-button:${text}`);
  await act(async () => { button.click(); }); await settle();
}
async function select(label: string, value: string) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const element = document.querySelector(`select[aria-label="${label}"]`) as unknown as HTMLSelectElement | null;
    if (element && !element.disabled && [...element.options].some((option) => option.value === value)) break;
    await settle();
  }
  const select = document.querySelector(`select[aria-label="${label}"]`) as unknown as HTMLSelectElement;
  expect(select).not.toBeNull();
  await act(async () => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); await settle();
}
async function loaded() {
  await mount();
  await select('Turma', '10');
  await waitFor(() => host.textContent?.includes(student.name) === true && requests.some((value) => value.operation === 'analysis'));
}

describe('V2 contract and transport', () => {
  it('validates the real matrix contract and matching scope', () => {
    const parsed = performanceResponseSchemaV2.parse(matrix);
    expect(performanceResponseMatchesV2(request, parsed)).toBe(true);
    expect(performanceResponseMatchesV2({ ...request, year: 2025 }, parsed)).toBe(false);
  });
  it('uses no-store, same-origin and an abort signal', async () => {
    const controller = new AbortController();
    expect(await requestRelationalPerformanceV2(request, controller.signal)).toMatchObject({ state: 'ready' });
    expect(mock).toHaveBeenCalledWith('/api/gradebook/performance', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: controller.signal }));
  });
  it.each([401,403])('normalizes a legacy opaque authorization failure (%i)', async (status) => {
    mock.mockResolvedValueOnce(reply({ transportVersion: 1, state: 'not-authorized' }, status));
    expect(await requestRelationalPerformanceV2(request)).toEqual({ transportVersion: 2, state: 'not-authorized' });
  });
  it.each([{ ...matrix, context: { ...context, year: 2025 } }, { ...matrix, rows: [row,row] }, { ...matrix, offers: [] }, { ...matrix, period: 3 }, { ...matrix, authority: 'official' }])('rejects mismatched, duplicate or falsely official data', async (bad) => {
    mock.mockResolvedValueOnce(reply(bad));
    expect(await requestRelationalPerformanceV2(request)).toMatchObject({ state: 'unavailable' });
  });
  it('does not treat a failing HTTP status with a ready body as success', async () => {
    mock.mockResolvedValueOnce(reply(matrix, 500));
    expect(await requestRelationalPerformanceV2(request)).toMatchObject({ state: 'unavailable' });
  });
});

describe('real shell, shared year and rendered performance journey', () => {
  it('does not preload an academic catalog in Importation', async () => {
    window.location.hash = '#/banco-de-notas'; await mount();
    expect(requests.filter((value) => ['bootstrap','classes','matrix','analysis'].includes(String(value.operation)))).toHaveLength(0);
    expect(host.querySelector('[aria-label="Contexto acadêmico atual"]')).toBeNull();
  });
  it('uses 2026 directly without loading or persisting a year catalogue', async () => {
    await mount();
    await waitFor(() => requests.some((value) => value.operation === 'classes' && value.year === 2026));
    expect(document.querySelector('select[aria-label="Ano letivo do Banco"]')).toBeNull();
    expect(host.querySelector('[aria-label="Contexto acadêmico atual"]')?.textContent).toContain('2026');
    expect(requests.filter((value) => value.operation === 'bootstrap')).toHaveLength(0);
  });
  it('loads shared year, class and matrix, then a student drawer and the existing center', async () => {
    await loaded();
    expect(host.textContent).toContain('Desempenho');
    expect(host.textContent).toContain(student.name);
    expect(host.querySelectorAll('select[aria-label="Ano letivo do Banco"]')).toHaveLength(0);
    await click(student.name);
    expect(document.body.textContent).toContain('Conselho anterior: Não informado');
    expect(requests.filter((value) => value.operation === 'analysis')).toHaveLength(1);
    expect(requests.filter((value) => value.operation === 'student-detail')).toHaveLength(1);
    await click('Ver cadastro nas Centrais');
    for (let attempt = 0; attempt < 100 && !requests.some((value) => value.operation === 'center'); attempt++) await settle();
    await settle();
    expect(window.location.hash).toContain('area=operational');
    expect(host.querySelector('select[aria-label="Ano letivo"]')).toBeNull();
    expect(host.textContent).toContain('Consulta somente leitura');
    expect(requests.some((value) => value.operation === 'center' && value.id === 1 && value.year === 2026)).toBe(true);
  });
  it('reopens the same student after using Centers without discarding the performance matrix', async () => {
    await loaded();
    await click(student.name);
    await click('Ver cadastro nas Centrais');
    for (let attempt = 0; attempt < 100 && !requests.some((value) => value.operation === 'center'); attempt++) await settle();
    await settle();
    mock.mockResolvedValueOnce(reply({ contractVersion: 2, state: 'ready', operation: 'search', context, items: [], nextOffset: null }));
    await click('Pesquisar');
    await click('Desempenho');
    await click(student.name);
    await click('Ver cadastro nas Centrais');
    for (let attempt = 0; attempt < 100 && requests.filter((value) => value.operation === 'center').length < 2; attempt++) await settle();
    expect(requests.filter((value) => value.operation === 'center' && value.id === 1)).toHaveLength(2);
    expect(requests.filter((value) => value.operation === 'analysis')).toHaveLength(1);
    expect(host.textContent).toContain('Aprovação pelo Conselho no ano anterior');
  });
  it('drops a late old-period response rather than replacing the current trimester', async () => {
    await loaded();
    let resolve!: (response: Response) => void;
    mock.mockImplementationOnce(() => new Promise((accept) => { resolve = accept; }));
    await select('Período', '2');
    const pendingSignal = mock.mock.calls.at(-1)?.[1]?.signal;
    await select('Período', '3');
    expect(pendingSignal?.aborted).toBe(true);
    await act(async () => { resolve(reply(analysisFixture({ period: 2 }))); });
    expect((document.querySelector('select[aria-label="Período"]') as unknown as HTMLSelectElement).value).toBe('3');
    expect(requests.filter((value) => value.operation === 'analysis').at(-1)?.period).toBe(3);
  });
  it('clears loaded student data after an authorization loss while keeping 2026 fixed', async () => {
    await loaded(); mock.mockResolvedValueOnce(reply({}, 401));
    await select('Período', '2');
    expect(host.textContent).not.toContain(student.name);
    expect(host.textContent).toContain('Entre novamente');
    expect(document.querySelector('select[aria-label="Ano letivo do Banco"]')).toBeNull();
    expect(host.querySelector('[aria-label="Contexto acadêmico atual"]')?.textContent).toContain('2026');
  });
});

function analysisFixture(extra: Record<string, unknown> = {}) {
  const request = performanceAnalysisRequestSchemaV3.parse({ transportVersion: 3, operation: 'analysis', year: 2026, classId: 10, period: 1, mode: 'regular', statuses: [null,7], lens: 'result', offerId: null, ...extra });
  const base = performanceResponseSchemaV2.parse({ ...matrix, context: { ...context, year: request.year }, period: request.period, mode: request.mode });
  if (base.state !== 'ready' || base.operation !== 'matrix') throw new Error('invalid-synthetic-base');
  const facts = ([1,2,3] as const).flatMap((term) => ([1,2,11] as const).map((slot) => ({term, slot, label: `ATIVIDADE SINTETICA ${slot}`, maximumMilli: slot === 11 ? (term === 3 ? 22000 : 16500) : (term === 3 ? 9000 : 6750), valueMilli: slot === 11 ? 12000 : 6000})));
  return buildPerformanceAnalysisV3(base, new Map([[1, [projectPerformanceFactsV2(10, facts, EMPTY_PERFORMANCE_CLOSING_V2, 60000)]]]), request);
}

function comparisonFixture(extra: Record<string, unknown> = {}) {
  const analysis = analysisFixture({ year: extra.year, classId: extra.classId, period: extra.period, mode: extra.mode,
    statuses: extra.statuses, lens: extra.lens, offerId: null });
  const studentId = analysis.rows[0]!.studentId;
  return performanceTermComparisonResponseSchemaV4.parse({
    transportVersion: 4, operation: 'term-comparison', state: 'ready', authority: 'descriptive-observation',
    basis: 'percentage-points-of-official-maximum', referencePeriod: extra.referencePeriod,
    analysis,
    columns: analysis.columns.map((column) => ({ key: column.key, offerId: column.offerId, label: column.label,
      summary: { comparable: 1, unavailable: 0, groups: { higher: [studentId], equal: [], lower: [], unavailable: [] } } })),
    rows: analysis.rows.map((row) => ({ studentId: row.studentId, values: row.values.map((value) => ({ key: value.key,
      state: 'comparable', currentPercent: value.percent, referencePercent: value.percent! - 10,
      deltaPercentagePoints: 10, relation: 'higher', reason: null })) })),
  });
}

describe('four lenses and analytical investigation V3', () => {
  it('offers only explicit prior-trimester comparisons and renders descriptive percentage-point differences', async () => {
    await loaded();
    expect(document.querySelector('select[aria-label="Comparar com"]')).toBeNull();
    await select('Período', '2');
    await select('Comparar com', '1');
    await waitFor(() => requests.some((value) => value.operation === 'term-comparison'));
    expect(requests.at(-1)).toMatchObject({ transportVersion: 4, operation: 'term-comparison', year: 2026, period: 2, referencePeriod: 1, lens: 'result', offerId: null });
    expect(host.textContent).toContain('T2 comparado ao T1');
    expect(host.textContent).toContain('+10 p.p.');
    expect(host.textContent).toContain('não mede evolução pedagógica');
    expect(host.querySelector('[aria-label="Comparação entre trimestres"] button[aria-label^="Ver avaliações"]')).toBeNull();
    await select('Período', '3');
    const comparison = document.querySelector('select[aria-label="Comparar com"]') as unknown as HTMLSelectElement;
    expect([...comparison.options].map((option) => option.value)).toEqual(['','1','2']);
    await click('Avaliações');
    expect(document.querySelector('select[aria-label="Comparar com"]')).toBeNull();
  });
  it('changes all four lenses with one request per selection, not per student', async () => {
    await loaded();
    await click('Quantitativo');
    await waitFor(() => requests.filter((value) => value.operation === 'analysis').some((value) => value.lens === 'quantitative'));
    expect(host.textContent).toContain('88,9%');
    expect(host.querySelectorAll('[aria-label="Gráfico investigável da lente"]')).toHaveLength(1);
    await click('Qualitativo');
    await waitFor(() => requests.filter((value) => value.operation === 'analysis').some((value) => value.lens === 'qualitative'));
    expect(host.textContent).toContain('72,7%');
    await click('Avaliações');
    expect(requests.filter((r) => r.operation === 'analysis')).toHaveLength(3);
    await select('Componente das avaliações', '10');
    expect(host.textContent).toContain('ATIVIDADE SINTETICA');
    expect(requests.filter((r) => r.operation === 'analysis')).toHaveLength(4);
    await click('Resultado');
    expect(requests.filter((r) => r.operation === 'analysis')).toHaveLength(5);
    expect(host.querySelector('[aria-label="Componente das avaliações"]')).toBeNull();
  });
  it('filters the matrix through a chart, opens denominators and clears without SQL', async () => {
    await loaded(); await select('Faixa do gráfico', 'above');
    const bar = host.querySelector('button[aria-label*="MATEMATICA SINTETICA: 1 de 1"]') as HTMLButtonElement;
    expect(bar).not.toBeNull();
    await act(async () => { bar.click(); }); await settle();
    expect(host.textContent).toContain('Investigando: MATEMATICA SINTETICA');
    await click('Ver mais'); expect(host.textContent).toContain('Mediana proporcional');
    await click('Limpar investigação');
    expect(host.textContent).not.toContain('Investigando: MATEMATICA SINTETICA');
    expect(requests.filter((r) => r.operation === 'analysis')).toHaveLength(1);
  });
  it('discards a late quantitative response after the user selects qualitative', async () => {
    await loaded(); let resolve!: (response: Response) => void;
    mock.mockImplementationOnce(() => new Promise((accept) => { resolve = accept; }));
    await click('Quantitativo'); const signal = mock.mock.calls.at(-1)?.[1]?.signal;
    await click('Qualitativo');
    await waitFor(() => requests.some((value) => value.operation === 'analysis' && value.lens === 'qualitative'));
    expect(signal?.aborted).toBe(true);
    await act(async () => { resolve(reply(analysisFixture({ lens: 'quantitative' }))); });
    expect(host.textContent).toContain('72,7%');
    expect(requests.filter((value) => value.operation === 'analysis').at(-1)?.lens).toBe('qualitative');
  });
  it('uses validated no-store V3 responses and rejects forged groups without throwing', async () => {
    const request = performanceAnalysisRequestSchemaV3.parse({ ...requestV3() });
    const abort = new AbortController();
    expect(await requestPerformanceAnalysisV3(request, abort.signal)).toMatchObject({ state: 'ready' });
    expect(mock).toHaveBeenLastCalledWith('/api/gradebook/performance', expect.objectContaining({ cache: 'no-store', credentials: 'same-origin', signal: abort.signal }));
    const bad = analysisFixture(); bad.rows.push(bad.rows[0]!);
    mock.mockResolvedValueOnce(reply(bad));
    expect(await requestPerformanceAnalysisV3(request)).toEqual({ transportVersion: 3, state: 'unavailable' });
    mock.mockResolvedValueOnce(reply({}, 403));
    expect(await requestPerformanceAnalysisV3(request)).toEqual({ transportVersion: 3, state: 'not-authorized' });
  });
});
function requestV3() { return { ...request, transportVersion: 3, operation: 'analysis', lens: 'result', offerId: null }; }
