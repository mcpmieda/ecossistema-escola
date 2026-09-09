import type { RuntimeEnv } from '../../../server/env';
import { validateEnv } from '../../../server/env';
import { requireAuth, AuthenticationError } from '../../../server/auth/session';
import { AuthorizationError } from '../../../server/auth/roles';
import { authorizeGradebookD1RuntimeV1 } from '../../../server/gradebook/persistence/d1/runtime/d1-runtime-authorization-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteValueV1,
} from '../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import { withOfficialGradebookDatabaseV1 } from '../../../server/gradebook/persistence/postgres/official-gradebook-database-v1';
import {
  GRADEBOOK_IMPORT_DIAGNOSTICS_BODY_BYTES_V1,
  GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1,
  isGradebookImportDiagnosticsAuditRequestV1,
  type GradebookImportDiagnosticsAuditListResponseV1,
  type GradebookImportDiagnosticsAuditRecordV1,
  type GradebookImportDiagnosticsAuditRequestV1,
  type GradebookImportDiagnosticsAuditWriteResponseV1,
} from '../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import {
  enforceOfficialOrigin,
  enforceWriteOrigin,
  HttpError,
  withSecurityHeaders,
} from '../../../server/http/security';

type Context = EventContext<RuntimeEnv, string, unknown>;
type Row = Record<string, unknown>;
type DiagnosticsErrorState = 'not-authorized' | 'invalid-request' | 'unavailable';

function headers(): Headers {
  return new Headers({ 'Cache-Control': 'no-store, no-cache, must-revalidate, private' });
}

function response(
  value: GradebookImportDiagnosticsAuditWriteResponseV1 | GradebookImportDiagnosticsAuditListResponseV1,
  status = 200,
): Response {
  return Response.json(value, { status, headers: headers() });
}

async function readPayload(request: Request): Promise<unknown> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > GRADEBOOK_IMPORT_DIAGNOSTICS_BODY_BYTES_V1) {
    throw new HttpError(413, 'Payload too large');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('invalid-integer');
  return number;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

async function writeDiagnostics(
  database: D1WriteDatabaseV1,
  request: GradebookImportDiagnosticsAuditRequestV1,
): Promise<number> {
  if (request.diagnostics.length === 0) return 0;
  const rows = request.diagnostics.map((item) => ({
    ano: request.academicYear,
    arquivo: request.fileName,
    hash_hex: request.sha256,
    chave: item.key,
    nivel: item.severity,
    codigo: item.code,
    turma_codigo: item.classCode ?? null,
    disciplina: item.subject ?? null,
    periodo: item.period ?? null,
    aluno_numero: item.studentNumber ?? null,
    campo: item.fieldKind,
    rotulo: item.fieldLabel ?? null,
    valor_encontrado: item.foundValue ?? null,
    causa: item.cause ?? null,
    guia: item.sheetName ?? null,
    celula: item.cellAddress ?? null,
  }));
  const result = await database
    .prepare(
      `INSERT INTO gradebook.importacao_diagnostico
        (ano, arquivo, hash, chave, nivel, codigo, turma_codigo, disciplina, periodo,
         aluno_numero, campo, rotulo, valor_encontrado, causa, guia, celula)
       SELECT
         x.ano, x.arquivo, decode(x.hash_hex, 'hex'), x.chave, x.nivel, x.codigo,
         x.turma_codigo, x.disciplina, x.periodo, x.aluno_numero, x.campo, x.rotulo,
         x.valor_encontrado, x.causa, x.guia, x.celula
       FROM jsonb_to_recordset(?::jsonb) AS x(
         ano smallint,
         arquivo text,
         hash_hex text,
         chave text,
         nivel text,
         codigo text,
         turma_codigo text,
         disciplina text,
         periodo text,
         aluno_numero smallint,
         campo text,
         rotulo text,
         valor_encontrado text,
         causa text,
         guia text,
         celula text
       )
       ON CONFLICT (hash, chave) DO UPDATE
       SET ultimo_em = now(),
           ocorrencias = gradebook.importacao_diagnostico.ocorrencias + 1`,
    )
    .bind(JSON.stringify(rows))
    .run();
  return result.meta?.changes ?? result.changes ?? rows.length;
}

async function listDiagnostics(
  database: D1WriteDatabaseV1,
  academicYear: number | null,
  limit: number,
): Promise<readonly GradebookImportDiagnosticsAuditRecordV1[]> {
  const where = academicYear === null ? '' : 'WHERE d.ano = ?';
  const values: D1WriteValueV1[] = academicYear === null ? [limit] : [academicYear, limit];
  const result = await database
    .prepare(
      `SELECT
         d.id,
         d.ano,
         d.arquivo,
         d.chave,
         d.nivel,
         d.codigo,
         d.turma_codigo,
         d.disciplina,
         d.periodo,
         d.aluno_numero,
         d.campo,
         d.rotulo,
         d.valor_encontrado,
         d.causa,
         d.guia,
         d.celula,
         d.primeiro_em,
         d.ultimo_em,
         d.ocorrencias,
         a.nome AS aluno_nome
       FROM gradebook.importacao_diagnostico d
       LEFT JOIN gradebook.turma t
         ON t.ano = d.ano
        AND upper(btrim(t.codigo)) = upper(btrim(d.turma_codigo))
       LEFT JOIN gradebook.vinculo v
         ON v.ano = d.ano
        AND v.turma_id = t.id
        AND v.numero = d.aluno_numero
       LEFT JOIN gradebook.aluno a ON a.id = v.aluno_id
       ${where}
       ORDER BY d.ultimo_em DESC, d.id DESC
       LIMIT ?`,
    )
    .bind(...values)
    .all<Row>();

  return result.results.map((row) => ({
    id: asInteger(row.id),
    academicYear: row.ano === null ? null : asInteger(row.ano),
    fileName: String(row.arquivo),
    key: String(row.chave),
    severity: String(row.nivel) as GradebookImportDiagnosticsAuditRecordV1['severity'],
    code: String(row.codigo) as GradebookImportDiagnosticsAuditRecordV1['code'],
    message: messageFor(String(row.codigo)),
    recommendedAction: actionFor(String(row.codigo)),
    ...(row.turma_codigo === null ? {} : { classCode: String(row.turma_codigo) }),
    ...(row.disciplina === null ? {} : { subject: String(row.disciplina) }),
    ...(row.periodo === null ? {} : { period: String(row.periodo) }),
    ...(row.aluno_numero === null ? {} : { studentNumber: asInteger(row.aluno_numero) }),
    studentName: nullableString(row.aluno_nome),
    fieldKind: String(row.campo) as GradebookImportDiagnosticsAuditRecordV1['fieldKind'],
    ...(row.rotulo === null ? {} : { fieldLabel: String(row.rotulo) }),
    ...(row.valor_encontrado === null ? {} : { foundValue: String(row.valor_encontrado) }),
    ...(row.causa === null ? {} : { cause: String(row.causa) }),
    ...(row.guia === null ? {} : { sheetName: String(row.guia) }),
    ...(row.celula === null ? {} : { cellAddress: String(row.celula) }),
    firstObservedAt: new Date(String(row.primeiro_em)).toISOString(),
    lastObservedAt: new Date(String(row.ultimo_em)).toISOString(),
    observations: asInteger(row.ocorrencias),
  }));
}

function messageFor(code: string): string {
  switch (code) {
    case 'invalid-text':
      return 'Existe texto onde uma nota é esperada.';
    case 'negative-grade':
      return 'Existe uma nota negativa onde uma nota válida é esperada.';
    case 'invalid-precision':
      return 'Existe uma nota com mais de três casas decimais.';
    case 'invalid-maximum':
      return 'O valor máximo de uma avaliação está ausente ou inválido.';
    case 'duplicate-student-number':
      return 'O mesmo número de aluno aparece mais de uma vez na planilha.';
    case 'above-maximum':
      return 'A nota lançada está acima do máximo configurado para esta avaliação.';
    case 'source-unavailable':
    default:
      return 'Um valor de origem está indisponível.';
  }
}

function actionFor(code: string): string {
  switch (code) {
    case 'invalid-text':
      return 'Informe uma nota válida ou apague o lançamento e importe novamente.';
    case 'negative-grade':
      return 'Corrija ou apague o lançamento negativo e importe novamente.';
    case 'invalid-precision':
      return 'Corrija o lançamento para no máximo três casas decimais.';
    case 'invalid-maximum':
      return 'Informe um máximo numérico positivo na configuração da avaliação.';
    case 'duplicate-student-number':
      return 'Corrija a duplicidade do número do aluno na planilha.';
    case 'above-maximum':
      return 'Confira o lançamento; o aviso não bloqueia os demais dados válidos.';
    case 'source-unavailable':
    default:
      return 'Recalcule e salve a planilha no Excel antes de reimportar.';
  }
}

async function handle(request: Request, env: RuntimeEnv): Promise<Response> {
  enforceOfficialOrigin(request, env);
  const session = await requireAuth(request, env);
  authorizeGradebookD1RuntimeV1(session);
  const database = env.GRADEBOOK_D1 as D1WriteDatabaseV1 | undefined;
  if (!database) {
    return response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'unavailable' }, 503);
  }

  if (request.method === 'GET') {
    const url = new URL(request.url);
    const anoText = url.searchParams.get('ano');
    const ano = anoText === null ? null : Number(anoText);
    if (ano !== null && (!Number.isSafeInteger(ano) || ano < 2000 || ano > 9999)) {
      return response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'invalid-request' }, 400);
    }
    const limitText = Number(url.searchParams.get('limit') ?? 50);
    const limit = Number.isSafeInteger(limitText) ? Math.min(200, Math.max(1, limitText)) : 50;
    const items = await listDiagnostics(database, ano, limit);
    return response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'ready', items });
  }

  if (request.method !== 'POST') throw new HttpError(405, 'Method not allowed');
  enforceWriteOrigin(request, env);
  const payload = await readPayload(request);
  if (!isGradebookImportDiagnosticsAuditRequestV1(payload)) {
    return response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'invalid-request' }, 400);
  }
  const affected = await writeDiagnostics(database, payload);
  return response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'recorded', affected });
}

export const onRequest: PagesFunction<RuntimeEnv> = async (context) => {
  try {
    const env = validateEnv((context as Context).env);
    const routed = await withOfficialGradebookDatabaseV1(env, (executionEnv) =>
      handle((context as Context).request, executionEnv),
    );
    return withSecurityHeaders(
      routed ?? response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state: 'unavailable' }, 503),
      true,
    );
  } catch (error) {
    const status =
      error instanceof HttpError || error instanceof AuthenticationError || error instanceof AuthorizationError
        ? error.status
        : 500;
    const state: DiagnosticsErrorState =
      status === 401 || status === 403
        ? 'not-authorized'
        : status < 500
          ? 'invalid-request'
          : 'unavailable';
    if (status >= 500) console.error(JSON.stringify({ message: 'gradebook_import_diagnostics_failed' }));
    return withSecurityHeaders(
      response({ version: GRADEBOOK_IMPORT_DIAGNOSTICS_VERSION_V1, state }, status),
      true,
    );
  }
};
