import type {
  GradeSheetRecognition,
  SheetJs,
  Workbook,
  WorkbookSummary,
  Worksheet,
} from './spreadsheet-recognizer';

export interface CanonicalRosterStudentV6 {
  readonly position: number;
  readonly name: string;
  readonly status: string;
}

export interface CanonicalRosterV6 {
  readonly className: string;
  readonly relationIndex: number;
  readonly students: readonly CanonicalRosterStudentV6[];
}

export interface WorkbookSummaryWithCanonicalRostersV6 extends WorkbookSummary {
  readonly canonicalRostersV6: readonly CanonicalRosterV6[];
}

interface RelationCandidateV6 {
  readonly index: number;
  readonly students: readonly CanonicalRosterStudentV6[];
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

function cell(sheet: Worksheet, address: string): { v?: unknown; w?: string; f?: string } | null {
  const value = sheet[address];
  return value && typeof value === 'object' ? value : null;
}

function text(sheet: Worksheet, address: string): string {
  const value = cell(sheet, address);
  if (!value) return '';
  if (typeof value.v === 'string') return value.v.trim();
  if (typeof value.v === 'number') return String(value.v);
  if (typeof value.w === 'string') return value.w.trim();
  return '';
}

function columnName(oneBased: number): string {
  let value = oneBased;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function relationCandidates(sheet: Worksheet, xlsx: SheetJs): readonly RelationCandidateV6[] {
  const reference = sheet['!ref'];
  if (!reference) return [];
  const decoded = xlsx.utils.decode_range(reference);
  const candidates: RelationCandidateV6[] = [];

  for (let column = decoded.s.c + 1; column <= decoded.e.c + 1; column += 1) {
    const nameColumn = columnName(column);
    const header = normalize(text(sheet, `${nameColumn}1`));
    const match = header.match(/^RELACAOTURMA(\d+)$/u);
    if (!match?.[1]) continue;
    const index = Number(match[1]);
    const statusColumn = column > 1 ? columnName(column - 1) : '';
    const students: CanonicalRosterStudentV6[] = [];

    // RELAÇÃO stores one class roster vertically. The academic template supports at most K5:K50,
    // therefore no class roster can legitimately contribute more than 46 positions.
    for (let offset = 0; offset < 46; offset += 1) {
      const sourceRow = 2 + offset;
      const name = text(sheet, `${nameColumn}${sourceRow}`);
      if (!name || name === '0') break;
      const status = statusColumn ? text(sheet, `${statusColumn}${sourceRow}`) : '';
      students.push({ position: offset + 1, name, status });
    }
    if (students.length > 0) candidates.push({ index, students });
  }

  return candidates.sort((left, right) => left.index - right.index);
}

function rosterNames(students: readonly { name: string }[]): string {
  return JSON.stringify(students.map((student) => normalize(student.name)));
}

function relationIndexFromFormula(sheet: Worksheet): number | null {
  const formula = cell(sheet, 'K5')?.f;
  if (!formula) return null;
  const match = formula.toUpperCase().match(/RELACAOTURMA(\d+)/u);
  return match?.[1] ? Number(match[1]) : null;
}

function firstTermSheets(gradeSheets: readonly GradeSheetRecognition[]): readonly GradeSheetRecognition[] {
  const unique = new Map<string, GradeSheetRecognition>();
  for (const sheet of gradeSheets) {
    if (sheet.stage !== 'trimester-1') continue;
    const key = normalize(sheet.className);
    if (!unique.has(key)) unique.set(key, sheet);
  }
  return [...unique.values()];
}

function exactCandidate(
  firstTerm: GradeSheetRecognition,
  candidates: readonly RelationCandidateV6[],
): RelationCandidateV6 | null {
  const signature = rosterNames(firstTerm.students.filter((student) => student.row >= 5 && student.row <= 50));
  const matches = candidates.filter((candidate) => rosterNames(candidate.students) === signature);
  return matches.length === 1 ? matches[0]! : null;
}

export function recognizeCanonicalRostersV6(
  workbook: Workbook,
  summary: WorkbookSummary,
  xlsx: SheetJs,
): readonly CanonicalRosterV6[] {
  const relationName = workbook.SheetNames.find((name) => normalize(name) === 'RELACAO');
  if (!relationName) return [];
  const relationSheet = workbook.Sheets[relationName];
  if (!relationSheet) return [];
  const candidates = relationCandidates(relationSheet, xlsx);
  if (candidates.length === 0) return [];

  const byIndex = new Map(candidates.map((candidate) => [candidate.index, candidate]));
  const resolved: CanonicalRosterV6[] = [];

  for (const firstTerm of firstTermSheets(summary.gradeSheets)) {
    const sourceSheet = workbook.Sheets[firstTerm.name];
    const formulaIndex = sourceSheet ? relationIndexFromFormula(sourceSheet) : null;
    const formulaCandidate = formulaIndex === null ? null : (byIndex.get(formulaIndex) ?? null);
    const candidate =
      formulaCandidate &&
      rosterNames(formulaCandidate.students) ===
        rosterNames(firstTerm.students.filter((student) => student.row >= 5 && student.row <= 50))
        ? formulaCandidate
        : exactCandidate(firstTerm, candidates);
    if (!candidate) continue;
    resolved.push({
      className: firstTerm.className,
      relationIndex: candidate.index,
      students: candidate.students,
    });
  }

  return resolved.sort((left, right) =>
    left.className.localeCompare(right.className, 'pt-BR', { numeric: true }),
  );
}
