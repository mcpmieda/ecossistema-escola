export type WorksheetCellV1 = {
  v?: unknown;
  w?: string;
  f?: string;
  t?: string;
};

export type WorksheetV1 = {
  '!ref'?: string;
  '!fullref'?: string;
  '!data'?: readonly (readonly (WorksheetCellV1 | undefined)[] | undefined)[];
  [address: string]: unknown;
};

export function a1CoordinatesV1(
  address: string,
): { readonly row: number; readonly column: number } | null {
  const match = address.trim().match(/^\$?([A-Z]+)\$?(\d+)$/iu);
  if (!match?.[1] || !match[2]) return null;
  let column = 0;
  for (const character of match[1].toUpperCase()) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }
  const row = Number(match[2]);
  return Number.isSafeInteger(row) && row > 0 && Number.isSafeInteger(column)
    ? { row, column }
    : null;
}

/** Dense sheets are authoritative, including holes: never mix representations. */
export function worksheetCellAtV1(
  sheet: WorksheetV1,
  address: string,
): WorksheetCellV1 | undefined {
  const dense = sheet['!data'];
  if (dense !== undefined) {
    const coordinates = a1CoordinatesV1(address);
    return coordinates ? dense[coordinates.row - 1]?.[coordinates.column - 1] : undefined;
  }
  const value = sheet[address];
  return value && typeof value === 'object' ? (value as WorksheetCellV1) : undefined;
}
