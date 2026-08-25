import { ZodError } from 'zod';
import type { PlatformCapability } from '../../shared/platform-contract';
import {
  assignmentInputSchema,
  assignmentPatchSchema,
  schoolYearInputSchema,
  sourceInputSchema,
  sourcePatchSchema,
  type BancoNotasRepository,
} from '../../shared/banco-notas-contract';
import { requireCapability } from '../auth/capabilities';
import { HttpError, readBoundedJson } from '../http/security';
import { effectiveAuthority } from './domain';

async function body(request: Request): Promise<unknown> {
  return readBoundedJson(request);
}
function parsed<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ZodError)
      throw new HttpError(400, error.issues[0]?.message ?? 'Invalid input');
    throw error;
  }
}
function response(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
function allowed(request: Request, methods: string[]): void {
  if (!methods.includes(request.method)) throw new HttpError(405, 'Method not allowed');
}
async function sourceAuthorityMutation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('authoritative source assignment overlap')
    ) {
      throw new HttpError(409, 'Authoritative source period overlaps an existing assignment');
    }
    throw error;
  }
}

export async function routeBancoNotasApi(args: {
  request: Request;
  repository: BancoNotasRepository;
  capabilities: readonly PlatformCapability[];
  actor: string;
}): Promise<Response> {
  const { request, repository, capabilities, actor } = args;
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/banco-notas/u, '') || '/';
  const requestBody =
    request.method === 'POST' || request.method === 'PATCH' ? await body(request) : undefined;

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
      await repository.createSchoolYear(
        parsed(() => schoolYearInputSchema.parse(requestBody)),
        actor,
      ),
      201,
    );
  }
  if (path === '/v1/teachers') {
    allowed(request, ['GET']);
    requireCapability(capabilities, 'grades.sources.read');
    return response(await repository.listTeachers());
  }
  if (path === '/v1/data-sources') {
    allowed(request, ['GET', 'POST']);
    if (request.method === 'GET') {
      requireCapability(capabilities, 'grades.sources.read');
      return response(
        await repository.listSources(url.searchParams.get('schoolYearId') ?? undefined),
      );
    }
    requireCapability(capabilities, 'grades.sources.manage');
    return response(
      await repository.createSource(
        parsed(() => sourceInputSchema.parse(requestBody)),
        actor,
      ),
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
      return response(
        await repository.listAssignments(url.searchParams.get('schoolYearId') ?? undefined),
      );
    }
    requireCapability(capabilities, 'grades.sources.manage');
    const input = parsed(() => assignmentInputSchema.parse(requestBody));
    return response(
      await sourceAuthorityMutation(() => repository.createAssignment(input, actor)),
      201,
    );
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
