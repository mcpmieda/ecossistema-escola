/**
 * Institutional labels transcribed from CONFIGURAÇÃO!H3:I16, inspected 2026-09-10.
 * Shared populated rows in the two inspected source templates agree; one template
 * additionally supplies COMPUTACAO/CT. Missing entries are not synthesized.
 * This catalogue is presentation metadata, never the identity of a subject.
 */
export const SOURCE_SUBJECT_ABBREVIATIONS_V1: Readonly<Record<string, string>> = Object.freeze({
  PORTUGUES: 'P', MATEMATICA: 'M', HISTORIA: 'H', GEOGRAFIA: 'G', CIENCIAS: 'C',
  ARTE: 'A', RELIGIAO: 'RL', REDACAO: 'RD', 'ED. FISICA': 'F', ETICA: 'ET',
  INGLES: 'I', COMPUTACAO: 'CT',
});
export function sourceSubjectAbbreviationV1(name: string): string | null {
  const key = name.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').trim().replace(/\s+/gu, ' ').toUpperCase();
  return SOURCE_SUBJECT_ABBREVIATIONS_V1[key] ?? null;
}
