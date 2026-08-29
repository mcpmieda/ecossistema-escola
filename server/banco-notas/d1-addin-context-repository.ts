import type {
  AddinContextMapping,
  AddinContextQuery,
  AddinContextResponse,
  AddinPending,
  AddinReadinessReason,
  BancoNotasAddinContextRepository,
} from '../../shared/banco-notas-addin-context';
import type { GradeValue } from '../../shared/banco-notas-grade-events';
import { D1BancoNotasAddinAuthorizer } from './d1-addin-authorizer';

type Row = Record<string, string | number | null>;

function asIso(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value);
  const parsed = new Date(/[zZ]|[+-]\d\d:\d\d$/u.test(raw) ? raw : `${raw.replace(' ', 'T')}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function snapshotValue(row: Row): GradeValue {
  if (Number(row.known_absent) === 1) return null;
  if (row.value_numeric !== null) return Number(row.value_numeric);
  if (row.value_text !== null) return String(row.value_text);
  return null;
}

function pendingForReasons(
  reasons: readonly AddinReadinessReason[],
  modelState: string,
): AddinPending[] {
  const definitions: Record<AddinReadinessReason, AddinPending> = {
    sync_disabled_by_administration: {
      severity: 'info',
      code: 'sync_disabled_by_administration',
      message: 'Sincronização indisponível pela administração enquanto o piloto não está ativo.',
    },
    model_not_connected: {
      severity: 'warning',
      code: 'model_not_connected',
      message: `O modelo está em ${modelState} e ainda não foi conectado.`,
    },
    model_suspended: {
      severity: 'error',
      code: 'model_suspended',
      message: 'O modelo está suspenso e precisa de revisão administrativa.',
    },
    model_unavailable: {
      severity: 'error',
      code: 'model_unavailable',
      message: 'O modelo não está disponível para uso cotidiano.',
    },
    assignment_missing: {
      severity: 'error',
      code: 'assignment_missing',
      message: 'Não há atribuição ativa para a turma e o componente desta planilha.',
    },
    authoritative_source_missing: {
      severity: 'error',
      code: 'authoritative_source_missing',
      message: 'A fonte autoritativa vigente não está configurada para este contexto.',
    },
    mapping_unknown: {
      severity: 'error',
      code: 'mapping_unknown',
      message: 'O mapping desta guia não corresponde ao modelo reconhecido.',
    },
    baseline_unavailable: {
      severity: 'warning',
      code: 'baseline_unavailable',
      message: 'Parte dos campos ainda não possui estado conhecido para comparação.',
    },
  };
  return reasons.map((reason) => definitions[reason]);
}

export class D1BancoNotasAddinContextRepository implements BancoNotasAddinContextRepository {
  private readonly authorizer: D1BancoNotasAddinAuthorizer;

  constructor(private readonly db: D1Database) {
    this.authorizer = new D1BancoNotasAddinAuthorizer(db);
  }

  async context(
    query: AddinContextQuery,
    entraObjectId: string,
  ): Promise<AddinContextResponse | null> {
    const models = await this.db
      .prepare(
        `SELECT model.id AS teacher_model_id, model.teacher_id, model.state,
                model.sync_enabled AS model_sync_enabled, model.last_reconciled_at,
                model.updated_at AS model_updated_at,
                teacher.display_name AS teacher_name,
                year.id AS school_year_id, year.name AS school_year_name,
                version.id AS version_id, version.version, version.mapping_version
         FROM teacher_model_versions version
         JOIN teacher_models model ON model.id = version.teacher_model_id
         JOIN teachers teacher ON teacher.id = model.teacher_id
         JOIN school_years year ON year.id = model.school_year_id
         WHERE version.version = (
           SELECT MAX(candidate.version)
           FROM teacher_model_versions candidate
           WHERE candidate.teacher_model_id = model.id
         )
           AND year.year = ?
           AND version.mapping_version = ?
           AND json_extract(version.provenance_json, '$.workbookModelId') = ?
           AND json_extract(version.provenance_json, '$.sourceHash') = ?
           AND json_extract(version.provenance_json, '$.relationshipSnapshotId') = ?
           AND json_extract(version.provenance_json, '$.definitionVersion') = ?
           AND json_extract(version.provenance_json, '$.layoutVersion') = ?
         LIMIT 2`,
      )
      .bind(
        query.schoolYear,
        query.mappingVersion,
        query.workbookModelId,
        query.sourceHash,
        query.relationshipSnapshotId,
        query.definitionVersion,
        query.layoutVersion,
      )
      .all<Row>();

    if (models.results.length === 0) return null;
    if (models.results.length !== 1) throw new Error('addin_workbook_identity_ambiguous');
    const model = models.results[0]!;
    const teacherModelId = String(model.teacher_model_id);
    await this.authorizer.assertTeacherModelOwner({ teacherModelId, entraObjectId });

    const [mappingRows, source, activity] = await Promise.all([
      this.db
        .prepare(
          `SELECT mapping.cell_address, mapping.field,
                  student.display_name AS student_name,
                  class_group.id AS class_group_id, class_group.name AS class_group_name,
                  component.id AS component_id, component.name AS component_name,
                  assignment.id AS assignment_id,
                  snapshot.event_id AS snapshot_event_id,
                  snapshot.value_numeric, snapshot.value_text,
                  snapshot.is_absent AS known_absent
           FROM cell_mappings mapping
           LEFT JOIN class_groups class_group
             ON instr(mapping.grade_key, '|' || class_group.id || '|') > 0
           LEFT JOIN components component
             ON class_group.school_year_id = component.school_year_id
            AND instr(mapping.grade_key, '|' || class_group.id || '|' || component.id || '|') > 0
           LEFT JOIN students student
             ON substr(mapping.grade_key, -length('|' || student.id)) = '|' || student.id
           LEFT JOIN teacher_assignments assignment
             ON assignment.school_year_id = ?
            AND assignment.teacher_id = ?
            AND assignment.class_group_id = class_group.id
            AND assignment.component_id = component.id
            AND assignment.status = 'active'
           LEFT JOIN grade_snapshots snapshot
             ON snapshot.grade_key = mapping.grade_key AND snapshot.field = mapping.field
           WHERE mapping.teacher_model_version_id = ? AND mapping.sheet_key = ?
           ORDER BY mapping.cell_address, mapping.field
           LIMIT 5001`,
        )
        .bind(
          String(model.school_year_id),
          String(model.teacher_id),
          String(model.version_id),
          query.sheetKey,
        )
        .all<Row>(),
      this.db
        .prepare(
          `SELECT assignment.sync_enabled
           FROM source_assignments assignment
           JOIN data_sources source ON source.id = assignment.data_source_id
           WHERE assignment.school_year_id = ?
             AND assignment.status = 'active'
             AND assignment.authority = 'authoritative'
             AND source.status = 'active'
             AND assignment.effective_from <= date('now')
             AND (assignment.effective_to IS NULL OR assignment.effective_to >= date('now'))
             AND (assignment.teacher_id = ? OR assignment.teacher_id IS NULL)
           ORDER BY CASE WHEN assignment.teacher_id = ? THEN 0 ELSE 1 END,
                    assignment.effective_from DESC, assignment.id
           LIMIT 1`,
        )
        .bind(String(model.school_year_id), String(model.teacher_id), String(model.teacher_id))
        .first<Row>(),
      this.db
        .prepare(
          `SELECT MAX(occurred_at) AS last_activity_at
           FROM grade_events WHERE teacher_model_id = ?`,
        )
        .bind(teacherModelId)
        .first<Row>(),
    ]);

    if (mappingRows.results.length > 5_000) throw new Error('addin_mapping_limit_exceeded');
    const mappingIntegrity = mappingRows.results.every(
      (row) => row.student_name && row.class_group_id && row.component_id,
    );
    const assignmentContexts = new Map<
      string,
      { classGroupLabel: string; componentLabel: string }
    >();
    mappingRows.results.forEach((row) => {
      if (row.assignment_id && row.class_group_id && row.component_id) {
        assignmentContexts.set(`${String(row.class_group_id)}|${String(row.component_id)}`, {
          classGroupLabel: String(row.class_group_name),
          componentLabel: String(row.component_name),
        });
      }
    });
    const assignment = assignmentContexts.size === 1 ? [...assignmentContexts.values()][0]! : null;

    const mappings: AddinContextMapping[] = mappingIntegrity
      ? mappingRows.results.map((row) => ({
          cellAddress: String(row.cell_address),
          field: String(row.field) as AddinContextMapping['field'],
          studentLabel: String(row.student_name),
          known: Boolean(row.snapshot_event_id),
          knownValue: snapshotValue(row),
          knownAbsent: Number(row.known_absent) === 1,
        }))
      : [];

    const reasons: AddinReadinessReason[] = [];
    const modelState = String(model.state);
    if (modelState === 'suspended') reasons.push('model_suspended');
    else if (modelState === 'archived') reasons.push('model_unavailable');
    else if (modelState !== 'connected') reasons.push('model_not_connected');
    if (!assignment) reasons.push('assignment_missing');
    if (!source) reasons.push('authoritative_source_missing');
    if (!mappingIntegrity || mappings.length === 0) reasons.push('mapping_unknown');
    if (mappings.some((mapping) => !mapping.known)) reasons.push('baseline_unavailable');

    const syncEnabled =
      Boolean(model.model_sync_enabled) && Boolean(source && Number(source.sync_enabled) === 1);
    if (!syncEnabled) reasons.push('sync_disabled_by_administration');

    const uniqueReasons = [...new Set(reasons)];
    const blocked = uniqueReasons.some((reason) =>
      [
        'model_suspended',
        'model_unavailable',
        'assignment_missing',
        'authoritative_source_missing',
        'mapping_unknown',
      ].includes(reason),
    );

    return {
      schemaVersion: 1,
      teacher: { label: String(model.teacher_name) },
      schoolYear: { label: String(model.school_year_name) },
      assignment,
      model: {
        version: Number(model.version),
        mappingVersion: Number(model.mapping_version),
        state: modelState as AddinContextResponse['model']['state'],
      },
      syncEnabled,
      lastActivityAt:
        asIso(activity?.last_activity_at) ??
        asIso(model.last_reconciled_at) ??
        asIso(model.model_updated_at),
      preflight: {
        status: blocked ? 'blocked' : uniqueReasons.length ? 'warning' : 'ready',
        checks: {
          structureValid: true,
          modelRecognized: true,
          teacherAuthorized: true,
          workbookCompatible: true,
        },
        reasons: uniqueReasons,
      },
      pending: pendingForReasons(uniqueReasons, modelState),
      mappings,
    };
  }
}
