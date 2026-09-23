import { useEffect, useState } from 'react';
import { photoImageUrlV1, photoSubjectKeyV1 } from '../../../shared/student-photos/catalog-v1';
import { photoAdminSubjectV1, type PhotoAdminSubjectV1 } from '../../../shared/student-photos/admin-http-v1';
import { StudentPhotoAvatarV1, type StudentPhotoAvatarPropsV1 } from './student-photo-avatar-v1';
import { PHOTO_CHANGED_EVENT_V1, type PhotoChangedDetailV1 } from './catalog-client-v1';

export interface LinkedStudentPhotoAvatarPropsV1 extends Pick<StudentPhotoAvatarPropsV1, 'size' | 'label' | 'className' | 'decorative'> {
  subject: PhotoAdminSubjectV1;
  studentUid?: string;
  revision?: string | null;
}
export function LinkedStudentPhotoAvatarV1(props: Readonly<LinkedStudentPhotoAvatarPropsV1>) {
  const parsed = photoAdminSubjectV1.safeParse(props.subject);
  if (!parsed.success) return <StudentPhotoAvatarV1 size={props.size} label={props.label} className={props.className} decorative={props.decorative}
    identityKey={props.studentUid ?? 'unresolved-student'} />;
  return <LinkedAvatarSessionV1 key={photoSubjectKeyV1(parsed.data)} {...props} subject={parsed.data} />;
}
function LinkedAvatarSessionV1({ subject, studentUid, revision, ...props }: Readonly<LinkedStudentPhotoAvatarPropsV1>) {
  const subjectKey = photoSubjectKeyV1(subject);
  const [changed, setChanged] = useState<PhotoChangedDetailV1>();
  useEffect(() => {
    const update = (event: Event) => {
      if (!(event instanceof CustomEvent)) return;
      const value = event.detail as Partial<PhotoChangedDetailV1> | undefined;
      if (value?.subjectKey !== subjectKey && (!studentUid || value?.studentUid !== studentUid)) return;
      if (typeof value?.studentUid !== 'string' || (value.revision !== null && typeof value.revision !== 'string')) return;
      setChanged(value as PhotoChangedDetailV1);
    };
    window.addEventListener(PHOTO_CHANGED_EVENT_V1, update);
    return () => window.removeEventListener(PHOTO_CHANGED_EVENT_V1, update);
  }, [subjectKey, studentUid]);
  const identityKey = changed?.studentUid ?? studentUid ?? subjectKey;
  const currentRevision = changed ? changed.revision : revision;
  const src = photoImageUrlV1(subject, 'avatar', currentRevision);
  return <StudentPhotoAvatarV1 {...props} identityKey={identityKey} photo={{ identityKey, src }} />;
}
