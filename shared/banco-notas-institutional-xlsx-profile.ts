import { xlsxLegacyAnalysisProfileSchema } from './banco-notas-xlsx-analysis-profile';

export const institutionalManualProfileKey = 'ieda-standard-overview-2026-v1' as const;

export const institutionalManualXlsxProfile = xlsxLegacyAnalysisProfileSchema.parse({
  schemaVersion: 1,
  profileId: institutionalManualProfileKey,
  analysisVersion: 'ieda-manual-upload-2026-v1',
  worksheetRules: [
    {
      ruleId: 'ieda-class-overview',
      sheetNamePattern: '^(?<class>[6-9][A-D])VG$',
      caseInsensitive: true,
      componentNameCell: 'K2',
      studentPositionColumn: 'J',
      studentNameColumn: 'K',
      firstStudentRow: 5,
      maxStudentRows: 46,
      gradeColumns: [
        { field: 'NotaT1', column: 'R' },
        { field: 'NotaT2', column: 'S' },
        { field: 'NotaT3', column: 'U' },
        { field: 'RecT1', column: 'W' },
        { field: 'RecT2', column: 'X' },
        { field: 'RecT3', column: 'Y' },
        { field: 'Total', column: 'V' },
        { field: 'NotaFinal', column: 'Z' },
      ],
    },
  ],
});
