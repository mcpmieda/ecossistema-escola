const MAX_ZIP_ENTRIES = 2_048;
const MAX_ENTRY_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_EOCD_SEARCH_BYTES = 65_557;

const decoder = new TextDecoder('utf-8', { fatal: true });

export class OoxmlZipError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'OoxmlZipError';
  }
}

type CentralEntry = {
  name: string;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

function assertRange(
  bytes: Uint8Array,
  offset: number,
  length: number,
  code: string,
): void {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new OoxmlZipError(code);
  }
}

function uint16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function uint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(bytes: Uint8Array, view: DataView): number {
  const minimumOffset = Math.max(0, bytes.byteLength - MAX_EOCD_SEARCH_BYTES);
  for (let offset = bytes.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (uint32(view, offset) === 0x06054b50) return offset;
  }
  throw new OoxmlZipError('xlsx_zip_end_of_central_directory_missing');
}

function decodeName(bytes: Uint8Array): string {
  try {
    return decoder.decode(bytes);
  } catch {
    throw new OoxmlZipError('xlsx_zip_entry_name_not_utf8');
  }
}

function assertSafeEntryName(name: string): void {
  if (
    !name ||
    name.startsWith('/') ||
    name.startsWith('\\') ||
    name.includes('\\') ||
    name.split('/').some((part) => part === '..')
  ) {
    throw new OoxmlZipError('xlsx_zip_unsafe_entry_name');
  }
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

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const stream = new Blob([copy]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new OoxmlZipError('xlsx_zip_deflate_failed');
  }
}

function readCentralDirectory(bytes: Uint8Array): CentralEntry[] {
  if (bytes.byteLength < 22) throw new OoxmlZipError('xlsx_zip_too_small');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes, view);
  assertRange(bytes, eocdOffset, 22, 'xlsx_zip_truncated_end_of_central_directory');

  const diskNumber = uint16(view, eocdOffset + 4);
  const centralDiskNumber = uint16(view, eocdOffset + 6);
  const diskEntryCount = uint16(view, eocdOffset + 8);
  const entryCount = uint16(view, eocdOffset + 10);
  const centralSize = uint32(view, eocdOffset + 12);
  const centralOffset = uint32(view, eocdOffset + 16);

  if (diskNumber !== 0 || centralDiskNumber !== 0 || diskEntryCount !== entryCount) {
    throw new OoxmlZipError('xlsx_zip_multidisk_not_supported');
  }
  if (entryCount === 0 || entryCount > MAX_ZIP_ENTRIES) {
    throw new OoxmlZipError('xlsx_zip_entry_count_invalid');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new OoxmlZipError('xlsx_zip64_not_supported');
  }
  assertRange(bytes, centralOffset, centralSize, 'xlsx_zip_central_directory_out_of_bounds');
  if (centralOffset + centralSize > eocdOffset) {
    throw new OoxmlZipError('xlsx_zip_central_directory_overlaps_eocd');
  }

  const entries: CentralEntry[] = [];
  const names = new Set<string>();
  let offset = centralOffset;
  let totalUncompressed = 0;

  for (let index = 0; index < entryCount; index += 1) {
    assertRange(bytes, offset, 46, 'xlsx_zip_truncated_central_entry');
    if (uint32(view, offset) !== 0x02014b50) {
      throw new OoxmlZipError('xlsx_zip_invalid_central_entry_signature');
    }

    const flags = uint16(view, offset + 8);
    const method = uint16(view, offset + 10);
    const checksum = uint32(view, offset + 16);
    const compressedSize = uint32(view, offset + 20);
    const uncompressedSize = uint32(view, offset + 24);
    const nameLength = uint16(view, offset + 28);
    const extraLength = uint16(view, offset + 30);
    const commentLength = uint16(view, offset + 32);
    const diskStart = uint16(view, offset + 34);
    const localHeaderOffset = uint32(view, offset + 42);

    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new OoxmlZipError('xlsx_zip64_not_supported');
    }
    if ((flags & 0x0001) !== 0) throw new OoxmlZipError('xlsx_zip_encryption_not_supported');
    if (diskStart !== 0) throw new OoxmlZipError('xlsx_zip_multidisk_not_supported');
    if (method !== 0 && method !== 8) {
      throw new OoxmlZipError(`xlsx_zip_compression_method_not_supported:${method}`);
    }
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      throw new OoxmlZipError('xlsx_zip_entry_too_large');
    }

    const variableLength = nameLength + extraLength + commentLength;
    assertRange(bytes, offset + 46, variableLength, 'xlsx_zip_truncated_central_entry');
    const name = decodeName(bytes.subarray(offset + 46, offset + 46 + nameLength));
    assertSafeEntryName(name);
    if (names.has(name)) throw new OoxmlZipError('xlsx_zip_duplicate_entry_name');
    names.add(name);

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new OoxmlZipError('xlsx_zip_uncompressed_budget_exceeded');
    }

    entries.push({
      name,
      flags,
      method,
      crc32: checksum,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset += 46 + variableLength;
  }

  if (offset !== centralOffset + centralSize) {
    throw new OoxmlZipError('xlsx_zip_central_directory_size_mismatch');
  }

  return entries;
}

async function readEntry(bytes: Uint8Array, entry: CentralEntry): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = entry.localHeaderOffset;
  assertRange(bytes, offset, 30, 'xlsx_zip_truncated_local_entry');
  if (uint32(view, offset) !== 0x04034b50) {
    throw new OoxmlZipError('xlsx_zip_invalid_local_entry_signature');
  }

  const localFlags = uint16(view, offset + 6);
  const localMethod = uint16(view, offset + 8);
  const nameLength = uint16(view, offset + 26);
  const extraLength = uint16(view, offset + 28);
  if (localMethod !== entry.method || (localFlags & 0x0001) !== 0) {
    throw new OoxmlZipError('xlsx_zip_local_entry_metadata_mismatch');
  }

  const nameStart = offset + 30;
  const dataStart = nameStart + nameLength + extraLength;
  assertRange(bytes, nameStart, nameLength + extraLength, 'xlsx_zip_truncated_local_entry');
  const localName = decodeName(bytes.subarray(nameStart, nameStart + nameLength));
  if (localName !== entry.name) throw new OoxmlZipError('xlsx_zip_local_entry_name_mismatch');
  assertRange(bytes, dataStart, entry.compressedSize, 'xlsx_zip_truncated_entry_data');

  const compressed = bytes.subarray(dataStart, dataStart + entry.compressedSize);
  let output: Uint8Array;
  if (entry.method === 0) {
    output = new Uint8Array(compressed.byteLength);
    output.set(compressed);
  } else {
    output = await inflateRaw(compressed);
  }

  if (output.byteLength !== entry.uncompressedSize) {
    throw new OoxmlZipError('xlsx_zip_uncompressed_size_mismatch');
  }
  if (crc32(output) !== entry.crc32) throw new OoxmlZipError('xlsx_zip_crc32_mismatch');
  return output;
}

export async function readOoxmlZipEntries(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = readCentralDirectory(bytes);
  const output = new Map<string, Uint8Array>();
  for (const entry of entries) output.set(entry.name, await readEntry(bytes, entry));
  return output;
}
