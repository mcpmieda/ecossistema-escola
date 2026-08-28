import { readOoxmlZipEntries } from './ooxml-zip';

const textDecoder = new TextDecoder();
const mutableCatalogParts = new Set([
  '[Content_Types].xml',
  '_rels/.rels',
  'docProps/core.xml',
  'xl/_rels/workbook.xml.rels',
]);

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function assertCorePropertiesPreserved(
  original: Map<string, Uint8Array>,
  downloaded: Map<string, Uint8Array>,
): void {
  const originalPart = original.get('docProps/core.xml');
  const downloadedPart = downloaded.get('docProps/core.xml');
  if (!originalPart || !downloadedPart) throw new Error('sharepoint_xlsx_core_properties_missing');
  const originalXml = textDecoder.decode(originalPart);
  const downloadedXml = textDecoder.decode(downloadedPart);
  for (const tagName of ['dc:title', 'dc:creator']) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'u');
    const originalValue = pattern.exec(originalXml)?.[1];
    if (originalValue !== undefined && pattern.exec(downloadedXml)?.[1] !== originalValue) {
      throw new Error('sharepoint_xlsx_core_property_changed');
    }
  }
}

function allowedServerManagedPart(name: string): boolean {
  return (
    name === 'docProps/custom.xml' || name.startsWith('customXml/') || name.startsWith('[trash]/')
  );
}

function xmlTagSignatures(
  xml: string,
  tagName: string,
  attributes: readonly string[],
): Set<string> {
  const signatures = new Set<string>();
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gu');
  for (const match of xml.matchAll(tagPattern)) {
    const tag = match[0];
    const values = attributes.map((attribute) => {
      const attributePattern = new RegExp(`\\b${attribute}="([^"]*)"`, 'u');
      return attributePattern.exec(tag)?.[1] ?? '';
    });
    signatures.add(values.join('\u0000'));
  }
  return signatures;
}

function assertCatalogContainsOriginal(
  original: Map<string, Uint8Array>,
  downloaded: Map<string, Uint8Array>,
  partName: string,
  tagName: string,
  attributes: readonly string[],
): void {
  const originalPart = original.get(partName);
  const downloadedPart = downloaded.get(partName);
  if (!originalPart || !downloadedPart) throw new Error('sharepoint_xlsx_catalog_missing');
  const originalSignatures = xmlTagSignatures(
    textDecoder.decode(originalPart),
    tagName,
    attributes,
  );
  const downloadedSignatures = xmlTagSignatures(
    textDecoder.decode(downloadedPart),
    tagName,
    attributes,
  );
  for (const signature of originalSignatures) {
    if (!downloadedSignatures.has(signature)) {
      throw new Error('sharepoint_xlsx_original_relationship_missing');
    }
  }
}

export async function assertSharePointWorkbookIntegrity(
  originalBytes: Uint8Array,
  downloadedBytes: Uint8Array,
): Promise<'exact' | 'sharepoint_normalized'> {
  if (sameBytes(originalBytes, downloadedBytes)) return 'exact';

  const [original, downloaded] = await Promise.all([
    readOoxmlZipEntries(originalBytes),
    readOoxmlZipEntries(downloadedBytes),
  ]);

  for (const [name, originalPart] of original) {
    const downloadedPart = downloaded.get(name);
    if (!downloadedPart) throw new Error('sharepoint_xlsx_original_part_missing');
    if (!mutableCatalogParts.has(name) && !sameBytes(originalPart, downloadedPart)) {
      throw new Error('sharepoint_xlsx_product_part_changed');
    }
  }

  for (const name of downloaded.keys()) {
    if (!original.has(name) && !allowedServerManagedPart(name)) {
      throw new Error('sharepoint_xlsx_unexpected_part_added');
    }
  }

  assertCatalogContainsOriginal(original, downloaded, '_rels/.rels', 'Relationship', [
    'Type',
    'Target',
  ]);
  assertCatalogContainsOriginal(
    original,
    downloaded,
    'xl/_rels/workbook.xml.rels',
    'Relationship',
    ['Type', 'Target'],
  );
  assertCatalogContainsOriginal(original, downloaded, '[Content_Types].xml', 'Default', [
    'Extension',
    'ContentType',
  ]);
  assertCatalogContainsOriginal(original, downloaded, '[Content_Types].xml', 'Override', [
    'PartName',
    'ContentType',
  ]);
  assertCorePropertiesPreserved(original, downloaded);

  return 'sharepoint_normalized';
}

export type EditedWorkbookIntegrityExpectation = {
  visibleSheetName: string;
  metadataSheetName: string;
  modelId: string;
  sheetKey: string;
  gradeKey: string;
  field: string;
  cellAddress: string;
  expectedNumericValue: number;
  studentCellAddress: string;
  studentDisplayName: string;
};

function decodeXmlText(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function requiredPartText(entries: Map<string, Uint8Array>, name: string): string {
  const part = entries.get(name);
  if (!part) throw new Error(`sharepoint_edited_xlsx_required_part_missing:${name}`);
  return textDecoder.decode(part);
}

function xmlAttribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const value = new RegExp(`\\s${escapedName}="([^"]*)"`, 'u').exec(tag)?.[1];
  return value === undefined ? null : decodeXmlText(value);
}

function worksheetTarget(target: string): string {
  if (target.includes('..') || target.includes('\\') || /^https?:/iu.test(target)) {
    throw new Error('sharepoint_edited_xlsx_worksheet_target_invalid');
  }
  return target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//u, '')}`;
}

function sharedStrings(entries: Map<string, Uint8Array>): string[] {
  const part = entries.get('xl/sharedStrings.xml');
  if (!part) return [];
  const xml = textDecoder.decode(part);
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu), (match) =>
    Array.from((match[1] ?? '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu), (text) =>
      decodeXmlText(text[1] ?? ''),
    ).join(''),
  );
}

function worksheetCells(
  entries: Map<string, Uint8Array>,
  path: string,
  strings: readonly string[],
): Map<string, string> {
  const xml = requiredPartText(entries, path);
  const cells = new Map<string, string>();
  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    const tag = `<c${match[1] ?? ''}>`;
    const address = xmlAttribute(tag, 'r');
    if (!address || cells.has(address)) {
      throw new Error('sharepoint_edited_xlsx_cell_identity_invalid');
    }
    const body = match[2] ?? '';
    const type = xmlAttribute(tag, 't');
    if (type === 'inlineStr') {
      const text = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu), (item) =>
        decodeXmlText(item[1] ?? ''),
      ).join('');
      cells.set(address, text);
      continue;
    }
    const raw = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1] ?? '';
    if (type === 's') {
      const index = Number.parseInt(raw, 10);
      if (!Number.isInteger(index) || index < 0 || strings[index] === undefined) {
        throw new Error('sharepoint_edited_xlsx_shared_string_invalid');
      }
      cells.set(address, strings[index]);
    } else {
      cells.set(address, decodeXmlText(raw));
    }
  }
  return cells;
}

function sheetPaths(
  entries: Map<string, Uint8Array>,
): Map<string, { path: string; state: string | null }> {
  const workbook = requiredPartText(entries, 'xl/workbook.xml');
  const relationships = requiredPartText(entries, 'xl/_rels/workbook.xml.rels');
  const relationshipTargets = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/gu)) {
    const tag = match[0];
    const id = xmlAttribute(tag, 'Id');
    const type = xmlAttribute(tag, 'Type');
    const target = xmlAttribute(tag, 'Target');
    if (!id || !type?.endsWith('/worksheet') || !target) continue;
    if (xmlAttribute(tag, 'TargetMode') === 'External') {
      throw new Error('sharepoint_edited_xlsx_external_relationship');
    }
    relationshipTargets.set(id, worksheetTarget(target));
  }

  const result = new Map<string, { path: string; state: string | null }>();
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?\s*>/gu)) {
    const tag = match[0];
    const name = xmlAttribute(tag, 'name');
    const relationshipId = xmlAttribute(tag, 'r:id');
    const path = relationshipId ? relationshipTargets.get(relationshipId) : undefined;
    if (!name || !path || result.has(name)) {
      throw new Error('sharepoint_edited_xlsx_sheet_identity_invalid');
    }
    result.set(name, { path, state: xmlAttribute(tag, 'state') });
  }
  return result;
}

export async function assertEditedSharePointWorkbookIntegrity(
  workbookBytes: Uint8Array,
  expected: EditedWorkbookIntegrityExpectation,
): Promise<'excel_edited'> {
  const entries = await readOoxmlZipEntries(workbookBytes);
  const contentTypes = requiredPartText(entries, '[Content_Types].xml');
  if (/macroEnabled|vbaProject/iu.test(contentTypes)) {
    throw new Error('sharepoint_edited_xlsx_macro_package_rejected');
  }
  for (const [name, part] of entries) {
    if (/vbaProject|externalLinks|\.bin$/iu.test(name)) {
      throw new Error('sharepoint_edited_xlsx_unsafe_part_rejected');
    }
    if (name.endsWith('.rels') && /TargetMode="External"/iu.test(textDecoder.decode(part))) {
      throw new Error('sharepoint_edited_xlsx_external_relationship');
    }
  }

  const sheets = sheetPaths(entries);
  if (sheets.size !== 2) throw new Error('sharepoint_edited_xlsx_sheet_count_invalid');
  const visibleSheet = sheets.get(expected.visibleSheetName);
  const metadataSheet = sheets.get(expected.metadataSheetName);
  if (!visibleSheet || (visibleSheet.state && visibleSheet.state !== 'visible')) {
    throw new Error('sharepoint_edited_xlsx_visible_sheet_invalid');
  }
  if (!metadataSheet || metadataSheet.state !== 'veryHidden') {
    throw new Error('sharepoint_edited_xlsx_metadata_sheet_invalid');
  }

  const strings = sharedStrings(entries);
  const visibleCells = worksheetCells(entries, visibleSheet.path, strings);
  const metadataCells = worksheetCells(entries, metadataSheet.path, strings);
  if (visibleCells.get(expected.studentCellAddress) !== expected.studentDisplayName) {
    throw new Error('sharepoint_edited_xlsx_student_changed');
  }
  const numericValue = Number(visibleCells.get(expected.cellAddress));
  if (!Number.isFinite(numericValue) || numericValue !== expected.expectedNumericValue) {
    throw new Error('sharepoint_edited_xlsx_grade_value_mismatch');
  }
  if (metadataCells.get('B3') !== expected.modelId) {
    throw new Error('sharepoint_edited_xlsx_model_mismatch');
  }
  const mappingRows = Array.from(metadataCells.entries()).filter(
    ([address, value]) => /^C[1-9][0-9]*$/u.test(address) && value === expected.cellAddress,
  );
  if (mappingRows.length !== 1) {
    throw new Error('sharepoint_edited_xlsx_mapping_count_invalid');
  }
  const row = mappingRows[0]![0].slice(1);
  if (
    metadataCells.get(`A${row}`) !== expected.sheetKey ||
    metadataCells.get(`D${row}`) !== expected.gradeKey ||
    metadataCells.get(`E${row}`) !== expected.field
  ) {
    throw new Error('sharepoint_edited_xlsx_mapping_changed');
  }
  return 'excel_edited';
}
