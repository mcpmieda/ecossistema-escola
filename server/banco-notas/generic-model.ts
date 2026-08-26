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

function buildStudentPositionMap(
  resolutions: RelationshipResolution[],
  blockers: string[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const resolution of resolutions) {
    const existing = result.get(resolution.sourceStudentId);
    if (existing !== undefined && existing !== resolution.studentPosition) {
      blockers.push(`ambiguous_student_position:${resolution.sourceStudentId}`);
      continue;
    }
    result.set(resolution.sourceStudentId, resolution.studentPosition);
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
  const studentPositionMap = buildStudentPositionMap(resolutions, blockers);
  const supportedFields = new Set(definition.gradeFields);

  const mappings = legacy.gradeSlots.flatMap((slot) => {
    const classGroupId = classMap.get(slot.sourceClassId);
    const componentId = componentMap.get(slot.sourceComponentId);
    const studentId = studentMap.get(slot.sourceStudentId);
    const studentPosition = studentPositionMap.get(slot.sourceStudentId);
    const missing: string[] = [];
    if (!classGroupId) missing.push('class');
    if (!componentId) missing.push('component');
    if (!studentId) missing.push('student');
    if (studentPosition === undefined) missing.push('studentPosition');
    if (!supportedFields.has(slot.field)) missing.push('field');
    if (missing.length) {
      blockers.push(`unresolved_grade_slot:${slot.sourceGradeSlotId}:${missing.join(',')}`);
      return [];
    }
    if (!classGroupId || !componentId || !studentId || studentPosition === undefined) {
      throw new Error('resolved_grade_slot_invariant_failed');
    }

    return [
      {
        sourceGradeSlotId: slot.sourceGradeSlotId,
        gradeKey: `${legacy.schoolYear}|${classGroupId}|${componentId}|${studentId}`,
        field: slot.field,
        classGroupId,
        componentId,
        studentId,
        studentPosition,
      },
    ];
  });

  const targetKeys = new Set<string>();
  const rosterPositions = new Map<string, string>();
  for (const mapping of mappings) {
    const targetKey = `${mapping.gradeKey}::${mapping.field}`;
    if (targetKeys.has(targetKey)) blockers.push(`duplicate_target_grade:${targetKey}`);
    targetKeys.add(targetKey);

    const rosterKey = `${mapping.classGroupId}::${mapping.studentPosition}`;
    const rosterStudent = rosterPositions.get(rosterKey);
    if (rosterStudent && rosterStudent !== mapping.studentId) {
      blockers.push(`duplicate_student_position:${rosterKey}`);
    } else {
      rosterPositions.set(rosterKey, mapping.studentId);
    }
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
    layout: definition.layout,
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

  const gradeColumns = new Map(plan.layout.gradeColumns.map((item) => [item.field, item.column]));

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
    layout: plan.layout,
    mappings: plan.mappings.map((mapping) => {
      const column = gradeColumns.get(mapping.field);
      if (!column) throw new Error(`generated_grade_column_missing:${mapping.field}`);
      const row = plan.layout.firstStudentRow + mapping.studentPosition - 1;
      const sheetKey = `generated:${mapping.classGroupId}:${mapping.componentId}`;
      return {
        gradeKey: mapping.gradeKey,
        field: mapping.field,
        sheetKey,
        studentPosition: mapping.studentPosition,
        cellAddress: `${column}${row}`,
      };
    }),
  });
}
