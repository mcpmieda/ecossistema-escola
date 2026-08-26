import { describe, expect, it } from 'vitest';
import { genericModelInstanceSchema } from '../shared/banco-notas-generic-model';
import { genericWorkbookPresentationSchema } from '../shared/banco-notas-workbook-presentation';
import { xlsxLegacyAnalysisProfileSchema } from '../shared/banco-notas-xlsx-analysis-profile';
import { createGenericXlsxLegacyAnalyzer } from '../server/banco-notas/xlsx-legacy-analyzer';
import { createGenericXlsxWorkbookSerializer } from '../server/banco-notas/xlsx-workbook-serializer';
import {
  analyzeLegacyWorkbook,
  serializeGenericWorkbook,
} from '../server/banco-notas/workbook-pipeline';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const classId = '44444444-4444-4444-8444-444444444444';
const componentId = '55555555-5555-4555-8555-555555555555';
const studentId = '66666666-6666-4666-8666-666666666666';
const sheetKey = `generated:${classId}:${componentId}`;
const gradeKey = `2026|${classId}|${componentId}|${studentId}`;

const instance = genericModelInstanceSchema.parse({
  schemaVersion: 1,
  modelId: '11111111-1111-4111-8111-111111111111',
  teacherEntraObjectId: '22222222-2222-4222-8222-222222222222',
  schoolYear: 2026,
  definitionVersion: '2026.1',
  sourceHash: 'a'.repeat(64),
  relationshipSnapshotId: '33333333-3333-4333-8333-333333333333',
  environment: 'homologation',
  syncEnabled: false,
  mappingVersion: 1,
  layout: {
    layoutVersion: '2026.1-layout',
    firstStudentRow: 2,
    gradeColumns: [
      { field: 'NotaT1', column: 'B' },
      { field: 'NotaFinal', column: 'C' },
    ],
  },
  mappings: [
    { gradeKey, field: 'NotaT1', sheetKey, studentPosition: 1, cellAddress: 'B2' },
    { gradeKey, field: 'NotaFinal', sheetKey, studentPosition: 1, cellAddress: 'C2' },
  ],
});

const presentation = genericWorkbookPresentationSchema.parse({
  schemaVersion: 1,
  presentationVersion: '2026.1-presentation',
  modelId: instance.modelId,
  schoolYear: 2026,
  title: 'Banco de Notas 2026',
  teacherDisplayName: 'Docente Sintético',
  studentPositionColumn: 'A',
  studentNameColumn: 'D',
  positionHeader: 'Nº',
  studentHeader: 'Estudante',
  gradeHeaders: [
    { field: 'NotaT1', label: '1º trimestre' },
    { field: 'NotaFinal', label: 'Nota final' },
  ],
  sheets: [
    {
      sheetKey,
      displayName: 'Turma A - Matemática',
      classDisplayName: 'Turma A',
      componentDisplayName: 'Matemática',
      rows: [{ studentPosition: 1, gradeKey, studentDisplayName: 'Estudante Sintético' }],
    },
  ],
});

const profile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: 'synthetic-generic-v1',
  analysisVersion: 'xlsx-analysis-v1',
  worksheetRules: [
    {
      ruleId: 'class-component',
      sheetNamePattern: '^(?<class>.+?) - (?<component>.+)$',
      caseInsensitive: false,
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
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function storedEntries(bytes: Uint8Array): Map<string, string> {
  const entries = new Map<string, string>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 30 <= bytes.byteLength && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    expect(method).toBe(0);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength));
    entries.set(name, decoder.decode(bytes.subarray(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return entries;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const stream = new Blob([copy]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflatedZip(entries: Map<string, string>): Promise<Uint8Array> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;

  for (const [entryName, content] of entries) {
    const name = encoder.encode(entryName);
    const data = encoder.encode(content);
    const compressed = await deflateRaw(data);
    const checksum = crc32(data);
    const local = join([
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(8),
      uint16(0),
      uint16(33),
      uint32(checksum),
      uint32(compressed.byteLength),
      uint32(data.byteLength),
      uint16(name.byteLength),
      uint16(0),
      name,
      compressed,
    ]);
    locals.push(local);
    centrals.push(
      join([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(8),
        uint16(0),
        uint16(33),
        uint32(checksum),
        uint32(compressed.byteLength),
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

async function generatedSource(deflated = false) {
  const artifact = await serializeGenericWorkbook({
    instance,
    serializer: createGenericXlsxWorkbookSerializer(presentation),
  });
  const bytes = deflated ? await deflatedZip(storedEntries(artifact.bytes)) : artifact.bytes;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sourceHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return {
    metadata: {
      sourceFormat: 'xlsx' as const,
      sourceHash,
      byteLength: bytes.byteLength,
      schoolYear: 2026,
    },
    bytes,
  };
}

describe('Banco de Notas generic XLSX legacy analyzer', () => {
  it('reads a synthetic XLSX into the generic legacy intermediate model', async () => {
    const verified = await analyzeLegacyWorkbook({
      source: await generatedSource(),
      analyzer: createGenericXlsxLegacyAnalyzer(profile),
    });

    expect(verified.analyzerId).toContain('banco-notas-xlsx-ooxml-v1');
    expect(verified.model.sourceFormat).toBe('xlsx');
    expect(verified.model.analysisVersion).toBe('xlsx-analysis-v1');
    expect(verified.model.classes.map((item) => item.displayName)).toEqual(['Turma A']);
    expect(verified.model.components.map((item) => item.displayName)).toEqual(['Matemática']);
    expect(verified.model.students.map((item) => item.displayName)).toEqual([
      'Estudante Sintético',
    ]);
    expect(verified.model.gradeSlots.map((item) => item.field).sort()).toEqual([
      'NotaFinal',
      'NotaT1',
    ]);
    expect(verified.model.gradeSlots.map((item) => item.sourceLocator.cellAddress).sort()).toEqual([
      'B2',
      'C2',
    ]);
    expect(verified.model.findings).toEqual([]);
  });

  it('supports the DEFLATE compression normally used by XLSX packages', async () => {
    const verified = await analyzeLegacyWorkbook({
      source: await generatedSource(true),
      analyzer: createGenericXlsxLegacyAnalyzer(profile),
    });

    expect(verified.model.students).toHaveLength(1);
    expect(verified.model.gradeSlots).toHaveLength(2);
    expect(verified.model.classes[0]?.displayName).toBe('Turma A');
  });

  it('fails closed when two configured worksheet rules match the same sheet', async () => {
    const ambiguousProfile = xlsxLegacyAnalysisProfileSchema.parse({
      ...profile,
      worksheetRules: [
        ...profile.worksheetRules,
        { ...profile.worksheetRules[0], ruleId: 'second-rule' },
      ],
    });

    await expect(
      analyzeLegacyWorkbook({
        source: await generatedSource(),
        analyzer: createGenericXlsxLegacyAnalyzer(ambiguousProfile),
      }),
    ).rejects.toThrow('xlsx_sheet_rule_ambiguous');
  });

  it('does not claim XLSB support through the XLSX analyzer', async () => {
    await expect(
      analyzeLegacyWorkbook({
        source: {
          metadata: {
            sourceFormat: 'xlsb',
            sourceHash: 'a'.repeat(64),
            byteLength: 1,
            schoolYear: 2026,
          },
          bytes: new Uint8Array([1]),
        },
        analyzer: createGenericXlsxLegacyAnalyzer(profile),
      }),
    ).rejects.toThrow('workbook_format_not_supported:xlsb');
  });
});
