import type {
  BancoNotasSearchRepository,
  PesquisaBucket,
  PesquisaClassGroupItem,
  PesquisaEntityType,
  PesquisaGlobalQuery,
  PesquisaGlobalResult,
  PesquisaStudentItem,
  PesquisaTeacherItem,
} from '../../shared/banco-notas-pesquisa';
import { canonicalRosterCte } from './d1-turmas-alunos-repository';

type Row = Record<string, string | number | null>;

const allTypes: PesquisaEntityType[] = ['students', 'teachers', 'classGroups'];

export function normalizePesquisaText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
    .replace(/\s+/gu, ' ');
}

function foldedSql(expression: string): string {
  const replacements: Array<[string, string]> = [
    ['ÁÀÂÃÄáàâãä', 'a'],
    ['ÉÈÊËéèêë', 'e'],
    ['ÍÌÎÏíìîï', 'i'],
    ['ÓÒÔÕÖóòôõö', 'o'],
    ['ÚÙÛÜúùûü', 'u'],
    ['Çç', 'c'],
    ['Ññ', 'n'],
  ];
  let sql = `LOWER(TRIM(${expression}))`;
  for (const [characters, replacement] of replacements) {
    for (const character of characters) sql = `REPLACE(${sql}, '${character}', '${replacement}')`;
  }
  return `REPLACE(REPLACE(REPLACE(${sql}, '  ', ' '), '  ', ' '), '  ', ' ')`;
}

function values(value: Row[string] | undefined): string[] {
  return [
    ...new Set(
      String(value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].sort((left, right) => left.localeCompare(right, 'pt-BR'));
}

function emptyBucket<T>(): PesquisaBucket<T> {
  return { items: [], total: 0, hasMore: false };
}

function searchSql(entityCte: string, finalColumns: string, tokenCount: number): string {
  const tokenPredicate = Array.from(
    { length: tokenCount },
    () => "(normalized_name LIKE ? ESCAPE '\\' OR normalized_context LIKE ? ESCAPE '\\')",
  ).join(' AND ');
  return `${entityCte}, normalized_entities AS (
    SELECT entity_rows.*, ${foldedSql('search_name')} AS normalized_name,
           ${foldedSql("COALESCE(search_context, '')")} AS normalized_context
    FROM entity_rows
  ), matched AS (
    SELECT normalized_entities.*,
           CASE
             WHEN normalized_name = ? THEN 0
             WHEN normalized_name LIKE ? ESCAPE '\\' THEN 1
             WHEN normalized_name LIKE ? ESCAPE '\\' THEN 2
             ELSE 3
           END AS match_rank
    FROM normalized_entities
    WHERE ${tokenPredicate}
  )
  SELECT ${finalColumns}, COUNT(*) OVER() AS total_count
  FROM matched
  ORDER BY match_rank, normalized_name, id
  LIMIT ?`;
}

function like(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

function bindings(query: string, tokens: string[], limit: number): Array<string | number> {
  const escaped = like(query);
  return [
    query,
    `${escaped}%`,
    `%${escaped}%`,
    ...tokens.flatMap((token) => [`%${like(token)}%`, `%${like(token)}%`]),
    limit,
  ];
}

export class D1BancoNotasSearchRepository implements BancoNotasSearchRepository {
  constructor(private readonly db: D1Database) {}

  private async students(
    query: PesquisaGlobalQuery,
    normalized: string,
    tokens: string[],
  ): Promise<PesquisaBucket<PesquisaStudentItem>> {
    const cte = `${canonicalRosterCte}, entity_rows AS (
      SELECT student.id, student.display_name AS search_name,
             GROUP_CONCAT(DISTINCT roster.class_group_name) AS class_groups,
             GROUP_CONCAT(DISTINCT roster.class_group_name) AS search_context
      FROM students student
      LEFT JOIN canonical_roster roster ON roster.student_id = student.id
        AND (? IS NULL OR roster.school_year_id = ?)
      GROUP BY student.id, student.display_name
    )`;
    const result = await this.db
      .prepare(searchSql(cte, 'id, search_name, class_groups', tokens.length))
      .bind(
        query.schoolYearId ?? null,
        query.schoolYearId ?? null,
        ...bindings(normalized, tokens, query.limitPerType),
      )
      .all<Row>();
    const rows = result.results ?? [];
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        displayName: String(row.search_name),
        classGroups: values(row.class_groups),
      })),
      total,
      hasMore: total > rows.length,
    };
  }

  private async teachers(
    query: PesquisaGlobalQuery,
    normalized: string,
    tokens: string[],
  ): Promise<PesquisaBucket<PesquisaTeacherItem>> {
    const cte = `WITH entity_rows AS (
      SELECT teacher.id, teacher.display_name AS search_name,
             GROUP_CONCAT(DISTINCT component.name) AS components,
             GROUP_CONCAT(DISTINCT class_group.name) AS class_groups,
             COALESCE(GROUP_CONCAT(DISTINCT component.name), '') || ' ' ||
               COALESCE(GROUP_CONCAT(DISTINCT class_group.name), '') AS search_context
      FROM teachers teacher
      LEFT JOIN teacher_assignments assignment ON assignment.teacher_id = teacher.id
        AND assignment.status = 'active' AND (? IS NULL OR assignment.school_year_id = ?)
      LEFT JOIN components component ON component.id = assignment.component_id
      LEFT JOIN class_groups class_group ON class_group.id = assignment.class_group_id
      GROUP BY teacher.id, teacher.display_name
    )`;
    const result = await this.db
      .prepare(searchSql(cte, 'id, search_name, components, class_groups', tokens.length))
      .bind(
        query.schoolYearId ?? null,
        query.schoolYearId ?? null,
        ...bindings(normalized, tokens, query.limitPerType),
      )
      .all<Row>();
    const rows = result.results ?? [];
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        displayName: String(row.search_name),
        components: values(row.components),
        classGroups: values(row.class_groups),
      })),
      total,
      hasMore: total > rows.length,
    };
  }

  private async classGroups(
    query: PesquisaGlobalQuery,
    normalized: string,
    tokens: string[],
  ): Promise<PesquisaBucket<PesquisaClassGroupItem>> {
    const cte = `WITH entity_rows AS (
      SELECT class_group.id, class_group.name AS search_name,
             class_group.school_year_id, school_year.name AS school_year_name,
             GROUP_CONCAT(DISTINCT component.name) AS components,
             GROUP_CONCAT(DISTINCT teacher.display_name) AS teachers,
             COUNT(DISTINCT CASE WHEN assignment.status = 'active' THEN assignment.id END) AS active_assignments,
             school_year.name || ' ' || COALESCE(GROUP_CONCAT(DISTINCT component.name), '') || ' ' ||
               COALESCE(GROUP_CONCAT(DISTINCT teacher.display_name), '') AS search_context
      FROM class_groups class_group
      JOIN school_years school_year ON school_year.id = class_group.school_year_id
      LEFT JOIN teacher_assignments assignment ON assignment.class_group_id = class_group.id
        AND assignment.status = 'active'
      LEFT JOIN components component ON component.id = assignment.component_id
      LEFT JOIN teachers teacher ON teacher.id = assignment.teacher_id
      WHERE (? IS NULL OR class_group.school_year_id = ?)
      GROUP BY class_group.id, class_group.name, class_group.school_year_id, school_year.name
    )`;
    const result = await this.db
      .prepare(
        searchSql(
          cte,
          'id, search_name, school_year_id, school_year_name, components, teachers, active_assignments',
          tokens.length,
        ),
      )
      .bind(
        query.schoolYearId ?? null,
        query.schoolYearId ?? null,
        ...bindings(normalized, tokens, query.limitPerType),
      )
      .all<Row>();
    const rows = result.results ?? [];
    const total = Number(rows[0]?.total_count ?? 0);
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        name: String(row.search_name),
        schoolYearId: String(row.school_year_id),
        schoolYearName: String(row.school_year_name),
        components: values(row.components),
        teachers: values(row.teachers),
        acompanhamentoAvailable: Number(row.active_assignments) > 0,
      })),
      total,
      hasMore: total > rows.length,
    };
  }

  async search(query: PesquisaGlobalQuery): Promise<PesquisaGlobalResult> {
    const normalized = normalizePesquisaText(query.q);
    const tokens = normalized.split(' ').filter(Boolean);
    const selected = new Set(query.types ?? allTypes);
    const [students, teachers, classGroups] = await Promise.all([
      selected.has('students')
        ? this.students(query, normalized, tokens)
        : Promise.resolve(emptyBucket<PesquisaStudentItem>()),
      selected.has('teachers')
        ? this.teachers(query, normalized, tokens)
        : Promise.resolve(emptyBucket<PesquisaTeacherItem>()),
      selected.has('classGroups')
        ? this.classGroups(query, normalized, tokens)
        : Promise.resolve(emptyBucket<PesquisaClassGroupItem>()),
    ]);
    return {
      query: query.q.trim().replace(/\s+/gu, ' '),
      normalizedQuery: normalized,
      limitPerType: query.limitPerType,
      results: { students, teachers, classGroups },
    };
  }
}
