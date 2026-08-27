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
