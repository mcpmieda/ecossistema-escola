export const ACCEPTED_EXTENSIONS = ['xlsx', 'xlsb', 'xls'] as const;
const QUALITATIVE_COLUMNS = ['AA', 'AB', 'AC', 'AD', 'AE', 'AF', 'AG', 'AH', 'AI', 'AJ'] as const;

type Cell = {
  v?: unknown;
  w?: string;
  f?: string;
};

export type Worksheet = {
  '!ref'?: string;
  [address: string]: Cell | string | undefined;
};

export type Workbook = {
  SheetNames: string[];
  Sheets: Record<string, Worksheet>;
};

export type SheetJs = {
  version: string;
  read: (data: ArrayBuffer, options?: Record<string, unknown>) => Workbook;
  utils: {
    decode_range: (range: string) => {
      s: { r: number; c: number };
      e: { r: number; c: number };
    };
  };
};

export type NoteValue = {
  source: number;
  value: number;
  kind: 'manual' | 'formula' | 'official-zero' | 'legacy-zero' | 'negative';
  formula?: string;
};

export type StudentRecognition = {
  row: number;
  number: string;
  name: string;
  status: string;
  written: NoteValue | null;
  simulation: NoteValue | null;
  quantitativeTotal: NoteValue | null;
  parallel: NoteValue | null;
  qualitative: Array<NoteValue | null>;
  qualitativeTotal: NoteValue | null;
  official: NoteValue | null;
  annual: NoteValue | null;
};

export type GradeStage = 'overview' | 'trimester-1' | 'trimester-2' | 'trimester-3' | 'recovery';

export type GradeSheetRecognition = {
  name: string;
  range: string;
  rows: number;
  columns: number;
  className: string;
  discipline: string;
  disciplineIndex: string;
  stage: GradeStage;
  declaredStage: string;
  declaredStudents: number | null;
  students: StudentRecognition[];
  formulas: number;
  officialZeros: number;
};

export type ClassRecognition = {
  name: string;
  students: number;
  declaredStudents: number | null;
  disciplines: string[];
  trimesters: string[];
  recovery: boolean;
  sheets: GradeSheetRecognition[];
};

export type SheetSummary = {
  name: string;
  range: string;
  rows: number;
  columns: number;
};

export type WorkbookSummary = {
  fileName: string;
  format: string;
  size: number;
  parserVersion: string;
  sheets: SheetSummary[];
  gradeSheets: GradeSheetRecognition[];
  classes: ClassRecognition[];
  auxiliarySheets: string[];
  unrecognizedSheets: string[];
};

export function fileExtension(name: string): string {
  return name.split('.').pop()?.trim().toLowerCase() ?? '';
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .toUpperCase();
}

function cellAt(sheet: Worksheet, address: string): Cell | undefined {
  const value = sheet[address];
  return value && typeof value === 'object' ? value : undefined;
}

function textAt(sheet: Worksheet, address: string): string {
  const cell = cellAt(sheet, address);
  if (!cell) return '';
  if (typeof cell.v === 'string') return cell.v.trim();
  if (typeof cell.v === 'number') return String(cell.v);
  if (typeof cell.w === 'string') return cell.w.trim();
  return '';
}

function numberAt(sheet: Worksheet, address: string): number | null {
  const cell = cellAt(sheet, address);
  if (!cell) return null;
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) return cell.v;
  if (typeof cell.v === 'string') {
    const parsed = Number(cell.v.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readNote(sheet: Worksheet, address: string): NoteValue | null {
  const cell = cellAt(sheet, address);
  if (!cell) return null;
  const source = numberAt(sheet, address);
  if (source === null) return null;

  if (cell.f) {
    if (source === 0) return null;
    return { source, value: source, kind: 'formula', formula: cell.f };
  }

  if (source === 0.1) return { source, value: 0, kind: 'official-zero' };
  if (source === 0) return { source, value: 0, kind: 'legacy-zero' };
  if (source < 0) return { source, value: source, kind: 'negative' };
  return { source, value: source, kind: 'manual' };
}

function isStudentNumber(value: string): boolean {
  return /^\d+$/u.test(value.trim());
}

function stageFromToken(token: string): GradeStage {
  const normalized = token.toUpperCase().replace('°', 'º');
  if (normalized === 'VG') return 'overview';
  if (normalized === '1º') return 'trimester-1';
  if (normalized === '2º') return 'trimester-2';
  if (normalized === '3º') return 'trimester-3';
  return 'recovery';
}

export function stageLabel(stage: GradeStage): string {
  switch (stage) {
    case 'overview':
      return 'Visão geral';
    case 'trimester-1':
      return '1º trimestre';
    case 'trimester-2':
      return '2º trimestre';
    case 'trimester-3':
      return '3º trimestre';
    case 'recovery':
      return 'Recuperação final';
  }
}

function stageShortLabel(stage: GradeStage): string {
  switch (stage) {
    case 'trimester-1':
      return '1º';
    case 'trimester-2':
      return '2º';
    case 'trimester-3':
      return '3º';
    case 'recovery':
      return 'REC';
    default:
      return 'VG';
  }
}

function parseGradeSheetName(name: string): {
  className: string;
  stage: GradeStage;
  disciplineIndex: string;
} | null {
  const match = name.trim().match(/^(.*?)(VG|1[º°]|2[º°]|3[º°]|REC)\s*(D\d+)?$/iu);
  if (!match) return null;
  const className = match[1]?.trim();
  const stageToken = match[2];
  if (!className || !stageToken) return null;
  return {
    className,
    stage: stageFromToken(stageToken),
    disciplineIndex: match[3]?.toUpperCase() ?? 'D1',
  };
}

function worksheetDimensions(sheet: Worksheet, xlsx: SheetJs): Omit<SheetSummary, 'name'> {
  const range = sheet['!ref'];
  if (!range) return { range: 'Vazia', rows: 0, columns: 0 };
  const decoded = xlsx.utils.decode_range(range);
  return {
    range,
    rows: decoded.e.r - decoded.s.r + 1,
    columns: decoded.e.c - decoded.s.c + 1,
  };
}

function recognizeStudents(
  sheet: Worksheet,
  stage: GradeStage,
  xlsx: SheetJs,
): StudentRecognition[] {
  const range = sheet['!ref'];
  if (!range) return [];
  const decoded = xlsx.utils.decode_range(range);
  const startRow = Math.max(5, decoded.s.r + 1);
  const endRow = decoded.e.r + 1;
  const readGrades = stage === 'trimester-1' || stage === 'trimester-2' || stage === 'trimester-3';
  const students: StudentRecognition[] = [];

  for (let row = startRow; row <= endRow; row += 1) {
    const number = textAt(sheet, `J${row}`);
    const name = textAt(sheet, `K${row}`);
    if (!name || !isStudentNumber(number)) continue;

    students.push({
      row,
      number,
      name,
      status: textAt(sheet, `G${row}`),
      written: readGrades ? readNote(sheet, `R${row}`) : null,
      simulation: readGrades ? readNote(sheet, `S${row}`) : null,
      quantitativeTotal: readGrades ? readNote(sheet, `T${row}`) : null,
      parallel: readGrades ? readNote(sheet, `Z${row}`) : null,
      qualitative: readGrades
        ? QUALITATIVE_COLUMNS.map((column) => readNote(sheet, `${column}${row}`))
        : [],
      qualitativeTotal: readGrades ? readNote(sheet, `AK${row}`) : null,
      official: readGrades ? readNote(sheet, `AM${row}`) : null,
      annual: readGrades ? readNote(sheet, `AN${row}`) : null,
    });
  }

  return students;
}

function recognizeGradeSheet(
  name: string,
  sheet: Worksheet,
  xlsx: SheetJs,
): GradeSheetRecognition | null {
  const pattern = parseGradeSheetName(name);
  if (!pattern) return null;

  const dimensions = worksheetDimensions(sheet, xlsx);
  const className = textAt(sheet, 'K3') || pattern.className;
  const discipline = textAt(sheet, 'K2');
  const declaredStage = textAt(sheet, 'K4');
  const declaredStudentsValue = numberAt(sheet, 'J1');
  const students = recognizeStudents(sheet, pattern.stage, xlsx);
  let formulas = 0;
  let officialZeros = 0;

  for (const student of students) {
    const values = [
      student.written,
      student.simulation,
      student.quantitativeTotal,
      student.parallel,
      ...student.qualitative,
      student.qualitativeTotal,
      student.official,
      student.annual,
    ];
    for (const value of values) {
      if (value?.kind === 'formula') formulas += 1;
      if (value?.kind === 'official-zero') officialZeros += 1;
    }
  }

  return {
    name,
    range: dimensions.range,
    rows: dimensions.rows,
    columns: dimensions.columns,
    className,
    discipline,
    disciplineIndex: pattern.disciplineIndex,
    stage: pattern.stage,
    declaredStage,
    declaredStudents:
      declaredStudentsValue !== null && declaredStudentsValue >= 0
        ? Math.round(declaredStudentsValue)
        : null,
    students,
    formulas,
    officialZeros,
  };
}

function buildClasses(gradeSheets: GradeSheetRecognition[]): ClassRecognition[] {
  const grouped = new Map<
    string,
    {
      displayName: string;
      students: Set<string>;
      declared: number[];
      disciplines: Set<string>;
      trimesters: Set<string>;
      recovery: boolean;
      sheets: GradeSheetRecognition[];
    }
  >();

  for (const sheet of gradeSheets) {
    const key = normalizeText(sheet.className);
    if (!key) continue;
    const current = grouped.get(key) ?? {
      displayName: sheet.className,
      students: new Set<string>(),
      declared: [],
      disciplines: new Set<string>(),
      trimesters: new Set<string>(),
      recovery: false,
      sheets: [],
    };

    for (const student of sheet.students) {
      current.students.add(`${student.number}|${normalizeText(student.name)}`);
    }
    if (sheet.declaredStudents !== null) current.declared.push(sheet.declaredStudents);
    if (sheet.discipline) current.disciplines.add(sheet.discipline);
    if (sheet.stage === 'trimester-1' || sheet.stage === 'trimester-2' || sheet.stage === 'trimester-3') {
      current.trimesters.add(stageShortLabel(sheet.stage));
    }
    if (sheet.stage === 'recovery') current.recovery = true;
    current.sheets.push(sheet);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((group) => ({
      name: group.displayName,
      students: group.students.size,
      declaredStudents: group.declared.length > 0 ? Math.max(...group.declared) : null,
      disciplines: [...group.disciplines].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      trimesters: [...group.trimesters].sort(),
      recovery: group.recovery,
      sheets: group.sheets.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true }));
}

export function recognizeWorkbook(file: File, workbook: Workbook, xlsx: SheetJs): WorkbookSummary {
  const sheets = workbook.SheetNames.map((name) => {
    const dimensions = worksheetDimensions(workbook.Sheets[name] ?? {}, xlsx);
    return { ...dimensions, name };
  });

  const gradeSheets = workbook.SheetNames.flatMap((name) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) return [];
    const recognized = recognizeGradeSheet(name, sheet, xlsx);
    return recognized ? [recognized] : [];
  });
  const recognizedNames = new Set(gradeSheets.map((sheet) => sheet.name));
  const auxiliarySheets = workbook.SheetNames.filter((name) =>
    ['RELACAO', 'CONFIGURACAO', 'INICIO'].includes(normalizeText(name)),
  );
  const auxiliaryNames = new Set(auxiliarySheets);

  return {
    fileName: file.name,
    format: fileExtension(file.name).toUpperCase(),
    size: file.size,
    parserVersion: xlsx.version,
    sheets,
    gradeSheets,
    classes: buildClasses(gradeSheets),
    auxiliarySheets,
    unrecognizedSheets: workbook.SheetNames.filter(
      (name) => !recognizedNames.has(name) && !auxiliaryNames.has(name),
    ),
  };
}

export function formatNote(note: NoteValue | null): string {
  if (!note) return '—';
  const formatted = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(note.value);
  return note.kind === 'official-zero' ? `${formatted} (0,1)` : formatted;
}

export function noteCount(values: Array<NoteValue | null>): number {
  return values.filter(Boolean).length;
}

export function trimesterSheets(sheets: GradeSheetRecognition[]): GradeSheetRecognition[] {
  return sheets.filter(
    (sheet) =>
      sheet.stage === 'trimester-1' ||
      sheet.stage === 'trimester-2' ||
      sheet.stage === 'trimester-3',
  );
}
