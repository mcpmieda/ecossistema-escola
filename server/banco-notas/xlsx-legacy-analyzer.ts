import {
  legacyIntermediateModelSchema,
  type LegacyIntermediateModel,
} from '../../shared/banco-notas-generic-model';
import {
  xlsxLegacyAnalysisProfileSchema,
  type XlsxLegacyAnalysisProfile,
  type XlsxLegacySheetRule,
} from '../../shared/banco-notas-xlsx-analysis-profile';
import { readOoxmlZipEntries } from './ooxml-zip';
import type { LegacyWorkbookAnalyzer, LegacyWorkbookSource } from './workbook-pipeline';

const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();
const MAX_XML_CELLS_PER_SHEET = 200_000;
const WORKBOOK_PATH = 'xl/workbook.xml';
const WORKBOOK_RELS_PATH = 'xl/_rels/workbook.xml.rels';
const SHARED_STRINGS_PATH = 'xl/sharedStrings.xml';

export class XlsxLegacyAnalyzerError extends Error {
  constructor(code: string) {
    super(code);
    this.name = 'XlsxLegacyAnalyzerError';
  }
}

type WorkbookSheet = {
  name: string;
  sheetId: string;
  relationshipId: string;
  state: string | null;
  path: string;
};

type CompiledRule = {
  rule: XlsxLegacySheetRule;
  pattern: RegExp;
};

function xmlText(bytes: Uint8Array, path: string): string {
  try {
    const value = decoder.decode(bytes);
    if (/<!DOCTYPE\b|<!ENTITY\b/iu.test(value)) {
      throw new XlsxLegacyAnalyzerError(`xlsx_xml_declaration_not_allowed:${path}`);
    }
    return value;
  } catch (error) {
    if (error instanceof XlsxLegacyAnalyzerError) throw error;
    throw new XlsxLegacyAnalyzerError(`xlsx_xml_not_utf8:${path}`);
  }
}

function requiredXml(entries: Map<string, Uint8Array>, path: string): string {
  const bytes = entries.get(path);
  if (!bytes) throw new XlsxLegacyAnalyzerError(`xlsx_required_part_missing:${path}`);
  return xmlText(bytes, path);
}

function decodeXmlEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/gu, (entity) => {
    if (entity === '&amp;') return '&';
    if (entity === '&lt;') return '<';
    if (entity === '&gt;') return '>';
    if (entity === '&quot;') return '"';
    if (entity === '&apos;') return "'";
    const hex = entity.startsWith('&#x');
    const raw = entity.slice(hex ? 3 : 2, -1);
    const codePoint = Number.parseInt(raw, hex ? 16 : 10);
    if (!Number.isSafeInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
      throw new XlsxLegacyAnalyzerError('xlsx_xml_invalid_numeric_entity');
    }
    return String.fromCodePoint(codePoint);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function attribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${escapeRegExp(name)}="([^"]*)"`, 'u'));
  return match?.[1] === undefined ? null : decodeXmlEntities(match[1]);
}

function normalizePartTarget(target: string): string {
  if (!target || target.includes('\\') || target.includes('?') || target.includes('#')) {
    throw new XlsxLegacyAnalyzerError('xlsx_relationship_target_invalid');
  }
  const raw = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const parts = raw.split('/');
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..')
      throw new XlsxLegacyAnalyzerError('xlsx_relationship_parent_path_rejected');
    normalized.push(part);
  }
  const path = normalized.join('/');
  if (!path.startsWith('xl/worksheets/')) {
    throw new XlsxLegacyAnalyzerError('xlsx_worksheet_relationship_outside_worksheets');
  }
  return path;
}

function parseWorkbookSheets(entries: Map<string, Uint8Array>): WorkbookSheet[] {
  const workbook = requiredXml(entries, WORKBOOK_PATH);
  const relationships = requiredXml(entries, WORKBOOK_RELS_PATH);
  const relationTargets = new Map<string, string>();

  for (const match of relationships.matchAll(/<Relationship\b[^>]*\/?\s*>/gu)) {
    const tag = match[0];
    const id = attribute(tag, 'Id');
    const type = attribute(tag, 'Type');
    if (!id || !type?.endsWith('/worksheet')) continue;
    if (attribute(tag, 'TargetMode') === 'External') {
      throw new XlsxLegacyAnalyzerError('xlsx_external_worksheet_relationship_rejected');
    }
    const target = attribute(tag, 'Target');
    if (!target)
      throw new XlsxLegacyAnalyzerError('xlsx_worksheet_relationship_target_missing');
    if (relationTargets.has(id)) {
      throw new XlsxLegacyAnalyzerError('xlsx_duplicate_worksheet_relationship');
    }
    relationTargets.set(id, normalizePartTarget(target));
  }

  const sheets: WorkbookSheet[] = [];
  const sheetIds = new Set<string>();
  const relationshipIds = new Set<string>();
  for (const match of workbook.matchAll(/<sheet\b[^>]*\/?\s*>/gu)) {
    const tag = match[0];
    const name = attribute(tag, 'name');
    const sheetId = attribute(tag, 'sheetId');
    const relationshipId = attribute(tag, 'r:id');
    if (!name || !sheetId || !relationshipId) {
      throw new XlsxLegacyAnalyzerError('xlsx_workbook_sheet_metadata_incomplete');
    }
    if (sheetIds.has(sheetId) || relationshipIds.has(relationshipId)) {
      throw new XlsxLegacyAnalyzerError('xlsx_duplicate_workbook_sheet_identity');
    }
    sheetIds.add(sheetId);
    relationshipIds.add(relationshipId);
    const path = relationTargets.get(relationshipId);
    if (!path) throw new XlsxLegacyAnalyzerError('xlsx_worksheet_relationship_missing');
    if (!entries.has(path))
      throw new XlsxLegacyAnalyzerError(`xlsx_required_part_missing:${path}`);
    sheets.push({
      name,
      sheetId,
      relationshipId,
      state: attribute(tag, 'state'),
      path,
    });
  }

  if (sheets.length === 0) throw new XlsxLegacyAnalyzerError('xlsx_workbook_has_no_worksheets');
  return sheets;
}

function textNodes(fragment: string): string {
  return Array.from(fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/gu), (match) =>
    decodeXmlEntities(match[1] ?? ''),
  ).join('');
}

function parseSharedStrings(entries: Map<string, Uint8Array>): string[] {
  const bytes = entries.get(SHARED_STRINGS_PATH);
  if (!bytes) return [];
  const xml = xmlText(bytes, SHARED_STRINGS_PATH);
  return Array.from(xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/gu), (match) =>
    textNodes(match[1] ?? ''),
  );
}

function cellValue(body: string, type: string | null, sharedStrings: readonly string[]): string {
  if (type === 'inlineStr') return textNodes(body);
  const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/u)?.[1];
  if (rawValue === undefined) return '';
  const decoded = decodeXmlEntities(rawValue);
  if (type !== 's') return decoded;
  const index = Number.parseInt(decoded, 10);
  if (!Number.isInteger(index) || index < 0 || index >= sharedStrings.length) {
    throw new XlsxLegacyAnalyzerError('xlsx_shared_string_index_invalid');
  }
  return sharedStrings[index] ?? '';
}

function parseWorksheetCells(
  entries: Map<string, Uint8Array>,
  sheet: WorkbookSheet,
  sharedStrings: readonly string[],
): Map<string, string> {
  const bytes = entries.get(sheet.path);
  if (!bytes) throw new XlsxLegacyAnalyzerError(`xlsx_required_part_missing:${sheet.path}`);
  const xml = xmlText(bytes, sheet.path);
  const cells = new Map<string, string>();
  let count = 0;

  for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gu)) {
    count += 1;
    if (count > MAX_XML_CELLS_PER_SHEET) {
      throw new XlsxLegacyAnalyzerError('xlsx_worksheet_cell_budget_exceeded');
    }
    const attributes = `<c${match[1] ?? ''}>`;
    const address = attribute(attributes, 'r');
    if (!address || !/^[A-Z]{1,3}[1-9][0-9]*$/u.test(address)) {
      throw new XlsxLegacyAnalyzerError('xlsx_cell_address_invalid');
    }
    if (cells.has(address)) throw new XlsxLegacyAnalyzerError('xlsx_duplicate_cell_address');
    cells.set(address, cellValue(match[2] ?? '', attribute(attributes, 't'), sharedStrings));
  }
  return cells;
}

function compileRules(profile: XlsxLegacyAnalysisProfile): CompiledRule[] {
  return profile.worksheetRules.map((rule) => {
    try {
      return {
        rule,
        pattern: new RegExp(rule.sheetNamePattern, rule.caseInsensitive ? 'iu' : 'u'),
      };
    } catch {
      throw new XlsxLegacyAnalyzerError(`xlsx_sheet_pattern_invalid:${rule.ruleId}`);
    }
  });
}

function matchingRule(
  sheetName: string,
  rules: readonly CompiledRule[],
): {
  rule: XlsxLegacySheetRule;
  classDisplayName: string;
  componentDisplayName: string;
} | null {
  const matches: Array<{
    rule: XlsxLegacySheetRule;
    classDisplayName: string;
    componentDisplayName: string;
  }> = [];

  for (const compiled of rules) {
    const match = compiled.pattern.exec(sheetName);
    if (!match) continue;
    const classDisplayName = match.groups?.class?.trim() ?? '';
    const componentDisplayName = match.groups?.component?.trim() ?? '';
    if (
      !classDisplayName ||
      !componentDisplayName ||
      classDisplayName.length > 180 ||
      componentDisplayName.length > 180
    ) {
      throw new XlsxLegacyAnalyzerError(`xlsx_sheet_capture_invalid:${compiled.rule.ruleId}`);
    }
    matches.push({ rule: compiled.rule, classDisplayName, componentDisplayName });
  }

  if (matches.length > 1) throw new XlsxLegacyAnalyzerError('xlsx_sheet_rule_ambiguous');
  return matches[0] ?? null;
}

async function digestToken(kind: string, value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${kind}\u0000${value}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return `${kind}:${hex}`;
}

function columnNumber(column: string): number {
  let value = 0;
  for (const character of column) value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}

function maximumColumn(columns: readonly string[]): string {
  return columns.reduce((maximum, column) =>
    columnNumber(column) > columnNumber(maximum) ? column : maximum,
  );
}

async function analyzeXlsx(
  source: LegacyWorkbookSource,
  profile: XlsxLegacyAnalysisProfile,
): Promise<LegacyIntermediateModel> {
  const entries = await readOoxmlZipEntries(source.bytes);
  const contentTypes = requiredXml(entries, '[Content_Types].xml');
  if (/macroEnabled|vbaProject/iu.test(contentTypes)) {
    throw new XlsxLegacyAnalyzerError('xlsx_macro_enabled_package_rejected');
  }

  const sheets = parseWorkbookSheets(entries);
  const sharedStrings = parseSharedStrings(entries);
  const rules = compileRules(profile);
  const classes = new Map<string, LegacyIntermediateModel['classes'][number]>();
  const components = new Map<string, LegacyIntermediateModel['components'][number]>();
  const students = new Map<string, LegacyIntermediateModel['students'][number]>();
  const gradeSlots: LegacyIntermediateModel['gradeSlots'] = [];
  const findings: string[] = [];
  let matchedSheetCount = 0;

  for (const sheet of sheets) {
    if (sheet.state && sheet.state !== 'visible') continue;
    const matched = matchingRule(sheet.name, rules);
    if (!matched) continue;
    matchedSheetCount += 1;

    const cells = parseWorksheetCells(entries, sheet, sharedStrings);
    const rowEnd = matched.rule.firstStudentRow + matched.rule.maxStudentRows - 1;
    const studentRows: Array<{ row: number; displayName: string }> = [];
    const namesInSheet = new Map<string, number>();

    for (let row = matched.rule.firstStudentRow; row <= rowEnd; row += 1) {
      const displayName = (cells.get(`${matched.rule.studentNameColumn}${row}`) ?? '').trim();
      if (!displayName) continue;
      if (displayName.length > 240) {
        throw new XlsxLegacyAnalyzerError('xlsx_student_display_name_too_long');
      }
      const previousRow = namesInSheet.get(displayName);
      if (previousRow !== undefined) {
        findings.push(`duplicate_student_name:${sheet.name}:${displayName}:${previousRow}:${row}`);
      } else {
        namesInSheet.set(displayName, row);
      }
      studentRows.push({ row, displayName });
    }

    if (studentRows.length === 0) {
      findings.push(`matched_sheet_without_students:${sheet.name}`);
      continue;
    }

    const sourceClassId = await digestToken('class', matched.classDisplayName);
    const sourceComponentId = await digestToken('component', matched.componentDisplayName);
    const sheetLocatorId = `sheet:${sheet.sheetId}`;
    const rangeEndColumn = maximumColumn([
      matched.rule.studentNameColumn,
      ...matched.rule.gradeColumns.map((item) => item.column),
    ]);
    const lastStudentRow = studentRows.reduce(
      (maximum, item) => Math.max(maximum, item.row),
      0,
    );
    const rangeAddress = `${matched.rule.studentNameColumn}${matched.rule.firstStudentRow}:${rangeEndColumn}${lastStudentRow}`;

    if (!classes.has(sourceClassId)) {
      classes.set(sourceClassId, {
        sourceClassId,
        displayName: matched.classDisplayName,
        sourceLocator: {
          sheetId: sheetLocatorId,
          sheetDisplayName: sheet.name,
          rangeAddress,
        },
      });
    }
    if (!components.has(sourceComponentId)) {
      components.set(sourceComponentId, {
        sourceComponentId,
        displayName: matched.componentDisplayName,
        sourceLocator: {
          sheetId: sheetLocatorId,
          sheetDisplayName: sheet.name,
          rangeAddress,
        },
      });
    }

    for (const studentRow of studentRows) {
      const sourceStudentId = await digestToken(
        'student',
        `${sourceClassId}\u0000${studentRow.displayName}`,
      );
      if (!students.has(sourceStudentId)) {
        students.set(sourceStudentId, {
          sourceStudentId,
          displayName: studentRow.displayName,
          sourceClassId,
          sourceLocator: {
            sheetId: sheetLocatorId,
            sheetDisplayName: sheet.name,
            cellAddress: `${matched.rule.studentNameColumn}${studentRow.row}`,
          },
        });
      }

      for (const gradeColumn of matched.rule.gradeColumns) {
        const cellAddress = `${gradeColumn.column}${studentRow.row}`;
        gradeSlots.push({
          sourceGradeSlotId: await digestToken(
            'slot',
            `${sheet.sheetId}\u0000${cellAddress}\u0000${gradeColumn.field}`,
          ),
          sourceClassId,
          sourceComponentId,
          sourceStudentId,
          field: gradeColumn.field,
          sourceLocator: {
            sheetId: sheetLocatorId,
            sheetDisplayName: sheet.name,
            cellAddress,
          },
        });
      }
    }
  }

  if (matchedSheetCount === 0)
    throw new XlsxLegacyAnalyzerError('xlsx_no_worksheet_rule_matched');
  if (students.size === 0) throw new XlsxLegacyAnalyzerError('xlsx_no_students_found');
  if (gradeSlots.length === 0) throw new XlsxLegacyAnalyzerError('xlsx_no_grade_slots_found');

  const sortById = <T>(items: T[], select: (item: T) => string): T[] =>
    items.sort((left, right) => select(left).localeCompare(select(right)));

  return legacyIntermediateModelSchema.parse({
    schemaVersion: 1,
    sourceFormat: 'xlsx',
    sourceHash: source.metadata.sourceHash,
    schoolYear: source.metadata.schoolYear,
    analysisVersion: profile.analysisVersion,
    classes: sortById([...classes.values()], (item) => item.sourceClassId),
    components: sortById([...components.values()], (item) => item.sourceComponentId),
    students: sortById([...students.values()], (item) => item.sourceStudentId),
    gradeSlots: sortById(gradeSlots, (item) => item.sourceGradeSlotId),
    findings: findings.sort(),
  });
}

export function createGenericXlsxLegacyAnalyzer(
  profileInput: XlsxLegacyAnalysisProfile,
): LegacyWorkbookAnalyzer {
  const profile = xlsxLegacyAnalysisProfileSchema.parse(profileInput);
  return {
    id: `banco-notas-xlsx-ooxml-v1:${profile.profileId}:${profile.analysisVersion}`,
    supportedFormats: ['xlsx'],
    async analyze(source) {
      if (source.metadata.sourceFormat !== 'xlsx') {
        throw new XlsxLegacyAnalyzerError('xlsx_analyzer_received_non_xlsx_source');
      }
      return analyzeXlsx(source, profile);
    },
  };
}
