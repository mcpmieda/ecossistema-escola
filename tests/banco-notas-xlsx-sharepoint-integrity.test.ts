import { beforeEach, describe, expect, it, vi } from 'vitest';

const readOoxmlZipEntries = vi.hoisted(() => vi.fn());

vi.mock('../server/banco-notas/ooxml-zip', () => ({ readOoxmlZipEntries }));

import { assertSharePointWorkbookIntegrity } from '../server/banco-notas/xlsx-sharepoint-integrity';

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value);

function originalEntries(): Map<string, Uint8Array> {
  return new Map([
    [
      '[Content_Types].xml',
      bytes(
        '<Types><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="workbook"/></Types>',
      ),
    ],
    [
      '_rels/.rels',
      bytes(
        '<Relationships><Relationship Id="rId1" Type="office" Target="xl/workbook.xml"/></Relationships>',
      ),
    ],
    [
      'xl/_rels/workbook.xml.rels',
      bytes(
        '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      ),
    ],
    ['xl/workbook.xml', bytes('<workbook/>')],
    ['xl/worksheets/sheet1.xml', bytes('<worksheet><v>7</v></worksheet>')],
  ]);
}

function normalizedEntries(): Map<string, Uint8Array> {
  const entries = originalEntries();
  entries.set(
    '[Content_Types].xml',
    bytes(
      '<Types><Override PartName="/customXml/itemProps1.xml" ContentType="custom"/><Override PartName="/xl/workbook.xml" ContentType="workbook"/><Default Extension="xml" ContentType="application/xml"/></Types>',
    ),
  );
  entries.set(
    '_rels/.rels',
    bytes(
      '<Relationships><Relationship Id="rId9" Type="custom" Target="customXml/item1.xml"/><Relationship Id="rId7" Type="office" Target="xl/workbook.xml"/></Relationships>',
    ),
  );
  entries.set(
    'xl/_rels/workbook.xml.rels',
    bytes(
      '<Relationships><Relationship Id="rId8" Type="custom" Target="../customXml/item1.xml"/><Relationship Id="rId4" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
  );
  entries.set('customXml/item1.xml', bytes('<properties/>'));
  entries.set('customXml/_rels/item1.xml.rels', bytes('<Relationships/>'));
  entries.set('docProps/custom.xml', bytes('<Properties/>'));
  entries.set('[trash]/0000.dat', bytes('server metadata'));
  return entries;
}

describe('SharePoint XLSX normalization integrity', () => {
  beforeEach(() => readOoxmlZipEntries.mockReset());

  it('accepts exact bytes without parsing the package', async () => {
    const workbook = bytes('same bytes');
    await expect(assertSharePointWorkbookIntegrity(workbook, workbook)).resolves.toBe('exact');
    expect(readOoxmlZipEntries).not.toHaveBeenCalled();
  });

  it('accepts server-managed metadata additions while preserving every product-owned part', async () => {
    readOoxmlZipEntries
      .mockResolvedValueOnce(originalEntries())
      .mockResolvedValueOnce(normalizedEntries());

    await expect(
      assertSharePointWorkbookIntegrity(bytes('original zip'), bytes('normalized zip')),
    ).resolves.toBe('sharepoint_normalized');
  });

  it('rejects changes to a product-owned worksheet', async () => {
    const changed = normalizedEntries();
    changed.set('xl/worksheets/sheet1.xml', bytes('<worksheet><v>8</v></worksheet>'));
    readOoxmlZipEntries.mockResolvedValueOnce(originalEntries()).mockResolvedValueOnce(changed);

    await expect(
      assertSharePointWorkbookIntegrity(bytes('original zip'), bytes('changed zip')),
    ).rejects.toThrow('sharepoint_xlsx_product_part_changed');
  });

  it('rejects unexpected additions inside the workbook namespace', async () => {
    const changed = normalizedEntries();
    changed.set('xl/calcChain.xml', bytes('<calcChain/>'));
    readOoxmlZipEntries.mockResolvedValueOnce(originalEntries()).mockResolvedValueOnce(changed);

    await expect(
      assertSharePointWorkbookIntegrity(bytes('original zip'), bytes('changed zip')),
    ).rejects.toThrow('sharepoint_xlsx_unexpected_part_added');
  });
});
