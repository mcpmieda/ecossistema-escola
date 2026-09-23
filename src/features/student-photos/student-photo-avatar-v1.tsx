import { Avatar } from '@heroui/react/avatar';
import { photoFallbackHueV1 } from '../../../shared/student-photos/crop-v1';

export interface StudentPhotoAvatarPropsV1 {
  identityKey: string;
  photo?: { identityKey: string; src: string };
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}
/** No initials, random-on-render colors, external URLs or implicit fetch per list row. */
export function StudentPhotoAvatarV1({ identityKey, photo, label = 'Foto do aluno', size = 'md', className }: StudentPhotoAvatarPropsV1) {
  const sameOwner = photo?.identityKey.toLowerCase() === identityKey.toLowerCase();
  const candidate = sameOwner ? photo?.src : undefined;
  const src = candidate && (candidate.startsWith('blob:') || candidate.startsWith('/api/')) ? candidate : undefined;
  return <Avatar key={identityKey + ':' + (src ?? '')} size={size} className={className} role="img" aria-label={label}
    style={{ backgroundColor: `hsl(${photoFallbackHueV1(identityKey)} 48% 44%)` }}>
    {src ? <Avatar.Image src={src} alt="" loading="lazy" decoding="async" /> : null}
    <Avatar.Fallback aria-hidden="true"><span /></Avatar.Fallback>
  </Avatar>;
}
