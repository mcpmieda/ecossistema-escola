import type postgres from 'postgres';
import { ACADEMIC_FIXTURE_SQL_V1 } from '../academic/academic-fixture-v1';

/** New synthetic namespace on each run; lives only in the disposable cluster. */
export async function installIntegrationFixtureV1(sql: ReturnType<typeof postgres>) {
  const base = 757000 + Math.floor(Math.random() * 10000) * 1000;
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
