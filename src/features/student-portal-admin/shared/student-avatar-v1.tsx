import { LinkedStudentPhotoAvatarV1 } from '../../student-photos/linked-student-photo-avatar-v1';
import './student-avatar-v1.css';

/** All callers provide a Portal account reference, never a guessed canonical person ID. */
export function StudentAvatarV1({ id, academicYear = 2026 }: { id: string; academicYear?: number }) {
  return <LinkedStudentPhotoAvatarV1 decorative size="sm" className="pa-student-avatar"
    subject={{ source: 'portal', academicYear, accountIds: [id] }} />;
}
