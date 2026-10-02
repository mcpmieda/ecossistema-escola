import type {
  GradebookImportOfferV9,
  GradebookImportTermV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import type { ImportInstrumentStateV11 } from '../../persistence/postgres/relational-import-read-set-v11';
import {
  isRelationalInstrumentMeaningfulV9,
  parseRelationalInstrumentKeyV9,
  resolveRelationalInstrumentMetadataV9,
  shouldRetireQualitativeInstrumentV9,
  type RelationalInstrumentMetadataV9,
} from './import-relational-instrument-decisions-v9';

interface InstrumentSourceV11 {
  readonly key: string;
  readonly ofertaId: number;
  readonly term: GradebookImportTermV9;
  readonly column: number;
  readonly hasValue: boolean;
  readonly metadata: RelationalInstrumentMetadataV9;
}
export type ImportInstrumentPlanEntryV11 =
  | (InstrumentSourceV11 & { readonly action: 'create' })
  | (InstrumentSourceV11 & { readonly action: 'update' | 'preserve'; readonly existingId: number });
export interface ImportInstrumentRetirementV11 {
  readonly key: string;
  readonly id: number;
  readonly ofertaId: number;
}
export interface ImportInstrumentPlanV11 {
  readonly entries: readonly ImportInstrumentPlanEntryV11[];
  readonly retirements: readonly ImportInstrumentRetirementV11[];
}

/** Only reorganizes V9's decisions; the request and original observation set stay unchanged. */
export function buildRelationalImportInstrumentPlanV11(input: {
  readonly ofertaId: number;
  readonly offer: GradebookImportOfferV9;
  readonly granularObservationVersion: 1 | undefined;
  readonly instruments: ReadonlyMap<string, ImportInstrumentStateV11>;
}): ImportInstrumentPlanV11 {
  const entries: ImportInstrumentPlanEntryV11[] = [];
  const retirements: ImportInstrumentRetirementV11[] = [];
  const plannedKeys = new Set<string>();
  for (const term of input.offer.trimestres) {
    const authoritativeDefinitions = term.definitionSnapshotVersion === 1;
    const unavailableMaximum = new Set(term.unavailableMaximumSlots ?? []);
    const unavailableDescription = new Set(term.unavailableDescriptionSlots ?? []);
    const unavailableValues = new Set(term.unavailableValueSlots ?? []);
    const incomingSlots = new Set(term.instrumentos.map(([slot]) => slot));
    if (authoritativeDefinitions)
      for (const [key, current] of input.instruments) {
        const parsed = parseRelationalInstrumentKeyV9(key);
        if (
          shouldRetireQualitativeInstrumentV9({
            currentTerm: parsed.term,
            currentSlot: parsed.slot,
            incomingTerm: term.trimestre,
            incomingSlots,
            unavailableMaximum,
            unavailableDescription,
            unavailableValues,
          })
        )
          retirements.push({ key, id: current.id, ofertaId: input.ofertaId });
      }
    for (const [column, [slot, sourceMaximum, sourceDescription]] of term.instrumentos.entries()) {
      const key = `${term.trimestre}:${slot}`;
      if (plannedKeys.has(key)) throw new Error('gradebook-import-instrument-plan-duplicate-key');
      plannedKeys.add(key);
      const current = input.instruments.get(key);
      const hasValue = term.alunos.some(([, values]) => typeof values[column] === 'number');
      if (
        !isRelationalInstrumentMeaningfulV9({
          sourceMaximum,
          sourceDescription,
          hasValue,
          exists: current !== undefined,
          granularObservationVersion: input.granularObservationVersion,
          slot,
        })
      )
        continue;
      const metadata = resolveRelationalInstrumentMetadataV9({
        current: current ?? null,
        sourceMaximum,
        sourceDescription,
        authoritativeDefinitions,
        maximumUnavailable: authoritativeDefinitions && unavailableMaximum.has(slot),
        descriptionUnavailable: authoritativeDefinitions && unavailableDescription.has(slot),
      });
      const source: InstrumentSourceV11 = {
        key,
        ofertaId: input.ofertaId,
        term,
        column,
        hasValue,
        metadata,
      };
      if (!current) entries.push({ ...source, action: 'create' });
      else
        entries.push({
          ...source,
          existingId: current.id,
          action:
            metadata.maximo !== current.maximo || metadata.descricao !== current.descricao
              ? 'update'
              : 'preserve',
        });
    }
  }
  return { entries, retirements };
}
