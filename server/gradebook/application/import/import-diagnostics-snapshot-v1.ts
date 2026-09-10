import {
  isGradebookImportDiagnosticsAuditRequestV1,
  type GradebookImportDiagnosticsAuditRequestV1,
} from '../../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import type { D1WriteDatabaseV1 } from '../../persistence/d1/write/d1-write-adapter-v1';

type TransactionDatabase = D1WriteDatabaseV1 & {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
};

export class InvalidImportDiagnosticsSnapshotV1 extends Error {
  constructor() {
    super('invalid-import-diagnostics-snapshot');
    this.name = 'InvalidImportDiagnosticsSnapshotV1';
  }
}

/**
 * One complete observation replaces the current diagnostic set, including an empty set.
 * The caller owns authentication/origin checks. No academic facts/history are changed.
 * Locks and DELETE/INSERT share one PostgreSQL transaction/connection. A failed INSERT
 * cannot erase the previous evidence. Last successfully committed observation wins;
 * V1 contains no client observation sequence, so it cannot detect an older delayed upload.
 */
export async function replaceGradebookImportDiagnosticsSnapshotV1(
  database: D1WriteDatabaseV1,
  request: GradebookImportDiagnosticsAuditRequestV1,
): Promise<number> {
  if (!isGradebookImportDiagnosticsAuditRequestV1(request) ||
      new Set(request.diagnostics.map((item) => item.key)).size !== request.diagnostics.length) {
    throw new InvalidImportDiagnosticsSnapshotV1();
  }
  if (!('transaction' in database) || typeof database.transaction !== 'function') {
    throw new Error('import-diagnostics-transaction-unavailable');
  }
  // Capture all scalar input before the first await; later caller mutation is irrelevant.
  const { academicYear, fileName } = request;
  const sha256 = request.sha256.toLowerCase();
  const rows = request.diagnostics.map((item) => ({
    ano: academicYear, arquivo: fileName, hash_hex: sha256, chave: item.key,
    nivel: item.severity, codigo: item.code,
    turma_codigo: item.classCode ?? null, disciplina: item.subject ?? null,
    periodo: item.period ?? null, aluno_numero: item.studentNumber ?? null,
    campo: item.fieldKind, rotulo: item.fieldLabel ?? null,
    valor_encontrado: item.foundValue ?? null, causa: item.cause ?? null,
    guia: item.sheetName ?? null, celula: item.cellAddress ?? null,
  })).sort((a,b) => a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0);
  const serialized = JSON.stringify(rows);
  // The prefix keeps this parameter textual through the facade's JSON auto-casting.
  const sourceKey = `gradebook-import-diagnostics-source:${JSON.stringify([academicYear,fileName])}`;
  const contentKey = `gradebook-import-diagnostics-content:${sha256}`;

  return (database as TransactionDatabase).transaction(async (transaction) => {
    // Source lock serializes versions; content lock also protects same bytes renamed.
    // A hash collision only adds serialization. Values never enter the SQL text/logs.
    for (const key of [sourceKey, contentKey]) {
      await transaction.prepare('SELECT pg_advisory_xact_lock(hashtextextended(?, 629)) AS locked')
        .bind(key).first();
    }
    const cleared = await transaction.prepare(
      `DELETE FROM gradebook.importacao_diagnostico
       WHERE (ano IS NOT DISTINCT FROM ? AND arquivo = ?)
          OR hash = decode(?, 'hex')`,
    ).bind(academicYear,fileName,sha256).run();
    const clearedCount = cleared.meta?.changes ?? cleared.changes ?? 0;
    if (rows.length === 0) return clearedCount;

    const inserted = await transaction.prepare(
      `INSERT INTO gradebook.importacao_diagnostico
        (ano,arquivo,hash,chave,nivel,codigo,turma_codigo,disciplina,periodo,
         aluno_numero,campo,rotulo,valor_encontrado,causa,guia,celula)
       SELECT x.ano,x.arquivo,decode(x.hash_hex,'hex'),x.chave,x.nivel,x.codigo,
              x.turma_codigo,x.disciplina,x.periodo,x.aluno_numero,x.campo,x.rotulo,
              x.valor_encontrado,x.causa,x.guia,x.celula
       FROM jsonb_to_recordset(?::jsonb) AS x(
         ano smallint,arquivo text,hash_hex text,chave text,nivel text,codigo text,
         turma_codigo text,disciplina text,periodo text,aluno_numero smallint,
         campo text,rotulo text,valor_encontrado text,causa text,guia text,celula text
       )`,
    ).bind(serialized).run();
    const writtenCount = inserted.meta?.changes ?? inserted.changes;
    if (writtenCount !== rows.length) throw new Error('import-diagnostics-incomplete-snapshot');
    return clearedCount + writtenCount;
  });
}
