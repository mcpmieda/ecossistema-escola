import {
  genericModelDefinitionSchema,
  genericModelInstanceSchema,
  legacyIntermediateModelSchema,
  relationshipResolutionSchema,
  transformationPlanSchema,
  type GenericModelDefinition,
  type GenericModelInstance,
  type LegacyIntermediateModel,
  type RelationshipResolution,
  type TransformationPlan,
} from '../../shared/banco-notas-generic-model';

const gradeColumns = {
  NotaT1: 'B',
  NotaT2: 'C',
  NotaT3: 'D',
  RecT1: 'E',
  RecT2: 'F',
  RecT3: 'G',
  Total: 'H',
  TotalRec: 'I',
  NotaFinal: 'J',
} as const;

function buildResolutionMap(
  resolutions: RelationshipResolution[],
  sourceKey: 'sourceClassId' | 'sourceComponentId' | 'sourceStudentId',
  targetKey: 'classGroupId' | 'componentId' | 'studentId',
  blockers: string[],
): Map<string, string> {
  const result = new Map<string, string>();
  for (const resolution of resolutions) {
    const sourceId = resolution[sourceKey];
    const targetId = resolution[targetKey];
    const existing = result.get(sourceId);
    if (existing && existing !== targetId) {
      blockers.push(`ambiguous_${sourceKey}:${sourceId}`);
      continue;
    }
    result.set(sourceId, targetId);
  }
  return result;
}

export function buildGenericTransformationPlan(args: {
  legacy: LegacyIntermediateModel;
  definition: GenericModelDefinition;
  relationshipSnapshotId: string;
  resolutions: RelationshipResolution[];
}): TransformationPlan {
  const legacy = legacyIntermediateModelSchema.parse(args.legacy);
  const definition = genericModelDefinitionSchema.parse(args.definition);
  const resolutions = args.resolutions.map((item) => relationshipResolutionSchema.parse(item));
  const blockers: string[] = [];
  const findings = [...legacy.findings];

  const classMap = buildResolutionMap(resolutions, 'sourceClassId', 'classGroupId', blockers);
  const componentMap = buildResolutionMap(
    resolutions,
    'sourceComponentId',
    'componentId',
    blockers,
  );
  const studentMap = buildResolutionMap(resolutions, 'sourceStudentId', 'studentId', blockers);
  const supportedFields = new Set(definition.gradeFields);

  const mappings = legacy.gradeSlots.flatMap((slot) => {
    const classGroupId = classMap.get(slot.sourceClassId);
    const componentId = componentMap.get(slot.sourceComponentId);
    const studentId = studentMap.get(slot.sourceStudentId);
    const missing: string[] = [];
    if (!classGroupId) missing.push('class');
    if (!componentId) missing.push('component');
    if (!studentId) missing.push('student');
    if (!supportedFields.has(slot.field)) missing.push('field');
    if (missing.length) {
      blockers.push(`unresolved_grade_slot:${slot.sourceGradeSlotId}:${missing.join(',')}`);
      return [];
    }

    return [
      {
        sourceGradeSlotId: slot.sourceGradeSlotId,
        gradeKey: `${legacy.schoolYear}|${classGroupId}|${componentId}|${studentId}`,
        field: slot.field,
        classGroupId,
        componentId,
        studentId,
      },
    ];
  });

  const targetKeys = new Set<string>();
  for (const mapping of mappings) {
    const targetKey = `${mapping.gradeKey}::${mapping.field}`;
    if (targetKeys.has(targetKey)) blockers.push(`duplicate_target_grade:${targetKey}`);
    targetKeys.add(targetKey);
  }

  const uniqueBlockers = [...new Set(blockers)];
  if (legacy.gradeSlots.length === 0) findings.push('legacy_analysis_contains_no_grade_slots');
  if (mappings.length !== legacy.gradeSlots.length) {
    findings.push('not_all_grade_slots_are_resolved');
  }

  return transformationPlanSchema.parse({
    schemaVersion: 1,
    sourceHash: legacy.sourceHash,
    schoolYear: legacy.schoolYear,
    definitionVersion: definition.definitionVersion,
    relationshipSnapshotId: args.relationshipSnapshotId,
    mappings,
    findings: [...new Set(findings)],
    blockers: uniqueBlockers,
    readyToGenerate: uniqueBlockers.length === 0,
  });
}

export function generateGenericModelInstance(args: {
  plan: TransformationPlan;
  modelId: string;
  teacherEntraObjectId: string;
  mappingVersion: number;
}): GenericModelInstance {
  const plan = transformationPlanSchema.parse(args.plan);
  if (!plan.readyToGenerate || plan.blockers.length > 0) {
    throw new Error('transformation_plan_not_ready');
  }

  const studentsBySheet = new Map<string, string[]>();
  for (const mapping of plan.mappings) {
    const sheetKey = `generated:${mapping.classGroupId}:${mapping.componentId}`;
    const students = studentsBySheet.get(sheetKey) ?? [];
    if (!students.includes(mapping.studentId)) students.push(mapping.studentId);
    studentsBySheet.set(sheetKey, students.sort());
  }

  return genericModelInstanceSchema.parse({
    schemaVersion: 1,
    modelId: args.modelId,
    teacherEntraObjectId: args.teacherEntraObjectId,
    schoolYear: plan.schoolYear,
    definitionVersion: plan.definitionVersion,
    sourceHash: plan.sourceHash,
    relationshipSnapshotId: plan.relationshipSnapshotId,
    environment: 'homologation',
    syncEnabled: false,
    mappingVersion: args.mappingVersion,
    mappings: plan.mappings.map((mapping) => {
      const sheetKey = `generated:${mapping.classGroupId}:${mapping.componentId}`;
      const row = (studentsBySheet.get(sheetKey)?.indexOf(mapping.studentId) ?? -1) + 2;
      if (row < 2) throw new Error('generated_student_row_missing');
      return {
        gradeKey: mapping.gradeKey,
        field: mapping.field,
        sheetKey,
        cellAddress: `${gradeColumns[mapping.field]}${row}`,
      };
    }),
  });
}
