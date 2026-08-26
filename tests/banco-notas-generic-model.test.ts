import { describe, expect, it } from 'vitest';
import {
  genericModelDefinitionSchema,
  genericModelInstanceSchema,
  legacyIntermediateModelSchema,
  type GenericModelDefinition,
  type LegacyIntermediateModel,
  type RelationshipResolution,
} from '../shared/banco-notas-generic-model';
import { buildGenericTransformationPlan } from '../server/banco-notas/generic-model';

const definition: GenericModelDefinition = genericModelDefinitionSchema.parse({
  schemaVersion: 1,
  definitionVersion: '2026.1',
  blankMeans: 'absent',
  calculationAuthority: 'server',
  relationshipMode: 'manual-wizard',
  defaultEnvironment: 'homologation',
  defaultSyncEnabled: false,
  gradeFields: ['NotaT1', 'NotaT2', 'RecT1', 'Total', 'NotaFinal'],
});

function locator(sheetId: string, sheetDisplayName: string, cellAddress: string) {
  return { sheetId, sheetDisplayName, cellAddress };
}

function legacyOne(): LegacyIntermediateModel {
  return legacyIntermediateModelSchema.parse({
    schemaVersion: 1,
    sourceFormat: 'xlsb',
    sourceHash: 'a'.repeat(64),
    schoolYear: 2026,
    analysisVersion: '1.0',
    classes: [
      {
        sourceClassId: 'class-a',
        displayName: 'Turma Alfa',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'A2'),
      },
    ],
    components: [
      {
        sourceComponentId: 'component-math',
        displayName: 'Componente Sintético A',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'B2'),
      },
    ],
    students: [
      {
        sourceStudentId: 'student-001',
        displayName: 'Estudante Sintético Um',
        sourceClassId: 'class-a',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'A12'),
      },
    ],
    gradeSlots: [
      {
        sourceGradeSlotId: 'slot-001',
        sourceClassId: 'class-a',
        sourceComponentId: 'component-math',
        sourceStudentId: 'student-001',
        field: 'NotaT1',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'F12'),
      },
    ],
    findings: [],
  });
}

function resolutionsOne(): RelationshipResolution[] {
  return [
    {
      sourceClassId: 'class-a',
      classGroupId: '11111111-1111-4111-8111-111111111111',
      sourceComponentId: 'component-math',
      componentId: '22222222-2222-4222-8222-222222222222',
      sourceStudentId: 'student-001',
      studentId: '33333333-3333-4333-8333-333333333333',
    },
  ];
}

describe('Banco de Notas generic model transformation contract', () => {
  it('builds target identifiers only from canonical relationships, never source names or cells', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
      resolutions: resolutionsOne(),
    });

    expect(plan.readyToGenerate).toBe(true);
    expect(plan.blockers).toEqual([]);
    expect(plan.mappings).toHaveLength(1);
    const serializedTargets = JSON.stringify(plan.mappings);
    expect(serializedTargets).not.toContain('Turma Alfa');
    expect(serializedTargets).not.toContain('Componente Sintético A');
    expect(serializedTargets).not.toContain('Estudante Sintético Um');
    expect(serializedTargets).not.toContain('Planilha Principal');
    expect(serializedTargets).not.toContain('F12');
    expect(plan.mappings[0]?.gradeKey).toBe(
      '2026|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333',
    );
  });

  it('accepts a different workbook shape without changing the generic definition', () => {
    const legacy = legacyIntermediateModelSchema.parse({
      schemaVersion: 1,
      sourceFormat: 'xlsx',
      sourceHash: 'b'.repeat(64),
      schoolYear: 2026,
      analysisVersion: '1.0',
      classes: [
        {
          sourceClassId: 'class-x',
          displayName: 'Grupo X',
          sourceLocator: locator('sheet-x', 'Aba X', 'C3'),
        },
        {
          sourceClassId: 'class-y',
          displayName: 'Grupo Y',
          sourceLocator: locator('sheet-y', 'Aba Y com outro formato', 'D4'),
        },
      ],
      components: [
        {
          sourceComponentId: 'component-a',
          displayName: 'Componente A',
          sourceLocator: locator('sheet-x', 'Aba X', 'E3'),
        },
        {
          sourceComponentId: 'component-b',
          displayName: 'Componente B',
          sourceLocator: locator('sheet-y', 'Aba Y com outro formato', 'G4'),
        },
      ],
      students: [
        {
          sourceStudentId: 'student-x',
          displayName: 'Pessoa Sintética X',
          sourceClassId: 'class-x',
          sourceLocator: locator('sheet-x', 'Aba X', 'A20'),
        },
        {
          sourceStudentId: 'student-y',
          displayName: 'Pessoa Sintética Y',
          sourceClassId: 'class-y',
          sourceLocator: locator('sheet-y', 'Aba Y com outro formato', 'B31'),
        },
      ],
      gradeSlots: [
        {
          sourceGradeSlotId: 'slot-x-t1',
          sourceClassId: 'class-x',
          sourceComponentId: 'component-a',
          sourceStudentId: 'student-x',
          field: 'NotaT1',
          sourceLocator: locator('sheet-x', 'Aba X', 'J20'),
        },
        {
          sourceGradeSlotId: 'slot-y-final',
          sourceClassId: 'class-y',
          sourceComponentId: 'component-b',
          sourceStudentId: 'student-y',
          field: 'NotaFinal',
          sourceLocator: locator('sheet-y', 'Aba Y com outro formato', 'Q31'),
        },
      ],
      findings: ['synthetic_shape_b'],
    });
    const resolutions: RelationshipResolution[] = [
      {
        sourceClassId: 'class-x',
        classGroupId: '55555555-5555-4555-8555-555555555555',
        sourceComponentId: 'component-a',
        componentId: '66666666-6666-4666-8666-666666666666',
        sourceStudentId: 'student-x',
        studentId: '77777777-7777-4777-8777-777777777777',
      },
      {
        sourceClassId: 'class-y',
        classGroupId: '88888888-8888-4888-8888-888888888888',
        sourceComponentId: 'component-b',
        componentId: '99999999-9999-4999-8999-999999999999',
        sourceStudentId: 'student-y',
        studentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ];

    const plan = buildGenericTransformationPlan({
      legacy,
      definition,
      relationshipSnapshotId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      resolutions,
    });
    expect(plan.readyToGenerate).toBe(true);
    expect(plan.mappings).toHaveLength(2);
    expect(plan.findings).toContain('synthetic_shape_b');
  });

  it('blocks generation instead of guessing when correspondence is incomplete', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      resolutions: [],
    });

    expect(plan.readyToGenerate).toBe(false);
    expect(plan.mappings).toEqual([]);
    expect(plan.blockers).toContain('unresolved_grade_slot:slot-001:class,component,student');
    expect(plan.findings).toContain('not_all_grade_slots_are_resolved');
  });

  it('blocks ambiguous correspondence and duplicate canonical grade targets', () => {
    const first = resolutionsOne()[0]!;
    const ambiguous: RelationshipResolution[] = [
      first,
      {
        ...first,
        classGroupId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      },
    ];
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      resolutions: ambiguous,
    });
    expect(plan.readyToGenerate).toBe(false);
    expect(plan.blockers).toContain('ambiguous_sourceClassId:class-a');
  });

  it('keeps generated instances fail-closed in homologation with sync disabled', () => {
    const valid = genericModelInstanceSchema.parse({
      schemaVersion: 1,
      modelId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      teacherEntraObjectId: '12121212-1212-4212-8212-121212121212',
      schoolYear: 2026,
      definitionVersion: '2026.1',
      sourceHash: 'c'.repeat(64),
      relationshipSnapshotId: '13131313-1313-4313-8313-131313131313',
      environment: 'homologation',
      syncEnabled: false,
      mappingVersion: 1,
      mappings: [
        {
          gradeKey:
            '2026|11111111-1111-4111-8111-111111111111|22222222-2222-4222-8222-222222222222|33333333-3333-4333-8333-333333333333',
          field: 'NotaT1',
          sheetKey: 'generated-sheet-1',
          cellAddress: 'F12',
        },
      ],
    });
    expect(valid.syncEnabled).toBe(false);
    expect(() => genericModelInstanceSchema.parse({ ...valid, syncEnabled: true })).toThrow();
    expect(() => genericModelInstanceSchema.parse({ ...valid, environment: 'production' })).toThrow();
  });
});
