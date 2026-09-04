import type { ImportedGradeValueV1 } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import type {
  SourceCellEvidenceV1,
  SourceCellProvenanceV1,
} from '../../../../shared/gradebook-contracts/source/source-contract-v1';
import type { GradebookImportResultCellObservationV4 } from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v4';
import {
  interpretSourceCell,
  type SourceCellInterpretation,
} from '../../../../src/gradebook-domain/source/interpret-source-cell';

export type GradebookImportResultCellMaterializationV4 =
  | {
      readonly status: 'ready';
      readonly imported: ImportedGradeValueV1;
      readonly interpretation: SourceCellInterpretation;
    }
  | {
      readonly status: 'review-required';
      readonly interpretation: SourceCellInterpretation;
    };

export function gradebookImportResultCellEvidenceV4(
  observation: GradebookImportResultCellObservationV4,
  provenance: SourceCellProvenanceV1,
): SourceCellEvidenceV1 {
  switch (observation.classification) {
    case 'missing-field':
      return { classification: 'missing-field', rawValue: undefined, provenance };
    case 'empty':
      return { classification: 'empty', rawValue: observation.rawValue, provenance };
    case 'manual-positive-number':
      return {
        classification: 'manual-positive-number',
        rawValue: observation.rawValue,
        provenance,
      };
    case 'manual-negative-number':
      return {
        classification: 'manual-negative-number',
        rawValue: observation.rawValue,
        provenance,
      };
    case 'manual-legacy-zero':
      return { classification: 'manual-legacy-zero', rawValue: 0, provenance };
    case 'manual-official-zero-marker':
      return { classification: 'manual-official-zero-marker', rawValue: 0.1, provenance };
    case 'formula-nonzero':
      return {
        classification: 'formula-nonzero',
        rawValue: observation.rawValue,
        formula: observation.formula,
        cachedValue: observation.cachedValue,
        provenance,
      };
    case 'formula-zero':
      return {
        classification: 'formula-zero',
        rawValue: observation.rawValue,
        formula: observation.formula,
        cachedValue: 0,
        provenance,
      };
    case 'formula-error-or-missing-cache':
      return {
        classification: 'formula-error-or-missing-cache',
        rawValue: observation.rawValue,
        formula: observation.formula,
        cachedValue: null,
        sourceError: observation.sourceError,
        provenance,
      };
    case 'invalid-text':
      return { classification: 'invalid-text', rawValue: observation.rawValue, provenance };
  }
}

export function materializeGradebookImportResultCellObservationV4(input: {
  readonly observation: GradebookImportResultCellObservationV4;
  readonly provenance: SourceCellProvenanceV1;
  readonly maximumValue: number;
}): GradebookImportResultCellMaterializationV4 {
  const evidence = gradebookImportResultCellEvidenceV4(input.observation, input.provenance);
  if (
    input.observation.classification === 'formula-error-or-missing-cache' &&
    (input.observation.rawValue === null || input.observation.rawValue === '') &&
    input.observation.sourceError === null
  ) {
    const interpretation: SourceCellInterpretation = {
      present: false,
      sourceValue: input.observation.rawValue,
      semanticValue: { state: 'absent' },
      valid: true,
      classification: evidence.classification,
      evidence,
      occurrences: [],
    };
    return {
      status: 'ready',
      imported: { value: interpretation.semanticValue, evidence: [evidence] },
      interpretation,
    };
  }
  const interpretation = interpretSourceCell(evidence, { maximumValue: input.maximumValue });
  if (!interpretation.valid) return { status: 'review-required', interpretation };
  return {
    status: 'ready',
    imported: { value: interpretation.semanticValue, evidence: [evidence] },
    interpretation,
  };
}
