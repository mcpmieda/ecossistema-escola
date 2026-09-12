import type { D1WriteDatabaseV1 } from '../../../gradebook/persistence/d1/write/d1-write-adapter-v1';
import { lockYearResetV1 } from './proof-v1';

export async function lockResetWriterV1(
  transaction: D1WriteDatabaseV1,
  year: number,
): Promise<void> {
  await lockYearResetV1(transaction, year, 'preview');
  await transaction
    .prepare('SELECT student_portal.ensure_year_coordination_v1(?::smallint)')
    .bind(year)
    .first();
}

export async function recordResetWriteV1(
  transaction: D1WriteDatabaseV1,
  year: number,
  cause: 'diagnostics' | 'audit-treatment' | 'bulletin-snapshot' | 'relation' | 'marks' | 'council',
  academic: { changed: boolean; studentIds?: readonly number[] } = { changed: false },
): Promise<void> {
  const studentIds = [...new Set(academic.studentIds ?? [])].sort((a, b) => a - b);
  if (studentIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) throw new Error('student-portal-revision-student-invalid');
  if (academic.changed && !['relation', 'marks', 'council'].includes(cause)) throw new Error('student-portal-revision-cause-invalid');
  const result = await transaction
    .prepare(
      `SELECT reset_version FROM student_portal.record_gradebook_change_v1(
      ?::uuid,?::smallint,?::text,?::boolean,
      ARRAY(SELECT value::integer FROM jsonb_array_elements_text(?::jsonb)),statement_timestamp())`,
    )
    .bind(crypto.randomUUID(), year, cause, academic.changed ? 1 : 0, JSON.stringify(studentIds))
    .first<{ reset_version: unknown }>();
  if (!result || typeof result.reset_version !== 'string') {
    throw new Error('year-reset-writer-revision-unavailable');
  }
  if (year === 2026 && cause === 'relation' && academic.changed) {
    const synchronized = await transaction.prepare('SELECT * FROM student_portal.synchronize_gradebook_profiles_v1()').first();
    if (!synchronized) throw new Error('student-portal-lifecycle-unavailable');
  }
}

export async function recordImportResetWriteV1(
  transaction: D1WriteDatabaseV1,
  year: number,
  cause: 'relation' | 'marks',
  academic: { changed: boolean; studentIds?: readonly number[] } = { changed: false },
): Promise<void> {
  const buffered = transaction as D1WriteDatabaseV1 & {
    afterImportFlush?: (operation: (database: D1WriteDatabaseV1) => Promise<void>) => void;
  };
  if (typeof buffered.afterImportFlush === 'function') {
    buffered.afterImportFlush((database) => recordResetWriteV1(database, year, cause, academic));
  } else {
    await recordResetWriteV1(transaction, year, cause, academic);
  }
}
