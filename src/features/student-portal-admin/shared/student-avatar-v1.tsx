import { Avatar } from '@heroui/react/avatar';
import './student-avatar-v1.css';

/** Stable decorative fallback, never a generated photograph or student identity source. */
export function StudentAvatarV1({ id }: { id: string }) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return (
    <Avatar size="sm" className="pa-student-avatar" aria-hidden="true">
      <Avatar.Fallback data-tone={hash % 6} />
    </Avatar>
  );
}
