import { useState } from 'react';
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
export function StudentPhotoAvatarV1({ identityKey, photo, label = 'Foto do aluno', size = 'md', className }: Readonly<StudentPhotoAvatarPropsV1>) {
  const [failed, setFailed] = useState<string>();
  const sameOwner = photo?.identityKey.toLowerCase() === identityKey.toLowerCase();
  const candidate = sameOwner ? photo?.src : undefined;
  const imageKey = identityKey.toLowerCase() + ':' + (candidate ?? '');
  const src = candidate && imageKey !== failed && (candidate.startsWith('blob:') || candidate.startsWith('/api/')) ? candidate : undefined;
  const backgroundColor = `hsl(${photoFallbackHueV1(identityKey)} 48% 44%)`;
  return <Avatar key={imageKey + ':' + (src ? 'image' : 'fallback')} size={size} className={className} role="img" aria-label={label}
    style={{ backgroundColor, borderRadius: '50%' }}>
    {src ? <Avatar.Image src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(imageKey)} /> : null}
    <Avatar.Fallback aria-hidden="true" style={{ backgroundColor }}><span /></Avatar.Fallback>
  </Avatar>;
}
