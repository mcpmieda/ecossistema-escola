import { ZodError } from 'zod';
import {
  alunosListQuerySchema,
  turmasListQuerySchema,
  type TurmasAlunosRepository,
} from '../../shared/banco-notas-turmas-alunos';
import {
  professorDetailQuerySchema,
  professoresListQuerySchema,
  type ProfessoresRepository,
} from '../../shared/banco-notas-professores';
import type { PlatformCapability } from '../../shared/platform-contract';
import {
  assignmentInputSchema,
  assignmentPatchSchema,
  schoolYearInputSchema,
  sourceInputSchema,
  sourcePatchSchema,
  type BancoNotasRepository,
} from '../../shared/banco-notas-contract';
import {
  importAnalysisProfileAttachSchema,
  importAnalysisProfileCreateSchema,
} from '../../shared/banco-notas-import-analysis-profile';
import {
  importJobCreateSchema,
  importJobTransitionSchema,
} from '../../shared/banco-notas-import-jobs';
import { manualImportQuerySchema } from '../../shared/banco-notas-manual-import';
import { requireCapability } from '../auth/capabilities';
import { HttpError, readBoundedBytes, readBoundedJson } from '../http/security';
import { effectiveAuthority } from './domain';
import {
  analyzeUploadedImportWorkbook,
  findImportAnalysis,
  type ImportAnalysisRuntime,
} from './import-analysis-upload';
import { importManualXlsx } from './manual-import';

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSB_CONTENT_TYPE = 'application/vnd.ms-excel.sheet.binary.macroenabled.12';
const MAX_IMPORT_WORKBOOK_BYTES = 32 * 1024 * 1024;

async function body(request: Request): Promise<unknown> {
  return readBoundedJson(request);
}

function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid input');
    }
    throw error;
  }
}

function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

function allowed(request: Request, methods: string[]): void {
  if (!methods.includes(request.method)) throw new HttpError(405, 'Method not allowed');
}

function importReason(request: Request): string {
  const reason = request.headers.get('X-Import-Reason')?.trim() ?? '';
  if (reason.length < 3 || reason.length > 500) {
    throw new HttpError(400, 'X-Import-Reason must contain between 3 and 500 characters');
  }
  return reason;
}

async function sourceAuthorityMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('authoritative source assignment overlap')) {
        throw new HttpError(409, 'Authoritative source period overlaps an existing assignment');
      }
      if (
        error.message.includes('source assignment year mismatch') ||
        error.message.includes('source_assignment_year_mismatch')
      ) {
        throw new HttpError(409, 'Data source and assignment must belong to the same school year');
      }
      if (error.message.includes('data_source_not_found')) {
        throw new HttpError(404, 'Data source not found');
      }
      if (error.message.includes('invalid_effective_period')) {
        throw new HttpError(400, 'Effective period is invalid');
      }
    }
    throw error;
  }
}

async function importJobMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('import_job_idempotency_conflict')) {
        throw new HttpError(409, 'Idempotency key already belongs to another import');
      }
      if (
        error.message.includes('invalid_import_job_transition') ||
        error.message.includes('invalid import job state transition') ||
        error.message.includes('import job state re-entry is not allowed')
      ) {
        throw new HttpError(409, 'Import job transition is not allowed');
      }
      if (
        error.message.includes('import_finding_not_resolvable') ||
        error.message.includes('import_finding_resolutions.import_finding_id')
      ) {
        throw new HttpError(
          409,
          'Import finding is already resolved or does not belong to this job',
        );
      }
      if (error.message.includes('import_job_has_unresolved_error_findings')) {
        throw new HttpError(422, 'Import job has unresolved error findings');
      }
      if (
        error.message.includes('import_job_year_mismatch') ||
        error.message.includes('import job source year mismatch')
      ) {
        throw new HttpError(409, 'Import job relationships must belong to the same school year');
      }
    }
    throw error;
  }
}

async function importProfileMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'data_source_not_found') throw new HttpError(404, 'Data source not found');
      if (error.message === 'import_job_not_found') throw new HttpError(404, 'Import job not found');
      if (error.message === 'import_analysis_profile_not_found') {
        throw new HttpError(404, 'Import analysis profile not found');
      }
      if (error.message === 'import_analysis_profile_requires_xlsx_job') {
        throw new HttpError(422, 'An XLSX analysis profile can only be attached to an XLSX import');
      }
      if (
        error.message === 'import_analysis_profile_year_mismatch' ||
        error.message === 'import_analysis_profile_source_type_invalid' ||
        error.message === 'import_analysis_profile_idempotency_conflict' ||
        error.message === 'import_analysis_profile_attachment_conflict' ||
        error.message === 'import_analysis_profile_job_not_draft' ||
        error.message === 'import_analysis_profile_job_mismatch' ||
        error.message.includes('import analysis profile source mismatch') ||
        error.message.includes('import analysis profile job mismatch')
      ) {
        throw new HttpError(409, 'Import analysis profile is incompatible with this import');
      }
    }
    throw error;
  }
}

async function importAnalysisMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'import_job_not_found') throw new HttpError(404, 'Import job not found');
      if (error.message === 'import_job_school_year_not_found') {
        throw new HttpError(409, 'Import job school year is unavailable');
      }
      if (error.message === 'import_job_source_format_invalid') {
        throw new HttpError(409, 'Import job source format is invalid');
      }
      if (error.message === 'import_analysis_profile_not_attached') {
        throw new HttpError(409, 'Import job has no XLSX analysis profile attached');
      }
      if (error.message === 'import_analysis_profile_job_mismatch') {
        throw new HttpError(409, 'Attached XLSX analysis profile does not match the import job');
      }
      if (
        error.message.startsWith('import_analyzer_not_configured:') ||
        error.message.startsWith('import_analyzer_ambiguous:')
      ) {
        throw new HttpError(503, 'Compatible import analyzer is not configured');
      }
      if (error.message === 'import_analysis_idempotency_conflict') {
        throw new HttpError(409, 'A different analysis already exists for this import job');
      }
      if (
        error.message === 'import_analysis_source_mismatch' ||
        error.message === 'legacy_workbook_sha256_mismatch' ||
        error.message === 'legacy_workbook_byte_length_mismatch' ||
        error.message.startsWith('workbook_format_not_supported:') ||
        error.message.startsWith('manual_import_') ||
        error.message.startsWith('xlsx_')
      ) {
        throw new HttpError(422, 'Uploaded workbook failed verified analysis');
      }
      if (error.message.startsWith('invalid_import_job_transition:')) {
        throw new HttpError(409, 'Import job is not eligible for analysis');
      }
    }
    throw error;
  }
}

export async function routeBancoNotasApi(args: {
  request: Request;
  repository: BancoNotasRepository;
  turmasAlunos?: TurmasAlunosRepository;
  professores?: ProfessoresRepository;
  capabilities: readonly PlatformCapability[];
  actor: string;
  importAnalysis?: ImportAnalysisRuntime;
}): Promise<Response> {
  const { request, repository, capabilities, actor } = args;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/banco-notas/u, '') || '/';
  const importAnalysisMatch = path.match(/^\/v1\/import-jobs\/([0-9a-f-]+)\/analysis$/iu);
  const importProfileMatch = path.match(/^\/v1\/import-jobs\/([0-9a-f-]+)\/analysis-profile$/iu);
  const manualImport = path === '/v1/manual-imports';
  const requestBody =
    (request.method === 'POST' || request.method === 'PATCH') &&
    !importAnalysisMatch &&
    !manualImport
      ? await body(request)
      : undefined;

  if (path === '/v1/professores/filters') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.professores) throw new HttpError(503, 'Professores storage unavailable');
    return response(await args.professores.filters());
  }
  if (path === '/v1/professores') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.professores) throw new HttpError(503, 'Professores storage unavailable');
    const rawQuery = Object.fromEntries(
      [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''),
    );
    return response(
      await args.professores.list(parsed(() => professoresListQuerySchema.parse(rawQuery))),
    );
  }
  const professorDetailMatch = path.match(/^\/v1\/professores\/([0-9a-f-]+)$/iu);
  if (professorDetailMatch?.[1]) {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.professores) throw new HttpError(503, 'Professores storage unavailable');
    const id = parsed(() =>
      professoresListQuerySchema.shape.schoolYearId.unwrap().parse(professorDetailMatch[1]),
    );
    const rawQuery = Object.fromEntries(
      [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''),
    );
    const result = await args.professores.detail(
      id,
      parsed(() => professorDetailQuerySchema.parse(rawQuery)),
    );
    if (!result) throw new HttpError(404, 'Professor não encontrado');
    return response(result);
  }

  if (path === '/v1/turmas-alunos/filters') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.turmasAlunos) throw new HttpError(503, 'Turmas e alunos storage unavailable');
    return response(await args.turmasAlunos.filters());
  }
  if (path === '/v1/turmas') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.turmasAlunos) throw new HttpError(503, 'Turmas e alunos storage unavailable');
    const rawQuery = Object.fromEntries(
      [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''),
    );
    return response(
      await args.turmasAlunos.listTurmas(parsed(() => turmasListQuerySchema.parse(rawQuery))),
    );
  }
  const turmaDetailMatch = path.match(/^\/v1\/turmas\/([0-9a-f-]+)$/iu);
  if (turmaDetailMatch?.[1]) {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.turmasAlunos) throw new HttpError(503, 'Turmas e alunos storage unavailable');
    const id = parsed(() => turmasListQuerySchema.shape.schoolYearId.unwrap().parse(turmaDetailMatch[1]));
    const result = await args.turmasAlunos.turmaDetail(id);
    if (!result) throw new HttpError(404, 'Turma não encontrada');
    return response(result);
  }
  if (path === '/v1/alunos') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.turmasAlunos) throw new HttpError(503, 'Turmas e alunos storage unavailable');
    const rawQuery = Object.fromEntries(
      [...url.searchParams.entries()].filter(([, value]) => value.trim() !== ''),
    );
    return response(
      await args.turmasAlunos.listAlunos(parsed(() => alunosListQuerySchema.parse(rawQuery))),
    );
  }
  const alunoDetailMatch = path.match(/^\/v1\/alunos\/([0-9a-f-]+)$/iu);
  if (alunoDetailMatch?.[1]) {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.analytics.read');
    if (!args.turmasAlunos) throw new HttpError(503, 'Turmas e alunos storage unavailable');
    const id = parsed(() => alunosListQuerySchema.shape.schoolYearId.unwrap().parse(alunoDetailMatch[1]));
    const result = await args.turmasAlunos.alunoDetail(id);
    if (!result) throw new HttpError(404, 'Aluno não encontrado');
    return response(result);
  }

  if (path === '/health') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.read');
    return response({ status: 'ok', service: 'banco-de-notas', version: '0.1.0' });
  }
  if (path === '/v1/school-years') {
    allowed(request, ['GET', 'POST']);
    if (request.method === 'GET') {
      requireCapability(capabilities, 'grades.read');
      return response(await repository.listSchoolYears());
    }
    requireCapability(capabilities, 'grades.settings.manage');
    return response(
      await repository.createSchoolYear(parsed(() => schoolYearInputSchema.parse(requestBody)), actor),
      201,
    );
  }
  if (path === '/v1/teachers') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.sources.read');
    return response(await repository.listTeachers());
  }
  if (path === '/v1/import-analysis-profiles') {
    allowed(request, ['GET', 'POST']);
    requireCapability(capabilities, 'grades.import.run');
    const profiles = args.importAnalysis?.profiles;
    if (!profiles) throw new HttpError(503, 'Import analysis profile storage is unavailable');
    if (request.method === 'GET') {
      return response(
        await profiles.listProfiles(
          url.searchParams.get('schoolYearId') ?? undefined,
          url.searchParams.get('dataSourceId') ?? undefined,
        ),
      );
    }
    return response(
      await importProfileMutation(() =>
        profiles.createProfile(parsed(() => importAnalysisProfileCreateSchema.parse(requestBody)), actor),
      ),
      201,
    );
  }
  if (manualImport) {
    allowed(request, ['POST']);
    requireCapability(capabilities, 'grades.import.run');
    if (!args.importAnalysis?.profiles) {
      throw new HttpError(503, 'Import analysis profile storage is unavailable');
    }
    const input = parsed(() =>
      manualImportQuerySchema.parse(Object.fromEntries(url.searchParams.entries())),
    );
    const reason = importReason(request);
    const bytes = await readBoundedBytes(request, {
      maxBytes: MAX_IMPORT_WORKBOOK_BYTES,
      allowedContentTypes: [XLSX_CONTENT_TYPE],
    });
    return response(
      await importAnalysisMutation(() =>
        importProfileMutation(() =>
          importJobMutation(() =>
            importManualXlsx({
              repository,
              runtime: args.importAnalysis!,
              input,
              bytes,
              actor,
              reason,
            }),
          ),
        ),
      ),
      201,
    );
  }
  if (path === '/v1/import-jobs') {
    allowed(request, ['GET', 'POST']);
    requireCapability(capabilities, 'grades.import.run');
    if (request.method === 'GET') {
      return response(await repository.listImportJobs(url.searchParams.get('schoolYearId') ?? undefined));
    }
    return response(
      await importJobMutation(() =>
        repository.createImportJob(parsed(() => importJobCreateSchema.parse(requestBody)), actor),
      ),
      201,
    );
  }
  if (importProfileMatch?.[1]) {
    allowed(request, ['GET', 'POST']);
    requireCapability(capabilities, 'grades.import.run');
    const profiles = args.importAnalysis?.profiles;
    if (!profiles) throw new HttpError(503, 'Import analysis profile storage is unavailable');
    if (request.method === 'GET') {
      const result = await profiles.findForJob(importProfileMatch[1]);
      if (!result) throw new HttpError(404, 'Import analysis profile not attached');
      return response(result);
    }
    return response(
      await importProfileMutation(() =>
        profiles.attachToJob(
          importProfileMatch[1]!,
          parsed(() => importAnalysisProfileAttachSchema.parse(requestBody)),
          actor,
        ),
      ),
    );
  }
  if (importAnalysisMatch?.[1]) {
    allowed(request, ['GET', 'POST']);
    requireCapability(capabilities, 'grades.import.run');
    if (!args.importAnalysis) throw new HttpError(503, 'Import analysis storage is unavailable');
    if (request.method === 'GET') {
      const result = await findImportAnalysis({
        repository: args.importAnalysis.repository,
        importJobId: importAnalysisMatch[1],
      });
      if (!result) throw new HttpError(404, 'Import analysis not found');
      return response(result);
    }

    const reason = importReason(request);
    const bytes = await readBoundedBytes(request, {
      maxBytes: MAX_IMPORT_WORKBOOK_BYTES,
      allowedContentTypes: [XLSX_CONTENT_TYPE, XLSB_CONTENT_TYPE],
    });
    return response(
      await importAnalysisMutation(() =>
        analyzeUploadedImportWorkbook({
          jobs: repository,
          runtime: args.importAnalysis!,
          importJobId: importAnalysisMatch[1]!,
          bytes,
          actor,
          reason,
        }),
      ),
    );
  }
  const importJobMatch = path.match(/^\/v1\/import-jobs\/([0-9a-f-]+)$/iu);
  if (importJobMatch?.[1]) {
    allowed(request, ['GET', 'POST']);
    requireCapability(capabilities, 'grades.import.run');
    if (request.method === 'GET') {
      const result = await repository.findImportJob(importJobMatch[1]);
      if (!result) throw new HttpError(404, 'Import job not found');
      return response(result);
    }
    const transition = parsed(() => importJobTransitionSchema.parse(requestBody));
    if (transition.targetState === 'analyzed') {
      throw new HttpError(409, 'Import job analysis must use the verified analysis pipeline');
    }
    const result = await importJobMutation(() =>
      repository.transitionImportJob(importJobMatch[1]!, transition, actor),
    );
    if (!result) throw new HttpError(404, 'Import job not found');
    return response(result);
  }
  if (path === '/v1/data-sources') {
    allowed(request, ['GET', 'POST']);
    if (request.method === 'GET') {
      requireCapability(capabilities, 'grades.sources.read');
      return response(await repository.listSources(url.searchParams.get('schoolYearId') ?? undefined));
    }
    requireCapability(capabilities, 'grades.sources.manage');
    return response(
      await repository.createSource(parsed(() => sourceInputSchema.parse(requestBody)), actor),
      201,
    );
  }
  const sourceMatch = path.match(/^\/v1\/data-sources\/([0-9a-f-]+)$/iu);
  if (sourceMatch?.[1]) {
    allowed(request, ['PATCH']);
    requireCapability(capabilities, 'grades.sources.manage');
    const result = await repository.patchSource(
      sourceMatch[1],
      parsed(() => sourcePatchSchema.parse(requestBody)),
      actor,
    );
    if (!result) throw new HttpError(404, 'Data source not found');
    return response(result);
  }
  if (path === '/v1/source-assignments') {
    allowed(request, ['GET', 'POST']);
    if (request.method === 'GET') {
      requireCapability(capabilities, 'grades.sources.read');
      return response(await repository.listAssignments(url.searchParams.get('schoolYearId') ?? undefined));
    }
    requireCapability(capabilities, 'grades.sources.manage');
    const input = parsed(() => assignmentInputSchema.parse(requestBody));
    return response(await sourceAuthorityMutation(() => repository.createAssignment(input, actor)), 201);
  }
  const assignmentMatch = path.match(/^\/v1\/source-assignments\/([0-9a-f-]+)$/iu);
  if (assignmentMatch?.[1]) {
    allowed(request, ['PATCH']);
    requireCapability(capabilities, 'grades.sources.manage');
    const input = parsed(() => assignmentPatchSchema.parse(requestBody));
    const result = await sourceAuthorityMutation(() =>
      repository.patchAssignment(assignmentMatch[1]!, input, actor),
    );
    if (!result) throw new HttpError(404, 'Source assignment not found');
    return response(result);
  }
  if (path === '/v1/source-authority') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.sources.read');
    const schoolYearId = url.searchParams.get('schoolYearId');
    if (!schoolYearId) throw new HttpError(400, 'schoolYearId is required');
    const assignments = await repository.listAssignments(schoolYearId);
    return response({
      authority: effectiveAuthority(
        assignments,
        schoolYearId,
        url.searchParams.get('teacherId'),
        url.searchParams.get('at') ?? new Date().toISOString().slice(0, 10),
      ),
    });
  }
  throw new HttpError(404, 'Not found');
}
