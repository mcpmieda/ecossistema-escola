import { LinkedStudentPhotoAvatarV1 } from '../../student-photos/linked-student-photo-avatar-v1';
import './student-avatar-v1.css';

/** All callers provide a Portal account reference, never a guessed canonical person ID. */
export function StudentAvatarV1({ id, academicYear = 2026, detail = false }: { id: string; academicYear?: number; detail?: boolean }) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return <LinkedStudentPhotoAvatarV1 decorative size={detail ? 'lg' : 'sm'} loading={detail ? 'eager' : 'lazy'} fallbackTone={hash % 6} className="pa-student-avatar"
    subject={{ source: 'portal', academicYear, accountIds: [id] }} />;
}
