import type postgres from 'postgres';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';

/** New synthetic namespace on each run; lives only in the disposable cluster. */
export async function installIntegrationFixtureV1(sql: ReturnType<typeof postgres>) {
  // A deterministic free range avoids colliding with runtime fixtures or a prior local QA run.
  const rows = await sql.unsafe(`SELECT GREATEST(
    (SELECT COALESCE(max(id),0) FROM gradebook.turma),
    (SELECT COALESCE(max(id),0) FROM gradebook.aluno),
    (SELECT COALESCE(max(id),0) FROM gradebook.professor),
    (SELECT COALESCE(max(id),0) FROM gradebook.disciplina),
    (SELECT COALESCE(max(id),0) FROM gradebook.oferta),
    (SELECT COALESCE(max(id),0) FROM gradebook.instrumento))::text AS max_id`);
  const base = Math.ceil(Math.max(10_000_000, Number(rows[0]!.max_id)) / 1000) * 1000 + 1000;
  if (!Number.isSafeInteger(base) || base + 500 > 2_147_483_647)
    throw new Error('Disposable fixture namespace exhausted');
  const classId = base + 1;
  const prefix = 'SYNTHETIC P757 ' + base;
  await sql.begin((tx) =>
    tx.unsafe(
      ACADEMIC_FIXTURE_SQL_V1.replaceAll('910002', String(base + 2))
        .replaceAll('910001', String(base + 1))
        .replaceAll('910000', String(base))
        .replaceAll("'S710'", "'I757-" + base + "'")
        .replaceAll("'S712'", "'E757-" + base + "'")
        .replaceAll('SYNTHETIC ACADEMIC CLASS', prefix + ' CLASS')
        .replaceAll('SYNTHETIC NEXT CLASS', prefix + ' EMPTY')
        .replaceAll('SYNTHETIC ACADEMIC ONE', prefix + ' ONE')
        .replaceAll('SYNTHETIC PRIVATE TEACHER', prefix + ' TEACHER')
        .replaceAll("'MATEMATICA'", "'" + prefix + " MATH'")
        .replaceAll("'PORTUGUES'", "'" + prefix + " LANGUAGE'")
        .replaceAll('SYNTHETIC ACADEMIC OTHER', prefix + ' OTHER'),
    ),
  );
  return {
    classId,
    emptyClassId: base + 2,
    studentId: base + 1,
    otherStudentId: base + 2,
    prefix,
    scope: { kind: 'class', academicYear: 2026, classId } as const,
  };
}
