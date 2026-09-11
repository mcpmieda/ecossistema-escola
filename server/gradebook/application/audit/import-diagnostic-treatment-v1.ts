import {
  IMPORT_DIAGNOSTIC_TREATMENT_ACTION_LABELS_V1,
  IMPORT_DIAGNOSTIC_TREATMENT_CONTRACT_VERSION_V1,
  IMPORT_DIAGNOSTIC_TREATMENT_LIMITS_V1,
  importDiagnosticTreatmentRequestSchemaV1,
  importDiagnosticTreatmentResponseSchemaV1,
  type ImportDiagnosticTreatmentFailureV1,
  type ImportDiagnosticTreatmentRecordV1,
  type ImportDiagnosticTreatmentRequestV1,
  type ImportDiagnosticTreatmentResponseV1,
} from '../../../../shared/gradebook-contracts/audit/import-diagnostic-treatment-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteValueV1,
} from '../../persistence/d1/write/d1-write-adapter-v1';

type Row = Record<string, unknown>;
type TransactionalDatabase = D1WriteDatabaseV1 & {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
};

const VERSION = IMPORT_DIAGNOSTIC_TREATMENT_CONTRACT_VERSION_V1;
const SELECT_COLUMNS = `
  a.id,a.diagnostico_origem_id,a.ano,a.arquivo,encode(a.hash,'hex') AS diagnostic_hash,
  a.chave,a.nivel,a.codigo,a.turma_codigo,a.disciplina,a.periodo,a.aluno_numero,
  a.campo,a.rotulo,a.acao,a.nota,
  to_char(a.registrado_em AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS registrado_em,
  EXISTS (
    SELECT 1 FROM gradebook.importacao_diagnostico d
    WHERE d.ano=a.ano AND d.arquivo=a.arquivo AND d.chave=a.chave
  ) AS current,
  aluno.nome AS aluno_nome`;
const CONTEXT_JOINS = `
  LEFT JOIN gradebook.turma turma
    ON turma.ano=a.ano AND upper(btrim(turma.codigo))=upper(btrim(a.turma_codigo))
  LEFT JOIN gradebook.vinculo vinculo
    ON vinculo.ano=a.ano AND vinculo.turma_id=turma.id AND vinculo.numero=a.aluno_numero
  LEFT JOIN gradebook.aluno aluno ON aluno.id=vinculo.aluno_id`;

function failure(state: ImportDiagnosticTreatmentFailureV1): ImportDiagnosticTreatmentResponseV1 {
  return { contractVersion: VERSION, state } as ImportDiagnosticTreatmentResponseV1;
}

function integer(value: unknown): number {
  const normalized = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(normalized)) throw new Error('invalid-treatment-integer');
  return normalized;
}

function nullableText(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function boolean(value: unknown): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw new Error('invalid-treatment-boolean');
}

function treatmentRecord(row: Row): ImportDiagnosticTreatmentRecordV1 {
  const action = integer(row.acao) as ImportDiagnosticTreatmentRecordV1['action'];
  return {
    id: integer(row.id),
    diagnosticSourceId: integer(row.diagnostico_origem_id),
    academicYear: integer(row.ano),
    fileName: String(row.arquivo),
    diagnosticHash: String(row.diagnostic_hash),
    key: String(row.chave),
    severity: String(row.nivel) as ImportDiagnosticTreatmentRecordV1['severity'],
    code: String(row.codigo) as ImportDiagnosticTreatmentRecordV1['code'],
    classCode: nullableText(row.turma_codigo),
    subject: nullableText(row.disciplina),
    period: nullableText(row.periodo),
    studentNumber: row.aluno_numero === null ? null : integer(row.aluno_numero),
    studentName: nullableText(row.aluno_nome),
    fieldKind: String(row.campo) as ImportDiagnosticTreatmentRecordV1['fieldKind'],
    fieldLabel: nullableText(row.rotulo),
    action,
    actionLabel: IMPORT_DIAGNOSTIC_TREATMENT_ACTION_LABELS_V1[action],
    note: nullableText(row.nota),
    recordedAt: String(row.registrado_em),
    current: boolean(row.current),
  };
}

async function rows(
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[],
): Promise<readonly Row[]> {
  return (
    await database
      .prepare(query)
      .bind(...values)
      .all<Row>()
  ).results;
}

async function first(
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[],
): Promise<Row | null> {
  return database
    .prepare(query)
    .bind(...values)
    .first<Row>();
}

async function listContext(
  database: D1WriteDatabaseV1,
  request: Extract<ImportDiagnosticTreatmentRequestV1, { operation: 'context' }>,
): Promise<ImportDiagnosticTreatmentResponseV1> {
  const placeholders = request.findings.map(() => '(?,?)').join(',');
  const values: D1WriteValueV1[] = request.findings.flatMap((item) => [item.fileName, item.key]);
  values.push(request.year, IMPORT_DIAGNOSTIC_TREATMENT_LIMITS_V1.contextActions + 1);
  const result = await rows(
    database,
    `WITH requested(arquivo,chave) AS (VALUES ${placeholders})
     SELECT ${SELECT_COLUMNS}
     FROM gradebook.importacao_diagnostico_tratamento a
     JOIN requested r ON r.arquivo=a.arquivo AND r.chave=a.chave
     ${CONTEXT_JOINS}
     WHERE a.ano=?
     ORDER BY a.registrado_em DESC,a.id DESC LIMIT ?`,
    values,
  );
  if (result.length > IMPORT_DIAGNOSTIC_TREATMENT_LIMITS_V1.contextActions) {
    return failure('scope-too-large');
  }
  return {
    contractVersion: VERSION,
    state: 'ready',
    operation: 'context',
    items: result.map(treatmentRecord),
  };
}

async function listHistory(
  database: D1WriteDatabaseV1,
  request: Extract<ImportDiagnosticTreatmentRequestV1, { operation: 'history' }>,
): Promise<ImportDiagnosticTreatmentResponseV1> {
  const cursorAt = request.cursor?.recordedAt ?? null;
  const cursorId = request.cursor?.id ?? null;
  const result = await rows(
    database,
    `SELECT ${SELECT_COLUMNS}
     FROM gradebook.importacao_diagnostico_tratamento a
     ${CONTEXT_JOINS}
     WHERE a.ano=?
       AND (
         CAST(? AS timestamptz) IS NULL
         OR a.registrado_em < CAST(? AS timestamptz)
         OR (a.registrado_em = CAST(? AS timestamptz) AND a.id < ?)
       )
     ORDER BY a.registrado_em DESC,a.id DESC LIMIT ?`,
    [request.year, cursorAt, cursorAt, cursorAt, cursorId, request.limit + 1],
  );
  const hasMore = result.length > request.limit;
  const items = result.slice(0, request.limit).map(treatmentRecord);
  const lastItem = items.at(-1) ?? null;
  return {
    contractVersion: VERSION,
    state: 'ready',
    operation: 'history',
    items,
    nextCursor: hasMore && lastItem ? { recordedAt: lastItem.recordedAt, id: lastItem.id } : null,
  };
}

async function storedCommand(
  database: D1WriteDatabaseV1,
  idempotencyKey: string,
): Promise<Row | null> {
  return first(
    database,
    `SELECT ${SELECT_COLUMNS},a.chave_idempotencia,a.registrado_por
     FROM gradebook.importacao_diagnostico_tratamento a
     ${CONTEXT_JOINS}
     WHERE a.chave_idempotencia=?`,
    [idempotencyKey],
  );
}

function sameCommand(
  row: Row,
  request: Extract<ImportDiagnosticTreatmentRequestV1, { operation: 'record' }>,
  actorOid: string,
): boolean {
  return (
    integer(row.diagnostico_origem_id) === request.diagnosticId &&
    integer(row.ano) === request.year &&
    integer(row.acao) === request.action &&
    nullableText(row.nota) === request.note &&
    String(row.registrado_por) === actorOid
  );
}

async function recordTreatment(
  database: D1WriteDatabaseV1,
  request: Extract<ImportDiagnosticTreatmentRequestV1, { operation: 'record' }>,
  actorOid: string,
): Promise<ImportDiagnosticTreatmentResponseV1> {
  const existing = await storedCommand(database, request.idempotencyKey);
  if (existing) {
    return sameCommand(existing, request, actorOid)
      ? {
          contractVersion: VERSION,
          state: 'ready',
          operation: 'record',
          item: treatmentRecord(existing),
        }
      : failure('idempotency-conflict');
  }

  const diagnostic = await first(
    database,
    `SELECT id,ano,arquivo,encode(hash,'hex') AS diagnostic_hash,chave,nivel,codigo,
            turma_codigo,disciplina,periodo,aluno_numero,campo,rotulo
       FROM gradebook.importacao_diagnostico
      WHERE ano=? AND id=? FOR SHARE`,
    [request.year, request.diagnosticId],
  );
  if (!diagnostic) return failure('not-found');

  await database
    .prepare(
      `INSERT INTO gradebook.importacao_diagnostico_tratamento
        (diagnostico_origem_id,ano,arquivo,hash,chave,nivel,codigo,turma_codigo,disciplina,
         periodo,aluno_numero,campo,rotulo,acao,nota,chave_idempotencia,registrado_por)
       VALUES (?,?,?,decode(?,'hex'),?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .bind(
      integer(diagnostic.id),
      request.year,
      String(diagnostic.arquivo),
      String(diagnostic.diagnostic_hash),
      String(diagnostic.chave),
      String(diagnostic.nivel),
      String(diagnostic.codigo),
      nullableText(diagnostic.turma_codigo),
      nullableText(diagnostic.disciplina),
      nullableText(diagnostic.periodo),
      diagnostic.aluno_numero === null ? null : integer(diagnostic.aluno_numero),
      String(diagnostic.campo),
      nullableText(diagnostic.rotulo),
      request.action,
      request.note,
      request.idempotencyKey,
      actorOid,
    )
    .run();

  const inserted = await storedCommand(database, request.idempotencyKey);
  if (!inserted) throw new Error('treatment-insert-missing');
  return {
    contractVersion: VERSION,
    state: 'ready',
    operation: 'record',
    item: treatmentRecord(inserted),
  };
}

function retryable(cause: unknown): boolean {
  if (cause === null || typeof cause !== 'object' || !('code' in cause)) return false;
  return cause.code === '40001' || cause.code === '23505';
}

export function createImportDiagnosticTreatmentServiceV1(
  database: D1WriteDatabaseV1,
  actorOid: string,
) {
  return {
    async execute(input: unknown): Promise<ImportDiagnosticTreatmentResponseV1> {
      const parsed = importDiagnosticTreatmentRequestSchemaV1.safeParse(input);
      if (!parsed.success) return failure('invalid-request');
      if (!('transaction' in database) || typeof database.transaction !== 'function') {
        return failure('unavailable');
      }
      const transactional = database as TransactionalDatabase;
      const executeTransaction = () =>
        transactional.transaction(async (transaction) => {
          await transaction.exec(
            parsed.data.operation === 'record'
              ? 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE'
              : 'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY',
          );
          if (parsed.data.operation === 'context') return listContext(transaction, parsed.data);
          if (parsed.data.operation === 'history') return listHistory(transaction, parsed.data);
          return recordTreatment(transaction, parsed.data, actorOid);
        });

      let response: ImportDiagnosticTreatmentResponseV1;
      try {
        response = await executeTransaction();
      } catch (cause) {
        if (!retryable(cause)) throw cause;
        response = await executeTransaction();
      }
      return importDiagnosticTreatmentResponseSchemaV1.parse(response);
    },
  };
}
