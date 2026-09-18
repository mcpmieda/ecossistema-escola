import type {
  GradebookImportInstrumentV9,
  GradebookImportPersistenceRequestV9,
  GradebookNotesImportRequestV9,
} from '../imports/import-persistence-transport-v9';

type InstrumentSlotV9 = GradebookImportInstrumentV9[0];

interface CorrectionKeyV1 {
  readonly ano: 2026;
  readonly professor: string;
  readonly turma: string;
  readonly disciplina: string;
  readonly trimestre: 1 | 2;
  readonly slot: InstrumentSlotV9;
}

interface MaximumCorrectionV1 extends CorrectionKeyV1 {
  readonly kind: 'maximum';
  readonly sourceMaximums: readonly number[];
  readonly maximum: number;
  readonly sourceDescriptions: readonly string[];
}

interface SuppressCorrectionV1 extends CorrectionKeyV1 {
  readonly kind: 'suppress';
  readonly sourceMaximums: readonly (number | null)[];
  readonly sourceDescriptions: readonly string[];
}

type CorrectionV1 = MaximumCorrectionV1 | SuppressCorrectionV1;

function text(value: string | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '');
}

function identity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
}

const CORRECTIONS_V1: readonly CorrectionV1[] = [
  {
    kind: 'maximum',
    ano: 2026,
    professor: 'CLEBER',
    turma: '6A',
    disciplina: 'ETICA',
    trimestre: 2,
    slot: 12,
    sourceMaximums: [3000, 6000],
    maximum: 6000,
    sourceDescriptions: ['2AATIVIDADE', 'LLATV'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '6B',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 16,
    sourceMaximums: [null],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '6D',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 16,
    sourceMaximums: [1000],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '6D',
    disciplina: 'RELIGIAO',
    trimestre: 2,
    slot: 15,
    sourceMaximums: [500],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '7A',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 16,
    sourceMaximums: [null],
    sourceDescriptions: ['EXP'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '7B',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 16,
    sourceMaximums: [null],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '7C',
    disciplina: 'RELIGIAO',
    trimestre: 2,
    slot: 14,
    sourceMaximums: [4500],
    sourceDescriptions: ['PD'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '7D',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 15,
    sourceMaximums: [1000],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '7D',
    disciplina: 'RELIGIAO',
    trimestre: 2,
    slot: 15,
    sourceMaximums: [null],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '8A',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 15,
    sourceMaximums: [4500],
    sourceDescriptions: ['PD'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '8B',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 15,
    sourceMaximums: [4500],
    sourceDescriptions: ['PD'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'LURMARIA',
    turma: '8B',
    disciplina: 'RELIGIAO',
    trimestre: 1,
    slot: 16,
    sourceMaximums: [1000],
    sourceDescriptions: ['EX'],
  },
  {
    kind: 'suppress',
    ano: 2026,
    professor: 'EDILMA',
    turma: '8C',
    disciplina: 'CIENCIAS',
    trimestre: 1,
    slot: 13,
    sourceMaximums: [3000],
    sourceDescriptions: ['IIATIV'],
  },
] as const;

function correctionFor(input: {
  readonly ano: number;
  readonly professor: string;
  readonly turmaCodigo: string;
  readonly disciplina: string;
  readonly trimestre: 1 | 2 | 3;
  readonly slot: InstrumentSlotV9;
}): CorrectionV1 | null {
  if (input.ano !== 2026 || input.trimestre === 3) return null;
  const professor = identity(input.professor);
  const turma = identity(input.turmaCodigo);
  const disciplina = identity(input.disciplina);
  return (
    CORRECTIONS_V1.find(
      (item) =>
        item.ano === input.ano &&
        item.professor === professor &&
        item.turma === turma &&
        item.disciplina === disciplina &&
        item.trimestre === input.trimestre &&
        item.slot === input.slot,
    ) ?? null
  );
}

function acceptedSource(
  correction: CorrectionV1,
  definition: GradebookImportInstrumentV9,
): boolean {
  const [, maximum, description] = definition;
  // The already-corrected representation is deliberately accepted so the
  // browser and server can apply the same transform idempotently.
  if (correction.kind === 'suppress' && maximum === null && description === undefined)
    return true;
  if (
    !correction.sourceMaximums.some((value) => value === maximum) ||
    !correction.sourceDescriptions.includes(text(description))
  )
    return false;
  return true;
}

export function correctInstitutionalQualitativeDefinitionV1(input: {
  readonly ano: number;
  readonly professor: string;
  readonly turmaCodigo: string;
  readonly disciplina: string;
  readonly trimestre: 1 | 2 | 3;
  readonly definition: GradebookImportInstrumentV9;
}): GradebookImportInstrumentV9 {
  const correction = correctionFor({
    ano: input.ano,
    professor: input.professor,
    turmaCodigo: input.turmaCodigo,
    disciplina: input.disciplina,
    trimestre: input.trimestre,
    slot: input.definition[0],
  });
  if (!correction) return input.definition;
  if (!acceptedSource(correction, input.definition)) {
    throw new Error(
      `Correção qualitativa 2026 precisa ser revista: ${input.turmaCodigo} / ${input.disciplina} / T${input.trimestre} / slot ${input.definition[0]} mudou na fonte.`,
    );
  }
  if (correction.kind === 'suppress') return [input.definition[0], null] as const;
  return input.definition[2] === undefined
    ? ([input.definition[0], correction.maximum] as const)
    : ([input.definition[0], correction.maximum, input.definition[2]] as const);
}

function applyToNotesRequestV1(
  request: GradebookNotesImportRequestV9,
): GradebookNotesImportRequestV9 {
  const offers = request.ofertas.map((offer) => {
    const trimestres = offer.trimestres.map((term) => {
      const instrumentos = term.instrumentos.map((definition) =>
        correctInstitutionalQualitativeDefinitionV1({
          ano: request.ano,
          professor: request.professor,
          turmaCodigo: offer.turmaCodigo,
          disciplina: offer.disciplina,
          trimestre: term.trimestre,
          definition,
        }),
      );
      for (const [column, definition] of instrumentos.entries()) {
        const correction = correctionFor({
          ano: request.ano,
          professor: request.professor,
          turmaCodigo: offer.turmaCodigo,
          disciplina: offer.disciplina,
          trimestre: term.trimestre,
          slot: definition[0],
        });
        if (correction?.kind !== 'suppress') continue;
        const unsafe = term.alunos.some(([, values]) => values[column] !== null);
        if (unsafe) {
          throw new Error(
            `Correção qualitativa 2026 bloqueada: ${offer.turmaCodigo} / ${offer.disciplina} / T${term.trimestre} / slot ${definition[0]} passou a conter lançamento. Revise a fonte antes de importar.`,
          );
        }
      }
      return { ...term, instrumentos };
    }) as unknown as GradebookNotesImportRequestV9['ofertas'][number]['trimestres'];
    return { ...offer, trimestres };
  });
  return { ...request, ofertas: offers };
}

/**
 * Explicit 2026 institutional source corrections proved in #855.
 *
 * They are intentionally narrow and fail closed when the source no longer
 * matches the investigated state. T3 is excluded because it is still open.
 */
export function applyInstitutionalQualitativeCorrectionsV1(
  request: GradebookImportPersistenceRequestV9,
): GradebookImportPersistenceRequestV9 {
  return request.operation === 'persist-notas' ? applyToNotesRequestV1(request) : request;
}
