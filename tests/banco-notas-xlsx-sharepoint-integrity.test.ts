import { beforeEach, describe, expect, it, vi } from 'vitest';

const readOoxmlZipEntries = vi.hoisted(() => vi.fn());

vi.mock('../server/banco-notas/ooxml-zip', () => ({ readOoxmlZipEntries }));

import {
  assertEditedSharePointWorkbookIntegrity,
  assertSharePointWorkbookIntegrity,
} from '../server/banco-notas/xlsx-sharepoint-integrity';

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
      'docProps/core.xml',
      bytes(
        '<cp:coreProperties><dc:title>Banco</dc:title><dc:creator>Banco de Notas</dc:creator></cp:coreProperties>',
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
    'docProps/core.xml',
    bytes(
      '<cp:coreProperties xmlns:extra="server">\r\n<dc:title>Banco</dc:title><dc:creator>Banco de Notas</dc:creator></cp:coreProperties>',
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

function editedEntries(value = '8.5'): Map<string, Uint8Array> {
  return new Map([
    ['[Content_Types].xml', bytes('<Types/>')],
    [
      'xl/workbook.xml',
      bytes(
        '<workbook><sheets><sheet name="Turma Sintética - Matemática" sheetId="1" r:id="rId1"/><sheet name="_BancoNotas" sheetId="2" state="veryHidden" r:id="rId2"/></sheets></workbook>',
      ),
    ],
    [
      'xl/_rels/workbook.xml.rels',
      bytes(
        '<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
      ),
    ],
    [
      'xl/worksheets/sheet1.xml',
      bytes(
        `<worksheet><sheetData><row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>${value}</v></c><c r="D2" t="inlineStr"><is><t>Estudante Sintético</t></is></c></row></sheetData></worksheet>`,
      ),
    ],
    [
      'xl/worksheets/sheet2.xml',
      bytes(
        '<worksheet><sheetData><row r="3"><c r="B3" t="inlineStr"><is><t>71111111-1111-4111-8111-111111111111</t></is></c></row><row r="13"><c r="A13" t="inlineStr"><is><t>generated:sheet</t></is></c><c r="C13" t="inlineStr"><is><t>B2</t></is></c><c r="D13" t="inlineStr"><is><t>2026|grade</t></is></c><c r="E13" t="inlineStr"><is><t>NotaT1</t></is></c></row></sheetData></worksheet>',
      ),
    ],
  ]);
}

const editedExpectation = {
  visibleSheetName: 'Turma Sintética - Matemática',
  metadataSheetName: '_BancoNotas',
  modelId: '71111111-1111-4111-8111-111111111111',
  sheetKey: 'generated:sheet',
  gradeKey: '2026|grade',
  field: 'NotaT1',
  cellAddress: 'B2',
  expectedNumericValue: 8.5,
  studentCellAddress: 'D2',
  studentDisplayName: 'Estudante Sintético',
};

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

  it('accepts an Excel-edited package only when workbook, mapping and value remain exact', async () => {
    readOoxmlZipEntries.mockResolvedValueOnce(editedEntries());

    await expect(
      assertEditedSharePointWorkbookIntegrity(bytes('edited workbook'), editedExpectation),
    ).resolves.toBe('excel_edited');
  });

  it('rejects an Excel-edited package whose mapped grade value differs', async () => {
    readOoxmlZipEntries.mockResolvedValueOnce(editedEntries('9'));

    await expect(
      assertEditedSharePointWorkbookIntegrity(bytes('edited workbook'), editedExpectation),
    ).rejects.toThrow('sharepoint_edited_xlsx_grade_value_mismatch');
  });
});
