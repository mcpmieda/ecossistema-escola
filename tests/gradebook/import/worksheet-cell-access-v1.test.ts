import { describe, expect, it } from 'vitest';
import {
  a1CoordinatesV1,
  worksheetCellAtV1,
  type WorksheetCellV1,
  type WorksheetV1,
} from '../fixtures/worksheet-cell-access-v1';

describe('acesso às células esparsas/densas — H-R01–03', () => {
  it.each([
    ['A1', 1, 1],
    ['R7', 7, 18],
    ['AA8', 8, 27],
    ['AN50', 50, 40],
    ['AZ48', 48, 52],
    ['$AA$8', 8, 27],
    [' az48 ', 48, 52],
  ])('decodifica %s sem deslocar a base', (address, row, column) => {
    expect(a1CoordinatesV1(String(address))).toStrictEqual({ row, column });
  });

  it.each([
    '',
    'A0',
    'A-1',
    '1A',
    'A1:B2',
    '$$A1',
    'A1.5',
    'A9007199254740992',
    'ZZZZZZZZZZZZZZZZ1',
  ])('recusa endereço inválido %s', (address) => expect(a1CoordinatesV1(address)).toBeNull());

  it.each([
    ['A1', 0, 0],
    ['R7', 6, 17],
    ['AA8', 7, 26],
    ['AN50', 49, 39],
    ['AZ48', 47, 51],
  ] as const)('devolve o mesmo objeto em %s', (address, row, column) => {
    const cell = { t: 'n', v: 0, f: 'SUM(A2:A3)', w: '0,00' };
    const rows: Array<Array<WorksheetCellV1 | undefined> | undefined> = [];
    rows[row] = [];
    rows[row]![column] = cell;
    const sparse: WorksheetV1 = { [address]: cell };
    const dense: WorksheetV1 = { '!data': rows };
    expect(worksheetCellAtV1(sparse, address)).toBe(cell);
    expect(worksheetCellAtV1(dense, address)).toBe(cell);
    expect(cell).toStrictEqual({ t: 'n', v: 0, f: 'SUM(A2:A3)', w: '0,00' });
  });

  it('mantém linhas ausentes, buracos, undefined explícito e objetos sem v', () => {
    const rows: Array<Array<WorksheetCellV1 | undefined> | undefined> = [];
    const noValue: WorksheetCellV1 = { f: 'A1+1', w: '#N/A' };
    const explicitUndefined: WorksheetCellV1 = { v: undefined };
    rows[6] = [];
    rows[6]![17] = noValue;
    rows[6]![18] = undefined;
    rows[6]![19] = explicitUndefined;
    const dense: WorksheetV1 = { '!data': rows };
    expect(worksheetCellAtV1(dense, 'R6')).toBeUndefined();
    expect(worksheetCellAtV1(dense, 'Q7')).toBeUndefined();
    expect(worksheetCellAtV1(dense, 'S7')).toBeUndefined();
    expect(worksheetCellAtV1(dense, 'R7')).toBe(noValue);
    expect(worksheetCellAtV1(dense, 'T7')).toBe(explicitUndefined);
    expect(Object.hasOwn(noValue, 'v')).toBe(false);
    expect(Object.hasOwn(explicitUndefined, 'v')).toBe(true);
    expect(5 in rows).toBe(false);
    expect(16 in rows[6]!).toBe(false);
    expect(18 in rows[6]!).toBe(true);
  });

  it('a representação densa é autoritativa inclusive para buracos', () => {
    const actual = { t: 'n', v: 0 };
    const dense: WorksheetV1 = {
      '!data': [[actual]],
      A1: { v: 99 },
      R7: { v: 88 },
      AZ48: { v: 77 },
    };
    expect(worksheetCellAtV1(dense, 'A1')).toBe(actual);
    expect(worksheetCellAtV1(dense, 'R7')).toBeUndefined();
    expect(worksheetCellAtV1(dense, 'AZ48')).toBeUndefined();
    expect(worksheetCellAtV1({ '!data': [], A1: { v: 99 } }, 'A1')).toBeUndefined();
  });

  it.each([
    { t: 'n', v: 0 },
    { t: 'n', v: 0.1 },
    { t: 'n', v: -1 },
    { t: 's', v: '7,25' },
    { t: 'n', v: 0, f: 'SUM(A2:A3)' },
    { t: 'n', f: 'SUM(A2:A3)' },
    { t: 'e', v: 7, w: '#DIV/0!' },
    { t: 'str', v: '', f: 'IF(A2=0,"",A2)' },
    { t: 'b', v: false },
  ])('não interpreta nem normaliza a célula %j', (cell) => {
    const sparse: WorksheetV1 = { A1: cell };
    const dense: WorksheetV1 = { '!data': [[cell]] };
    const before = structuredClone(cell);
    expect(worksheetCellAtV1(sparse, 'A1')).toBe(cell);
    expect(worksheetCellAtV1(dense, 'A1')).toBe(cell);
    expect(cell).toStrictEqual(before);
  });

  it('não interpreta uma propriedade esparsa de metadados como célula', () => {
    const sheet: WorksheetV1 = { '!ref': 'A1:AZ48', A1: 'texto', B1: undefined };
    expect(worksheetCellAtV1(sheet, '!ref')).toBeUndefined();
    expect(worksheetCellAtV1(sheet, 'A1')).toBeUndefined();
    expect(worksheetCellAtV1(sheet, 'B1')).toBeUndefined();
  });
});
