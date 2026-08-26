import { describe, expect, it } from 'vitest';
import {
  genericModelDefinitionSchema,
  genericModelInstanceSchema,
  legacyIntermediateModelSchema,
  type RelationshipResolution,
} from '../shared/banco-notas-generic-model';
import {
  buildGenericTransformationPlan,
  generateGenericModelInstance,
} from '../server/banco-notas/generic-model';

const definition = genericModelDefinitionSchema.parse({
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

function legacyOne() {
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
        sourceComponentId: 'component-a',
        displayName: 'Componente Sintético',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'B2'),
      },
    ],
    students: [
      {
        sourceStudentId: 'student-001',
        displayName: 'Estudante Sintético',
        sourceClassId: 'class-a',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'A12'),
      },
    ],
    gradeSlots: [
      {
        sourceGradeSlotId: 'slot-001',
        sourceClassId: 'class-a',
        sourceComponentId: 'component-a',
        sourceStudentId: 'student-001',
        field: 'NotaT1',
        sourceLocator: locator('sheet-main', 'Planilha Principal', 'F12'),
      },
    ],
    findings: [],
  });
}

function resolution(overrides: Partial<RelationshipResolution> = {}): RelationshipResolution {
  return {
    sourceClassId: 'class-a',
    classGroupId: '11111111-1111-4111-8111-111111111111',
    sourceComponentId: 'component-a',
    componentId: '22222222-2222-4222-8222-222222222222',
    sourceStudentId: 'student-001',
    studentId: '33333333-3333-4333-8333-333333333333',
    ...overrides,
  };
}

describe('Banco de Notas generic model transformation contract', () => {
  it('uses canonical relationships instead of source names and cells in target identifiers', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
      resolutions: [resolution()],
    });
    const targets = JSON.stringify(plan.mappings);

    expect(plan.readyToGenerate).toBe(true);
    expect(plan.mappings).toHaveLength(1);
    for (const sourceDetail of [
      'Turma Alfa',
      'Componente Sintético',
      'Estudante Sintético',
      'Planilha Principal',
      'F12',
    ]) {
      expect(targets).not.toContain(sourceDetail);
    }
    expect(plan.mappings[0]?.gradeKey).toContain('11111111-1111-4111-8111-111111111111');
  });

  it('accepts a second workbook shape without changing the generic definition', () => {
    const base = legacyOne();
    const second = legacyIntermediateModelSchema.parse({
      ...base,
      sourceFormat: 'xlsx',
      sourceHash: 'b'.repeat(64),
      classes: [
        ...base.classes,
        {
          sourceClassId: 'class-b',
          displayName: 'Grupo com outra estrutura',
          sourceLocator: locator('sheet-other', 'Outra aba', 'D4'),
        },
      ],
      students: [
        ...base.students,
        {
          sourceStudentId: 'student-002',
          displayName: 'Outra pessoa sintética',
          sourceClassId: 'class-b',
          sourceLocator: locator('sheet-other', 'Outra aba', 'A31'),
        },
      ],
      gradeSlots: [
        ...base.gradeSlots,
        {
          sourceGradeSlotId: 'slot-002',
          sourceClassId: 'class-b',
          sourceComponentId: 'component-a',
          sourceStudentId: 'student-002',
          field: 'NotaFinal',
          sourceLocator: locator('sheet-other', 'Outra aba', 'Q31'),
        },
      ],
      findings: ['synthetic_shape_b'],
    });
    const plan = buildGenericTransformationPlan({
      legacy: second,
      definition,
      relationshipSnapshotId: '55555555-5555-4555-8555-555555555555',
      resolutions: [
        resolution(),
        resolution({
          sourceClassId: 'class-b',
          classGroupId: '66666666-6666-4666-8666-666666666666',
          sourceStudentId: 'student-002',
          studentId: '77777777-7777-4777-8777-777777777777',
        }),
      ],
    });

    expect(plan.readyToGenerate).toBe(true);
    expect(plan.mappings).toHaveLength(2);
    expect(plan.findings).toContain('synthetic_shape_b');
  });

  it('blocks generation instead of guessing incomplete correspondence', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '88888888-8888-4888-8888-888888888888',
      resolutions: [],
    });

    expect(plan.readyToGenerate).toBe(false);
    expect(plan.mappings).toEqual([]);
    expect(plan.blockers).toContain('unresolved_grade_slot:slot-001:class,component,student');
  });

  it('blocks ambiguous correspondence', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '99999999-9999-4999-8999-999999999999',
      resolutions: [
        resolution(),
        resolution({ classGroupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      ],
    });

    expect(plan.readyToGenerate).toBe(false);
    expect(plan.blockers).toContain('ambiguous_sourceClassId:class-a');
  });

  it('keeps generated instances in homologation with sync disabled', () => {
    const valid = genericModelInstanceSchema.parse({
      schemaVersion: 1,
      modelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      teacherEntraObjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      schoolYear: 2026,
      definitionVersion: '2026.1',
      sourceHash: 'c'.repeat(64),
      relationshipSnapshotId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      environment: 'homologation',
      syncEnabled: false,
      mappingVersion: 1,
      mappings: [
        {
          gradeKey: '2026|synthetic-canonical-key',
          field: 'NotaT1',
          sheetKey: 'generated-sheet-1',
          cellAddress: 'F12',
        },
      ],
    });

    expect(valid.syncEnabled).toBe(false);
    expect(() => genericModelInstanceSchema.parse({ ...valid, syncEnabled: true })).toThrow();
    expect(() =>
      genericModelInstanceSchema.parse({ ...valid, environment: 'production' }),
    ).toThrow();
  });

  it('generates a deterministic instance that can be validated without reopening the source', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
      resolutions: [resolution()],
    });
    const instance = generateGenericModelInstance({
      plan,
      modelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      teacherEntraObjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      mappingVersion: 1,
    });

    expect(instance).toMatchObject({
      environment: 'homologation',
      syncEnabled: false,
      sourceHash: 'a'.repeat(64),
      relationshipSnapshotId: '44444444-4444-4444-8444-444444444444',
    });
    expect(instance.mappings).toEqual([
      expect.objectContaining({
        field: 'NotaT1',
        cellAddress: 'B2',
        sheetKey:
          'generated:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222',
      }),
    ]);
    expect(JSON.stringify(instance)).not.toContain('Planilha Principal');
  });

  it('refuses generation when relationship blockers remain', () => {
    const plan = buildGenericTransformationPlan({
      legacy: legacyOne(),
      definition,
      relationshipSnapshotId: '88888888-8888-4888-8888-888888888888',
      resolutions: [],
    });
    expect(() =>
      generateGenericModelInstance({
        plan,
        modelId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        teacherEntraObjectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        mappingVersion: 1,
      }),
    ).toThrow('transformation_plan_not_ready');
  });
});
