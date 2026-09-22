export function qrFilenameV1(label: string | undefined, extension: 'pdf' | 'png') {
  const normalized = Array.from((label ?? '').normalize('NFC'), (character) => {
    const point = character.codePointAt(0)!;
    return point <= 31 || point === 127 ? ' ' : character;
  }).join('');
  const clean = normalized
    .replace(/[\\/:*?"<>|]/gu, ' ')
    .replace(/[_\s]+/gu, ' ')
    .trim()
    .replace(/[. ]+$/u, '')
    .slice(0, 100)
    .trim();
  return (clean ? `QR DO ${clean}` : 'QR DE ACESSO').toLocaleUpperCase('pt-BR') + '.' + extension;
}
