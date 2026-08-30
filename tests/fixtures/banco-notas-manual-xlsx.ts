import { deflateRawSync } from 'node:zlib';
import { xlsxLegacyAnalysisProfileSchema } from '../../shared/banco-notas-xlsx-analysis-profile';

const encoder = new TextEncoder();

export const manualXlsxProfile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: 'manual-upload-synthetic-v1',
  analysisVersion: 'manual-upload-v1',
  worksheetRules: [
    {
      ruleId: 'class-component',
      sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
      caseInsensitive: false,
      studentPositionColumn: 'A',
      studentNameColumn: 'D',
      firstStudentRow: 2,
      maxStudentRows: 100,
      gradeColumns: [
        { field: 'NotaT1', column: 'B' },
        { field: 'NotaFinal', column: 'C' },
      ],
    },
  ],
});

function uint16(value: number): Uint8Array {
  const output = new Uint8Array(2);
  new DataView(output.buffer).setUint16(0, value, true);
  return output;
}

function uint32(value: number): Uint8Array {
  const output = new Uint8Array(4);
  new DataView(output.buffer).setUint32(0, value >>> 0, true);
  return output;
}

function join(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
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

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function createZip(entries: ReadonlyMap<string, string>, compressed: boolean): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const [entryName, content] of entries) {
    const name = encoder.encode(entryName);
    const data = encoder.encode(content);
    const compressedBuffer = compressed ? deflateRawSync(data) : data;
    const payload = new Uint8Array(compressedBuffer.byteLength);
    payload.set(compressedBuffer);
    const method = compressed ? 8 : 0;
    const checksum = crc32(data);

    const local = join([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(method),
      uint16(0),
      uint16(33),
      uint32(checksum),
      uint32(payload.byteLength),
      uint32(data.byteLength),
      uint16(name.byteLength),
      uint16(0),
      name,
      payload,
    ]);
    locals.push(local);

    centrals.push(
      join([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(method),
        uint16(0),
        uint16(33),
        uint32(checksum),
        uint32(payload.byteLength),
        uint32(data.byteLength),
        uint16(name.byteLength),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(localOffset),
        name,
      ]),
    );
    localOffset += local.byteLength;
  }

  const localBytes = join(locals);
  const centralBytes = join(centrals);
  return join([
    localBytes,
    centralBytes,
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.size),
    uint16(entries.size),
    uint32(centralBytes.byteLength),
    uint32(localBytes.byteLength),
    uint16(0),
  ]);
}

export function createManualXlsxFixture(
  options: {
    notaT1?: number;
    notaFinal?: number;
    compressed?: boolean;
    firstRowXml?: string;
  } = {},
): Uint8Array {
  const gradeCells = [
    options.notaT1 === undefined ? '' : `<c r="B2"><v>${options.notaT1}</v></c>`,
    options.notaFinal === undefined ? '' : `<c r="C2"><v>${options.notaFinal}</v></c>`,
  ].join('');

  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${options.firstRowXml ?? ''}
    <row r="2">
      <c r="A2"><v>1</v></c>
      ${gradeCells}
      <c r="D2" t="inlineStr"><is><t xml:space="preserve">${xmlEscape('Estudante Sintético')}</t></is></c>
    </row>
  </sheetData>
</worksheet>`;

  const entries = new Map<string, string>([
    [
      '[Content_Types].xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`,
    ],
    [
      '_rels/.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Turma A - Matemática" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`,
    ],
    ['xl/worksheets/sheet1.xml', worksheet],
  ]);

  return createZip(entries, options.compressed ?? false);
}
