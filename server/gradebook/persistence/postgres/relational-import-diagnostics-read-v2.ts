import type {
  GradebookImportDiagnosticsAuditRecordV1,
  GradebookImportDiagnosticCodeV1,
  GradebookImportDiagnosticSeverityV1,
} from '../../../../shared/gradebook-contracts/imports/import-diagnostics-v1';
import type { D1WriteDatabaseV1, D1WriteValueV1 } from '../d1/write/d1-write-adapter-v1';

type Row = Record<string, unknown>;

export interface RelationalImportDiagnosticsReadRequestV2 {
  readonly year: 2026;
  readonly severities: readonly GradebookImportDiagnosticSeverityV1[];
  readonly codes: readonly GradebookImportDiagnosticCodeV1[];
  readonly classCode: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface RelationalImportDiagnosticsReadPageV2 {
  readonly items: readonly GradebookImportDiagnosticsAuditRecordV1[];
  readonly nextOffset: number | null;
}

function asInteger(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('invalid-import-diagnostic-integer');
  return number;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function messageFor(code: string): string {
  switch (code) {
    case 'invalid-text': return 'Existe texto onde uma nota é esperada.';
    case 'negative-grade': return 'Existe uma nota negativa onde uma nota válida é esperada.';
    case 'invalid-precision': return 'Existe uma nota com mais de três casas decimais.';
    case 'invalid-maximum': return 'O valor máximo de uma avaliação está ausente ou inválido.';
    case 'duplicate-student-number': return 'O mesmo número de aluno aparece mais de uma vez na planilha.';
    case 'above-maximum': return 'A nota lançada está acima do máximo configurado para esta avaliação.';
    default: return 'Um valor de origem está indisponível.';
  }
}

function actionFor(code: string): string {
  switch (code) {
    case 'invalid-text': return 'Informe uma nota válida ou apague o lançamento e importe novamente.';
    case 'negative-grade': return 'Corrija ou apague o lançamento negativo e importe novamente.';
    case 'invalid-precision': return 'Corrija o lançamento para no máximo três casas decimais.';
    case 'invalid-maximum': return 'Informe um máximo numérico positivo na configuração da avaliação.';
    case 'duplicate-student-number': return 'Corrija a duplicidade do número do aluno na planilha.';
    case 'above-maximum': return 'Confira o lançamento; o aviso não bloqueia os demais dados válidos.';
    default: return 'Recalcule e salve a planilha no Excel antes de reimportar.';
  }
}

export function relationalImportDiagnosticRecordV2(row: Row): GradebookImportDiagnosticsAuditRecordV1 {
  return {
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
  };
}

export function createRelationalImportDiagnosticsReadV2(database: D1WriteDatabaseV1) {
  return Object.freeze({
    async list(request: RelationalImportDiagnosticsReadRequestV2): Promise<RelationalImportDiagnosticsReadPageV2> {
      const clauses = ['d.ano = ?'];
      const values: D1WriteValueV1[] = [request.year];
      if (request.severities.length > 0) {
        clauses.push(`d.nivel IN (${request.severities.map(() => '?').join(',')})`);
        values.push(...request.severities);
      }
      if (request.codes.length > 0) {
        clauses.push(`d.codigo IN (${request.codes.map(() => '?').join(',')})`);
        values.push(...request.codes);
      }
      if (request.classCode !== null) {
        clauses.push('upper(btrim(d.turma_codigo)) = upper(btrim(?))');
        values.push(request.classCode);
      }
      values.push(request.limit + 1, request.offset);
      const result = await database.prepare(
        `SELECT d.id,d.ano,d.arquivo,d.chave,d.nivel,d.codigo,d.turma_codigo,d.disciplina,
                d.periodo,d.aluno_numero,d.campo,d.rotulo,d.valor_encontrado,d.causa,d.guia,
                d.celula,d.primeiro_em,d.ultimo_em,d.ocorrencias,a.nome AS aluno_nome
         FROM gradebook.importacao_diagnostico d
         LEFT JOIN gradebook.turma t
           ON t.ano=d.ano AND upper(btrim(t.codigo))=upper(btrim(d.turma_codigo))
         LEFT JOIN gradebook.vinculo v
           ON v.ano=d.ano AND v.turma_id=t.id AND v.numero=d.aluno_numero
         LEFT JOIN gradebook.aluno a ON a.id=v.aluno_id
         WHERE ${clauses.join(' AND ')}
         ORDER BY d.ultimo_em DESC,d.id DESC LIMIT ? OFFSET ?`,
      ).bind(...values).all<Row>();
      const hasMore = result.results.length > request.limit;
      const rows = hasMore ? result.results.slice(0, request.limit) : result.results;
      return {
        items: rows.map(relationalImportDiagnosticRecordV2),
        nextOffset: hasMore ? request.offset + request.limit : null,
      };
    },
  });
}

export type RelationalImportDiagnosticsReadV2 = ReturnType<
  typeof createRelationalImportDiagnosticsReadV2
>;
