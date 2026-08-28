import {
  genericModelInstanceSchema,
  type GenericModelInstance,
} from '../../shared/banco-notas-generic-model';
import {
  genericWorkbookPresentationSchema,
  type GenericWorkbookPresentation,
} from '../../shared/banco-notas-workbook-presentation';
import type { GenericWorkbookSerializer } from './workbook-pipeline';

const encoder = new TextEncoder();
const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;
const METADATA_SHEET_NAME = '_BancoNotas';

function xml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function inlineCell(address: string, value: string, style = 0): string {
  return `<c r="${address}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}

function numberCell(address: string, value: number): string {
  return `<c r="${address}"><v>${value}</v></c>`;
}

function columnNumber(column: string): number {
  let value = 0;
  for (const char of column) value = value * 26 + char.charCodeAt(0) - 64;
  return value;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number): Uint8Array {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

type ZipEntry = { name: string; content: string };

function storedZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  // Fixed DOS timestamp keeps serialization deterministic.
  const dosTime = 0;
  const dosDate = (1 << 5) | 1; // 1980-01-01

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const checksum = crc32(data);
    const local = join([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(data.byteLength),
      uint32(data.byteLength),
      uint16(name.byteLength),
      uint16(0),
      name,
      data,
    ]);
    locals.push(local);

    const central = join([
      uint32(0x02014b50),
      uint16(20),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(dosTime),
      uint16(dosDate),
      uint32(checksum),
      uint32(data.byteLength),
      uint32(data.byteLength),
      uint16(name.byteLength),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(localOffset),
      name,
    ]);
    centrals.push(central);
    localOffset += local.byteLength;
  }

  const localBytes = join(locals);
  const centralBytes = join(centrals);
  const end = join([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralBytes.byteLength),
    uint32(localBytes.byteLength),
    uint16(0),
  ]);
  return join([localBytes, centralBytes, end]);
}

function assertPresentationMatchesInstance(
  instance: GenericModelInstance,
  presentation: GenericWorkbookPresentation,
): void {
  if (presentation.modelId !== instance.modelId)
    throw new Error('xlsx_presentation_model_mismatch');
  if (presentation.schoolYear !== instance.schoolYear)
    throw new Error('xlsx_presentation_year_mismatch');
  if (instance.mappings.length === 0) throw new Error('xlsx_instance_has_no_mappings');

  const gradeColumns = new Set(instance.layout.gradeColumns.map((item) => item.column));
  if (gradeColumns.has(presentation.studentPositionColumn)) {
    throw new Error('xlsx_position_column_collides_with_grade_layout');
  }
  if (gradeColumns.has(presentation.studentNameColumn)) {
    throw new Error('xlsx_student_column_collides_with_grade_layout');
  }

  const layoutFields = new Set(instance.layout.gradeColumns.map((item) => item.field));
  const headerFields = new Set(presentation.gradeHeaders.map((item) => item.field));
  if (
    layoutFields.size !== headerFields.size ||
    [...layoutFields].some((field) => !headerFields.has(field))
  ) {
    throw new Error('xlsx_grade_headers_do_not_match_layout');
  }

  const expectedSheetKeys = new Set(instance.mappings.map((mapping) => mapping.sheetKey));
  const presentedSheetKeys = new Set(presentation.sheets.map((sheet) => sheet.sheetKey));
  if (
    expectedSheetKeys.size !== presentedSheetKeys.size ||
    [...expectedSheetKeys].some((sheetKey) => !presentedSheetKeys.has(sheetKey))
  ) {
    throw new Error('xlsx_presentation_sheets_do_not_match_instance');
  }

  const sheets = new Map(presentation.sheets.map((sheet) => [sheet.sheetKey, sheet]));
  const referencedRows = new Set<string>();
  for (const mapping of instance.mappings) {
    const sheet = sheets.get(mapping.sheetKey);
    const row = sheet?.rows.find(
      (candidate) => candidate.studentPosition === mapping.studentPosition,
    );
    if (!row || row.gradeKey !== mapping.gradeKey) {
      throw new Error('xlsx_presentation_roster_does_not_match_mapping');
    }
    referencedRows.add(`${mapping.sheetKey}::${mapping.studentPosition}`);
  }

  for (const sheet of presentation.sheets) {
    for (const row of sheet.rows) {
      if (!referencedRows.has(`${sheet.sheetKey}::${row.studentPosition}`)) {
        throw new Error('xlsx_presentation_contains_unmapped_roster_row');
      }
    }
  }
}

function worksheetXml(args: {
  instance: GenericModelInstance;
  presentation: GenericWorkbookPresentation;
  sheet: GenericWorkbookPresentation['sheets'][number];
}): string {
  const headerRow = args.instance.layout.firstStudentRow - 1;
  const gradeHeader = new Map(
    args.presentation.gradeHeaders.map((item) => [item.field, item.label]),
  );
  const headerCells = [
    {
      column: args.presentation.studentPositionColumn,
      content: inlineCell(
        `${args.presentation.studentPositionColumn}${headerRow}`,
        args.presentation.positionHeader,
        1,
      ),
    },
    {
      column: args.presentation.studentNameColumn,
      content: inlineCell(
        `${args.presentation.studentNameColumn}${headerRow}`,
        args.presentation.studentHeader,
        1,
      ),
    },
    ...args.instance.layout.gradeColumns.map((item) => ({
      column: item.column,
      content: inlineCell(
        `${item.column}${headerRow}`,
        gradeHeader.get(item.field) ?? item.field,
        1,
      ),
    })),
  ]
    .sort((left, right) => columnNumber(left.column) - columnNumber(right.column))
    .map((item) => item.content);

  const rows = args.sheet.rows
    .slice()
    .sort((left, right) => left.studentPosition - right.studentPosition)
    .map((student) => {
      const rowNumber = args.instance.layout.firstStudentRow + student.studentPosition - 1;
      return `<row r="${rowNumber}">${numberCell(`${args.presentation.studentPositionColumn}${rowNumber}`, student.studentPosition)}${inlineCell(`${args.presentation.studentNameColumn}${rowNumber}`, student.studentDisplayName)}</row>`;
    });

  const gradeColumnNumbers = args.instance.layout.gradeColumns.map((item) =>
    columnNumber(item.column),
  );
  const positionColumn = columnNumber(args.presentation.studentPositionColumn);
  const nameColumn = columnNumber(args.presentation.studentNameColumn);
  const columnDefinitions = [
    { column: positionColumn, width: 8 },
    { column: nameColumn, width: 32 },
    ...gradeColumnNumbers.map((column) => ({ column, width: 12 })),
  ]
    .sort((left, right) => left.column - right.column)
    .map(
      ({ column, width }) =>
        `<col min="${column}" max="${column}" width="${width}" customWidth="1"/>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${columnDefinitions}</cols><sheetData><row r="${headerRow}">${headerCells.join('')}</row>${rows.join('')}</sheetData></worksheet>`;
}

function metadataWorksheetXml(
  instance: GenericModelInstance,
  presentation: GenericWorkbookPresentation,
): string {
  const sheetNames = new Map(
    presentation.sheets.map((sheet) => [sheet.sheetKey, sheet.displayName]),
  );
  const metadataRows: string[] = [
    `<row r="1">${inlineCell('A1', 'Banco de Notas metadata', 1)}</row>`,
    `<row r="2">${inlineCell('A2', 'schemaVersion')}${numberCell('B2', 1)}</row>`,
    `<row r="3">${inlineCell('A3', 'modelId')}${inlineCell('B3', instance.modelId)}</row>`,
    `<row r="4">${inlineCell('A4', 'schoolYear')}${numberCell('B4', instance.schoolYear)}</row>`,
    `<row r="5">${inlineCell('A5', 'definitionVersion')}${inlineCell('B5', instance.definitionVersion)}</row>`,
    `<row r="6">${inlineCell('A6', 'layoutVersion')}${inlineCell('B6', instance.layout.layoutVersion)}</row>`,
    `<row r="7">${inlineCell('A7', 'mappingVersion')}${numberCell('B7', instance.mappingVersion)}</row>`,
    `<row r="8">${inlineCell('A8', 'presentationVersion')}${inlineCell('B8', presentation.presentationVersion)}</row>`,
    `<row r="9">${inlineCell('A9', 'sourceHash')}${inlineCell('B9', instance.sourceHash)}</row>`,
    `<row r="10">${inlineCell('A10', 'relationshipSnapshotId')}${inlineCell('B10', instance.relationshipSnapshotId)}</row>`,
    `<row r="12">${inlineCell('A12', 'sheetKey', 1)}${inlineCell('B12', 'sheetName', 1)}${inlineCell('C12', 'cellAddress', 1)}${inlineCell('D12', 'gradeKey', 1)}${inlineCell('E12', 'field', 1)}${inlineCell('F12', 'studentPosition', 1)}</row>`,
  ];

  instance.mappings
    .slice()
    .sort((left, right) => {
      const sheetOrder = left.sheetKey.localeCompare(right.sheetKey);
      if (sheetOrder !== 0) return sheetOrder;
      const positionOrder = left.studentPosition - right.studentPosition;
      if (positionOrder !== 0) return positionOrder;
      return left.field.localeCompare(right.field);
    })
    .forEach((mapping, index) => {
      const row = 13 + index;
      metadataRows.push(
        `<row r="${row}">${inlineCell(`A${row}`, mapping.sheetKey)}${inlineCell(`B${row}`, sheetNames.get(mapping.sheetKey) ?? '')}${inlineCell(`C${row}`, mapping.cellAddress)}${inlineCell(`D${row}`, mapping.gradeKey)}${inlineCell(`E${row}`, mapping.field)}${numberCell(`F${row}`, mapping.studentPosition)}</row>`,
      );
    });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${metadataRows.join('')}</sheetData></worksheet>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function workbookEntries(
  instance: GenericModelInstance,
  presentation: GenericWorkbookPresentation,
): ZipEntry[] {
  const visibleSheets = presentation.sheets
    .slice()
    .sort((a, b) => a.sheetKey.localeCompare(b.sheetKey));
  const allSheets = [...visibleSheets.map((sheet) => sheet.displayName), METADATA_SHEET_NAME];
  const sheetOverrides = allSheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const workbookSheets = allSheets
    .map((name, index) => {
      const state = name === METADATA_SHEET_NAME ? ' state="veryHidden"' : '';
      return `<sheet name="${xml(name)}" sheetId="${index + 1}"${state} r:id="rId${index + 1}"/>`;
    })
    .join('');
  const workbookRelationships = allSheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join('');
  const stylesRelationshipId = `rId${allSheets.length + 1}`;

  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetOverrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    },
    {
      name: '_rels/.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    },
    {
      name: 'docProps/core.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(presentation.title)}</dc:title><dc:creator>Banco de Notas</dc:creator></cp:coreProperties>`,
    },
    {
      name: 'docProps/app.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Banco de Notas</Application><AppVersion>1.0</AppVersion></Properties>`,
    },
    {
      name: 'xl/workbook.xml',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${workbookSheets}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${workbookRelationships}<Relationship Id="${stylesRelationshipId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', content: stylesXml() },
  ];

  visibleSheets.forEach((sheet, index) => {
    entries.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      content: worksheetXml({ instance, presentation, sheet }),
    });
  });
  entries.push({
    name: `xl/worksheets/sheet${visibleSheets.length + 1}.xml`,
    content: metadataWorksheetXml(instance, presentation),
  });
  return entries;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const stable = new Uint8Array(bytes.byteLength);
  stable.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stable);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createGenericXlsxWorkbookSerializer(
  inputPresentation: GenericWorkbookPresentation,
): GenericWorkbookSerializer {
  const presentation = genericWorkbookPresentationSchema.parse(inputPresentation);
  return {
    id: `banco-notas-xlsx-stored-v1:${presentation.presentationVersion}`,
    async serialize(inputInstance) {
      const instance = genericModelInstanceSchema.parse(inputInstance);
      assertPresentationMatchesInstance(instance, presentation);
      const bytes = storedZip(workbookEntries(instance, presentation));
      const hash = await sha256(bytes);
      return {
        metadata: {
          format: 'xlsx',
          contentType: XLSX_CONTENT_TYPE,
          sha256: hash,
          byteLength: bytes.byteLength,
          modelId: instance.modelId,
          definitionVersion: instance.definitionVersion,
          layoutVersion: instance.layout.layoutVersion,
          mappingVersion: instance.mappingVersion,
          sourceHash: instance.sourceHash,
          relationshipSnapshotId: instance.relationshipSnapshotId,
        },
        bytes,
      };
    },
  };
}
