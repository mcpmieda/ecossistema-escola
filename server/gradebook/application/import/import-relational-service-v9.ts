import {
  lockResetWriterV1,
  recordImportResetWriteV1,
} from '../../../student-portal/integration/year-reset/writer-v1';
import type {
  GradebookImportCellV9,
  GradebookImportOfferV9,
  GradebookImportTermV9,
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
  GradebookNotesImportRequestV9,
  GradebookRelationImportRequestV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import {
  resolveRelationalClosingUpdateV9,
  type RelationalClosingPatchV9,
  type RelationalClosingStateV9,
} from './import-relational-closing-v9';
import {
  isRelationalInstrumentActiveV9,
  isRelationalInstrumentMeaningfulV9,
  parseRelationalInstrumentKeyV9,
  resolveRelationalInstrumentMetadataV9,
  resolveRelationalNoteMutationV9,
  shouldRetireQualitativeInstrumentV9,
} from './import-relational-instrument-decisions-v9';
import {
  buildRelationPlanV9,
  normalizeRelationNameV9,
  RelationPlanErrorV9,
  relationBindingKeyV9,
  type ExistingRelationBindingV9,
  type RelationComponentV9,
  type RelationSourceBindingV9,
} from './import-relational-relation-plan-v9';
import type { GradebookPostgresScalarV1 } from '../../persistence/postgres/postgres-database-v1';
import type { GradebookPostgresWritePortV1 } from '../../persistence/postgres/postgres-database-v1';

interface TransactionDatabaseV9 extends GradebookPostgresWritePortV1 {
  transaction<T>(operation: (database: GradebookPostgresWritePortV1) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

type ImportStateV9 = {
  importId: number | null;
  writes: number;
  academicWrites: number;
  sourceStudentIds: Set<number>;
  globalAcademicChange: boolean;
};

class RelationalImportErrorV9 extends Error {
  constructor(
    readonly state: 'blocked' | 'conflict',
    readonly reason: string,
  ) {
    super(reason);
  }
}

function dbNameKey(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function classKey(value: string): string {
  return value.trim().toUpperCase();
}

function asNumber(value: unknown, label: string): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`invalid-${label}`);
  return number;
}

async function first<T extends Row>(
  database: GradebookPostgresWritePortV1,
  query: string,
  values: readonly GradebookPostgresScalarV1[] = [],
): Promise<T | null> {
  return (await database.executeNative<T>(query, values)).rows[0] ?? null;
}

async function all<T extends Row>(
  database: GradebookPostgresWritePortV1,
  query: string,
  values: readonly GradebookPostgresScalarV1[] = [],
): Promise<readonly T[]> {
  return database.query<T>(query, values);
}

async function run(
  database: GradebookPostgresWritePortV1,
  query: string,
  values: readonly GradebookPostgresScalarV1[] = [],
): Promise<number> {
  return (await database.executeNative(query, values)).changes;
}

async function academicRun(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  query: string,
  values: readonly GradebookPostgresScalarV1[],
): Promise<number> {
  const changes = await run(database, query, values);
  state.academicWrites += changes;
  return changes;
}

async function lockAcademicYear(database: GradebookPostgresWritePortV1, ano: number): Promise<void> {
  await lockResetWriterV1(database, ano);
}

function summary(writes: number, importWritten: boolean) {
  const committedWrites = {
    logicalSources: 0,
    sourceFileVersions: 0,
    importBatchVersions: importWritten ? 1 : 0,
    assessmentComponentVersions: 0,
    academicRecordVersions: Math.max(0, writes - (importWritten ? 1 : 0)),
    logicalSourceRecordAssociationVersions: 0,
    total: writes,
  } as const;
  return {
    assessmentDefinitions: { total: 0, resolved: 0, blocked: 0 },
    assessmentComponents: { unchanged: 0, new: 0, changed: 0, blocked: 0 },
    academicRecords: { unchanged: 0, new: 0, changed: 0, missingFromNewSource: 0, blocked: 0 },
    plannedWrites: committedWrites,
    committedWrites,
  } as const;
}

async function ensureImport(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
): Promise<number> {
  if (state.importId !== null) return state.importId;
  const row = await first<{ id: unknown }>(
    database,
    `INSERT INTO gradebook.importacao (ano, tipo, arquivo, hash)
     VALUES ($1, $2, $3, decode($4, 'hex'))
     RETURNING id`,
    [request.ano, tipo, request.manifest.fileName, request.manifest.sha256],
  );
  if (!row) throw new Error('importacao-insert-without-id');
  state.importId = asNumber(row.id, 'import-id');
  state.writes++;
  return state.importId;
}

async function changedRun(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
  query: string,
  values: readonly GradebookPostgresScalarV1[],
  affectsAcademic = true,
): Promise<number> {
  // request/tipo stay in this compatibility helper signature; current-state writes
  // no longer create import ledger rows unless a retained history explicitly needs one.
  void request;
  void tipo;
  const changes = await run(database, query, values);
  state.writes += changes;
  if (affectsAcademic) state.academicWrites += changes;
  return changes;
}

async function changedFirst<T extends Row>(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
  query: string,
  values: readonly GradebookPostgresScalarV1[],
  affectsAcademic = true,
): Promise<T> {
  void request;
  void tipo;
  const row = await first<T>(database, query, values);
  if (!row) throw new Error('write-without-returning-row');
  state.writes++;
  if (affectsAcademic) state.academicWrites++;
  return row;
}

interface ExistingClassV9 {
  readonly id: number;
  readonly codigo: string;
  readonly nome: string;
  readonly etapa: number;
  readonly turno: string;
}

async function resolveRelationClasses(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookRelationImportRequestV9,
): Promise<ReadonlyMap<string, ExistingClassV9>> {
  const result = new Map<string, ExistingClassV9>();
  for (const source of request.turmas) {
    const current = await first<Row>(
      database,
      `SELECT id, codigo, nome, etapa, turno
       FROM gradebook.turma
       WHERE ano = $1 AND upper(btrim(codigo)) = upper(btrim($2))`,
      [request.ano, source.codigo],
    );
    if (!current) {
      const created = await changedFirst<Row>(
        database,
        state,
        request,
        1,
        `INSERT INTO gradebook.turma (ano, codigo, nome, etapa, turno) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, codigo, nome, etapa, turno`,
        [
          request.ano,
          source.codigo.trim().toUpperCase(),
          source.nome.trim(),
          source.etapa,
          source.turno.trim(),
        ],
      );
      result.set(classKey(source.codigo), {
        id: asNumber(created.id, 'turma-id'),
        codigo: String(created.codigo),
        nome: String(created.nome),
        etapa: asNumber(created.etapa, 'etapa'),
        turno: String(created.turno),
      });
      continue;
    }
    const id = asNumber(current.id, 'turma-id');
    const expectedCode = source.codigo.trim().toUpperCase();
    const expectedName = source.nome.trim();
    const expectedTurn = source.turno.trim();
    const currentStage = asNumber(current.etapa, 'etapa');
    if (
      String(current.codigo) !== expectedCode ||
      String(current.nome) !== expectedName ||
      currentStage !== source.etapa ||
      String(current.turno) !== expectedTurn
    ) {
      await changedRun(
        database,
        state,
        request,
        1,
        `UPDATE gradebook.turma
         SET codigo = $1, nome = $2, etapa = $3, turno = $4
         WHERE id = $5`,
        [expectedCode, expectedName, source.etapa, expectedTurn, id],
      );
    }
    result.set(classKey(source.codigo), {
      id,
      codigo: expectedCode,
      nome: expectedName,
      etapa: source.etapa,
      turno: expectedTurn,
    });
  }
  return result;
}

function parseExistingRelationBindingsV9(
  rows: readonly Row[],
): readonly ExistingRelationBindingV9[] {
  return rows.map((row) => ({
    turmaId: asNumber(row.turma_id, 'turma-id'),
    numero: asNumber(row.numero, 'numero'),
    alunoId: asNumber(row.aluno_id, 'aluno-id'),
    situacao: row.situacao === null ? null : asNumber(row.situacao, 'situacao'),
    turmaRelacionadaId:
      row.turma_relacionada_id === null
        ? null
        : asNumber(row.turma_relacionada_id, 'turma-relacionada-id'),
    nome: String(row.nome),
  }));
}

function relationPlanOrThrowV9(
  request: GradebookRelationImportRequestV9,
  classes: ReadonlyMap<string, ExistingClassV9>,
  existing: readonly ExistingRelationBindingV9[],
) {
  try {
    return buildRelationPlanV9(request, classes, existing);
  } catch (cause) {
    if (cause instanceof RelationPlanErrorV9) {
      throw new RelationalImportErrorV9(cause.state, cause.reason);
    }
    throw cause;
  }
}

async function reconcileSplitRelationIdentityV9(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookRelationImportRequestV9,
  component: RelationComponentV9,
  existingByBinding: ReadonlyMap<string, ExistingRelationBindingV9>,
): Promise<number> {
  const repair = component.identityRepair;
  const origin = component.items.find((item) => item.situacao === 6);
  const destination = component.items.find((item) => item.situacao === 7);
  if (!repair || !origin || !destination) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A movimentação corrigida não pode reparar a identidade com segurança.',
    );
  }
  const { canonicalAlunoId, duplicateAlunoId } = repair;
  if (canonicalAlunoId === duplicateAlunoId) return canonicalAlunoId;

  const originCurrent = existingByBinding.get(
    relationBindingKeyV9(origin.turmaId, origin.numero),
  );
  const destinationCurrent = existingByBinding.get(
    relationBindingKeyV9(destination.turmaId, destination.numero),
  );
  if (
    !originCurrent ||
    !destinationCurrent ||
    originCurrent.alunoId !== canonicalAlunoId ||
    destinationCurrent.alunoId !== duplicateAlunoId
  ) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A movimentação corrigida não pode reparar a identidade com segurança.',
    );
  }

  const students = await all<Row>(
    database,
    `SELECT id,nome,conselho_anterior FROM gradebook.aluno
     WHERE ano=$1 AND id IN ($2,$3)
     ORDER BY id
     FOR UPDATE`,
    [request.ano, canonicalAlunoId, duplicateAlunoId],
  );
  if (
    students.length !== 2 ||
    students.some(
      (row) =>
        normalizeRelationNameV9(String(row.nome)) !==
        normalizeRelationNameV9(component.preferred.nome),
    )
  ) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A movimentação corrigida não pode reparar a identidade com segurança.',
    );
  }
  if (students[0]!.conselho_anterior !== students[1]!.conselho_anterior) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A movimentação corrigida tem estados de Conselho anterior incompatíveis.',
    );
  }

  const bindings = await all<Row>(
    database,
    `SELECT turma_id,numero,situacao
     FROM gradebook.vinculo
     WHERE ano=$1 AND aluno_id=$2
     ORDER BY turma_id,numero
     FOR UPDATE`,
    [request.ano, duplicateAlunoId],
  );
  if (
    bindings.length !== 1 ||
    asNumber(bindings[0]!.turma_id, 'turma-id') !== destination.turmaId ||
    asNumber(bindings[0]!.numero, 'numero') !== destination.numero
  ) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A identidade duplicada possui outros vínculos e exige revisão manual.',
    );
  }

  const canonicalCurrentBindings = await all<Row>(
    database,
    `SELECT turma_id,numero
     FROM gradebook.vinculo
     WHERE ano=$1 AND aluno_id=$2 AND situacao IS DISTINCT FROM 6
     ORDER BY turma_id,numero
     FOR UPDATE`,
    [request.ano, canonicalAlunoId],
  );
  if (
    canonicalCurrentBindings.length > 1 ||
    (canonicalCurrentBindings.length === 1 &&
      (asNumber(canonicalCurrentBindings[0]!.turma_id, 'turma-id') !== origin.turmaId ||
        asNumber(canonicalCurrentBindings[0]!.numero, 'numero') !== origin.numero))
  ) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A identidade preservada possui outro vínculo vigente e exige revisão manual.',
    );
  }

  const collision = await first<Row>(
    database,
    `SELECT
       EXISTS (
         SELECT 1 FROM gradebook.nota duplicate
         JOIN gradebook.nota canonical
           ON canonical.instrumento_id=duplicate.instrumento_id
          AND canonical.aluno_id=$1
         WHERE duplicate.aluno_id=$2
       ) AS nota,
       EXISTS (
         SELECT 1 FROM gradebook.fechamento duplicate
         JOIN gradebook.fechamento canonical
           ON canonical.oferta_id=duplicate.oferta_id
          AND canonical.aluno_id=$1
         WHERE duplicate.aluno_id=$2
       ) AS fechamento,
       (
         EXISTS (SELECT 1 FROM gradebook.conselho_decisao WHERE aluno_id=$1)
         AND EXISTS (SELECT 1 FROM gradebook.conselho_decisao WHERE aluno_id=$2)
       ) AS conselho_decisao,
       EXISTS (
         SELECT 1 FROM gradebook.conselho_votacao duplicate
         JOIN gradebook.conselho_votacao canonical
           ON canonical.ano=duplicate.ano
          AND canonical.turma_id=duplicate.turma_id
          AND canonical.aluno_id=$1
         WHERE duplicate.aluno_id=$2
       ) AS conselho_votacao`,
    [canonicalAlunoId, duplicateAlunoId],
  );
  if (
    !collision ||
    collision.nota === true ||
    collision.fechamento === true ||
    collision.conselho_decisao === true ||
    collision.conselho_votacao === true
  ) {
    throw new RelationalImportErrorV9(
      'conflict',
      'A movimentação corrigida conflita com dados acadêmicos já existentes.',
    );
  }

  // The schema allows only one non-historical binding per student and note/closing
  // triggers require a binding in the offer's class. Close the source position
  // first, then re-anchor the destination, and only then move current facts.
  await persistRelationBindingV9(
    database,
    state,
    request,
    origin,
    canonicalAlunoId,
    originCurrent,
  );
  const rebound = await changedRun(
    database,
    state,
    request,
    1,
    `UPDATE gradebook.vinculo
     SET aluno_id=$1
     WHERE ano=$2 AND turma_id=$3 AND numero=$4 AND aluno_id=$5`,
    [
      canonicalAlunoId,
      request.ano,
      destination.turmaId,
      destination.numero,
      duplicateAlunoId,
    ],
  );
  if (rebound !== 1) {
    throw new RelationalImportErrorV9(
      'conflict',
      'O vínculo de destino mudou durante o reparo da identidade.',
    );
  }

  for (const query of [
    'UPDATE gradebook.nota SET aluno_id=$1 WHERE aluno_id=$2',
    'UPDATE gradebook.fechamento SET aluno_id=$1 WHERE aluno_id=$2',
    'UPDATE gradebook.conselho_decisao SET aluno_id=$1 WHERE aluno_id=$2',
    'UPDATE gradebook.conselho_votacao SET aluno_id=$1 WHERE aluno_id=$2',
  ]) {
    await changedRun(
      database,
      state,
      request,
      1,
      query,
      [canonicalAlunoId, duplicateAlunoId],
    );
  }

  await persistRelationBindingV9(
    database,
    state,
    request,
    destination,
    canonicalAlunoId,
    { ...destinationCurrent, alunoId: canonicalAlunoId },
  );
  return canonicalAlunoId;
}

async function resolveRelationComponentStudentV9(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookRelationImportRequestV9,
  component: RelationComponentV9,
): Promise<number> {
  let alunoId = component.seedAlunoId;
  if (alunoId === null) {
    const created = await changedFirst<Row>(
      database,
      state,
      request,
      1,
      'INSERT INTO gradebook.aluno (ano, nome) VALUES ($1, $2) RETURNING id',
      [request.ano, component.preferred.nome],
    );
    return asNumber(created.id, 'aluno-id');
  }

  const current = await first<Row>(
    database,
    'SELECT nome FROM gradebook.aluno WHERE id = $1 AND ano = $2',
    [alunoId, request.ano],
  );
  if (!current) {
    throw new RelationalImportErrorV9(
      'conflict',
      `Aluno existente fora do ano ${request.ano}.`,
    );
  }
  if (String(current.nome) !== component.preferred.nome) {
    await changedRun(
      database,
      state,
      request,
      1,
      'UPDATE gradebook.aluno SET nome = $1 WHERE id = $2',
      [component.preferred.nome, alunoId],
    );
  }
  return alunoId;
}

async function persistRelationBindingV9(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookRelationImportRequestV9,
  item: RelationSourceBindingV9,
  alunoId: number,
  current: ExistingRelationBindingV9 | undefined,
): Promise<void> {
  if (!current) {
    await changedRun(
      database,
      state,
      request,
      1,
      `INSERT INTO gradebook.vinculo (ano, turma_id, numero, aluno_id, situacao, turma_relacionada_id) VALUES ($1, $2, $3, $4, $5, $6)`,
      [request.ano, item.turmaId, item.numero, alunoId, item.situacao, item.relatedTurmaId],
    );
    return;
  }
  if (current.alunoId !== alunoId) {
    throw new RelationalImportErrorV9(
      'conflict',
      `Vínculo ${item.turmaCode}/${item.numero} pertence a outro aluno.`,
    );
  }
  if (current.situacao === item.situacao && current.turmaRelacionadaId === item.relatedTurmaId) {
    return;
  }

  const importId = await ensureImport(database, state, request, 1);
  await run(
    database,
    `INSERT INTO gradebook.vinculo_historico (importacao_id, turma_id, numero, situacao_anterior, situacao_nova, turma_rel_anterior, turma_rel_nova) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      importId,
      item.turmaId,
      item.numero,
      current.situacao,
      item.situacao,
      current.turmaRelacionadaId,
      item.relatedTurmaId,
    ],
  );
  state.writes++;
  state.writes += await academicRun(
    database,
    state,
    `UPDATE gradebook.vinculo SET situacao = $1, turma_relacionada_id = $2
     WHERE turma_id = $3 AND numero = $4`,
    [item.situacao, item.relatedTurmaId, item.turmaId, item.numero],
  );
}

async function persistRelation(
  database: GradebookPostgresWritePortV1,
  request: GradebookRelationImportRequestV9,
  state: ImportStateV9,
): Promise<void> {
  const year = await first<Row>(database, 'SELECT ano FROM gradebook.ano_letivo WHERE ano = $1', [
    request.ano,
  ]);
  if (!year) {
    await changedRun(
      database,
      state,
      request,
      1,
      `INSERT INTO gradebook.ano_letivo (ano, minimo_aprovacao, max_componentes_conselho) VALUES ($1, 60000, 2)`,
      [request.ano],
    );
  }

  const classes = await resolveRelationClasses(database, state, request);
  const existingRows = await all<Row>(
    database,
    `SELECT v.turma_id, v.numero, v.aluno_id, v.situacao, v.turma_relacionada_id, a.nome
     FROM gradebook.vinculo v
     JOIN gradebook.aluno a ON a.id = v.aluno_id
     WHERE v.ano = $1`,
    [request.ano],
  );
  const plan = relationPlanOrThrowV9(
    request,
    classes,
    parseExistingRelationBindingsV9(existingRows),
  );

  const alunoForSource = new Map<number, number>();
  const repairedItems = new Set<number>();
  for (const component of plan.components) {
    if (component.identityRepair) {
      const alunoId = await reconcileSplitRelationIdentityV9(
        database,
        state,
        request,
        component,
        plan.existingByBinding,
      );
      for (const item of component.items) {
        repairedItems.add(item.index);
        alunoForSource.set(item.index, alunoId);
      }
    }
    const alunoId = await resolveRelationComponentStudentV9(database, state, request, component);
    for (const item of component.items) alunoForSource.set(item.index, alunoId);
  }

  for (const item of plan.orderedSource) {
    if (repairedItems.has(item.index)) continue;
    const alunoId = alunoForSource.get(item.index);
    if (alunoId === undefined) throw new Error('component-aluno-missing');
    const current = plan.existingByBinding.get(
      relationBindingKeyV9(item.turmaId, item.numero),
    );
    await persistRelationBindingV9(database, state, request, item, alunoId, current);
  }
}

async function resolveProfessor(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id, nome FROM gradebook.professor WHERE ano = $1 AND lower(btrim(nome)) = lower(btrim($2))`,
    [request.ano, request.professor],
  );
  if (!current) {
    const created = await changedFirst<Row>(
      database,
      state,
      request,
      2,
      `INSERT INTO gradebook.professor (ano, nome) VALUES ($1, $2) RETURNING id`,
      [request.ano, request.professor.trim()],
      false,
    );
    return asNumber(created.id, 'professor-id');
  }
  const id = asNumber(current.id, 'professor-id');
  if (String(current.nome) !== request.professor.trim()) {
    await changedRun(
      database,
      state,
      request,
      2,
      `UPDATE gradebook.professor SET nome = $1 WHERE id = $2`,
      [request.professor.trim(), id],
      false,
    );
  }
  return id;
}

async function resolveDiscipline(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  name: string,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id, nome FROM gradebook.disciplina WHERE ano = $1 AND lower(btrim(nome)) = lower(btrim($2))`,
    [request.ano, name],
  );
  if (!current) {
    const created = await changedFirst<Row>(
      database,
      state,
      request,
      2,
      `INSERT INTO gradebook.disciplina (ano, nome) VALUES ($1, $2) RETURNING id`,
      [request.ano, name.trim()],
    );
    return asNumber(created.id, 'disciplina-id');
  }
  const id = asNumber(current.id, 'disciplina-id');
  if (String(current.nome) !== name.trim()) {
    // A shared subject label may affect classes outside this file's offers.
    state.globalAcademicChange = true;
    await changedRun(
      database,
      state,
      request,
      2,
      `UPDATE gradebook.disciplina SET nome = $1 WHERE id = $2`,
      [name.trim(), id],
    );
  }
  return id;
}

async function resolveOffer(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  turmaId: number,
  professorId: number,
  disciplinaId: number,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id FROM gradebook.oferta
     WHERE ano = $1 AND turma_id = $2 AND professor_id = $3 AND disciplina_id = $4`,
    [request.ano, turmaId, professorId, disciplinaId],
  );
  if (current) return asNumber(current.id, 'oferta-id');
  const created = await changedFirst<Row>(
    database,
    state,
    request,
    2,
    `INSERT INTO gradebook.oferta (ano, turma_id, professor_id, disciplina_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [request.ano, turmaId, professorId, disciplinaId],
  );
  return asNumber(created.id, 'oferta-id');
}

interface InstrumentStateV9 {
  readonly id: number;
  maximo: number | null;
  descricao: string | null;
}

interface InstrumentTermContextV9 {
  readonly authoritativeDefinitions: boolean;
  readonly unavailableMaximum: Set<GradebookImportTermV9['instrumentos'][number][0]>;
  readonly unavailableDescription: Set<GradebookImportTermV9['instrumentos'][number][0]>;
  readonly unavailableValues: Set<GradebookImportTermV9['instrumentos'][number][0]>;
}

interface OfferInstrumentReconciliationV9 {
  readonly database: GradebookPostgresWritePortV1;
  readonly state: ImportStateV9;
  readonly request: GradebookNotesImportRequestV9;
  readonly offer: GradebookImportOfferV9;
  readonly ofertaId: number;
  readonly turmaId: number;
  readonly bindings: ReadonlyMap<string, number>;
  readonly existingInstruments: Map<string, InstrumentStateV9>;
  readonly observedInstruments: Set<number>;
  readonly notes: Map<string, number | null>;
}

function instrumentTermContextV9(term: GradebookImportTermV9): InstrumentTermContextV9 {
  return {
    authoritativeDefinitions: term.definitionSnapshotVersion === 1,
    unavailableMaximum: new Set(term.unavailableMaximumSlots ?? []),
    unavailableDescription: new Set(term.unavailableDescriptionSlots ?? []),
    unavailableValues: new Set(term.unavailableValueSlots ?? []),
  };
}

async function retireMissingQualitativeInstrumentsV9(
  scope: OfferInstrumentReconciliationV9,
  term: GradebookImportTermV9,
  context: InstrumentTermContextV9,
): Promise<void> {
  const { database, state, existingInstruments, observedInstruments, notes } = scope;
  if (!context.authoritativeDefinitions) return;
  const incomingSlots = new Set(term.instrumentos.map(([slot]) => slot));
  for (const [key, current] of [...existingInstruments.entries()]) {
    const parsed = parseRelationalInstrumentKeyV9(key);
    if (!shouldRetireQualitativeInstrumentV9({
      currentTerm: parsed.term,
      currentSlot: parsed.slot,
      incomingTerm: term.trimestre,
      incomingSlots,
      unavailableMaximum: context.unavailableMaximum,
      unavailableDescription: context.unavailableDescription,
      unavailableValues: context.unavailableValues,
    }))
      continue;

    state.writes += await academicRun(
      database,
      state,
      'DELETE FROM gradebook.nota WHERE instrumento_id = $1',
      [current.id],
    );
    state.writes += await academicRun(
      database,
      state,
      'DELETE FROM gradebook.instrumento WHERE id = $1',
      [current.id],
    );
    existingInstruments.delete(key);
    observedInstruments.delete(current.id);
    for (const noteKey of [...notes.keys()])
      if (noteKey.startsWith(`${current.id}:`)) notes.delete(noteKey);
  }
}

async function resolveInstrumentForTermV9(
  scope: OfferInstrumentReconciliationV9,
  term: GradebookImportTermV9,
  context: InstrumentTermContextV9,
  column: number,
): Promise<{ readonly instrument: InstrumentStateV9; readonly hasValue: boolean } | null> {
  const { database, state, request, ofertaId, existingInstruments } = scope;
  const [slot, sourceMaximum, sourceDescription] = term.instrumentos[column]!;
  const key = `${term.trimestre}:${slot}`;
  let instrument = existingInstruments.get(key);
  const hasValue = term.alunos.some(([, values]) => typeof values[column] === 'number');
  if (!isRelationalInstrumentMeaningfulV9({
    sourceMaximum,
    sourceDescription,
    hasValue,
    exists: instrument !== undefined,
    granularObservationVersion: request.granularObservationVersion,
    slot,
  }))
    return null;

  const metadata = resolveRelationalInstrumentMetadataV9({
    current: instrument ?? null,
    sourceMaximum,
    sourceDescription,
    authoritativeDefinitions: context.authoritativeDefinitions,
    maximumUnavailable: context.authoritativeDefinitions && context.unavailableMaximum.has(slot),
    descriptionUnavailable:
      context.authoritativeDefinitions && context.unavailableDescription.has(slot),
  });

  if (!instrument) {
    const created = await first<Row>(
      database,
      `INSERT INTO gradebook.instrumento (oferta_id, trimestre, slot, maximo, descricao) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ofertaId, term.trimestre, slot, metadata.maximo, metadata.descricao],
    );
    if (!created) throw new Error('instrument-insert-without-id');
    state.writes++;
    state.academicWrites++;
    instrument = {
      id: asNumber(created.id, 'instrumento-id'),
      maximo: metadata.maximo,
      descricao: metadata.descricao,
    };
    existingInstruments.set(key, instrument);
    return { instrument, hasValue };
  }

  if (metadata.maximo !== instrument.maximo || metadata.descricao !== instrument.descricao) {
    state.writes += await academicRun(
      database,
      state,
      'UPDATE gradebook.instrumento SET maximo = $1, descricao = $2 WHERE id = $3',
      [metadata.maximo, metadata.descricao, instrument.id],
    );
    instrument.maximo = metadata.maximo;
    instrument.descricao = metadata.descricao;
  }
  return { instrument, hasValue };
}

async function reconcileInstrumentNotesV9(
  scope: OfferInstrumentReconciliationV9,
  term: GradebookImportTermV9,
  column: number,
  instrument: InstrumentStateV9,
  hasValue: boolean,
): Promise<void> {
  const {
    database,
    state,
    request,
    offer,
    turmaId,
    bindings,
    observedInstruments,
    notes,
  } = scope;
  const slot = term.instrumentos[column]![0];
  const activeInstrument = isRelationalInstrumentActiveV9({
    slot,
    metadata: instrument,
    hasValue,
    observed: observedInstruments.has(instrument.id),
  });
  const retainBlank = request.granularObservationVersion === 1 && activeInstrument;

  for (const [numero, values] of term.alunos) {
    const alunoId = bindings.get(`${turmaId}:${numero}`);
    if (alunoId === undefined) {
      throw new RelationalImportErrorV9(
        'blocked',
        `Aluno número ${numero} não existe na turma ${offer.turmaCodigo}. Importe a Relação primeiro.`,
      );
    }
    const noteKey = `${instrument.id}:${alunoId}`;
    const mutation = resolveRelationalNoteMutationV9({
      target: values[column]!,
      previous: notes.get(noteKey) ?? null,
      observed: notes.has(noteKey),
      retainBlank,
    });

    if (mutation.kind === 'preserve') continue;
    if (mutation.kind === 'delete') {
      state.writes += await academicRun(
        database,
        state,
        'DELETE FROM gradebook.nota WHERE instrumento_id = $1 AND aluno_id = $2',
        [instrument.id, alunoId],
      );
      notes.delete(noteKey);
      continue;
    }
    if (mutation.kind === 'insert') {
      state.writes += await academicRun(
        database,
        state,
        'INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor) VALUES ($1, $2, $3)',
        [instrument.id, alunoId, mutation.value],
      );
      notes.set(noteKey, mutation.value);
      continue;
    }
    state.writes += await academicRun(
      database,
      state,
      'UPDATE gradebook.nota SET valor = $1 WHERE instrumento_id = $2 AND aluno_id = $3',
      [mutation.value, instrument.id, alunoId],
    );
    notes.set(noteKey, mutation.value);
  }
}

async function reconcileOfferInstrumentTermsV9(
  scope: OfferInstrumentReconciliationV9,
): Promise<void> {
  for (const term of scope.offer.trimestres) {
    const context = instrumentTermContextV9(term);
    await retireMissingQualitativeInstrumentsV9(scope, term, context);
    for (const [column] of term.instrumentos.entries()) {
      const resolved = await resolveInstrumentForTermV9(scope, term, context, column);
      if (!resolved) continue;
      await reconcileInstrumentNotesV9(
        scope,
        term,
        column,
        resolved.instrument,
        resolved.hasValue,
      );
    }
  }
}

async function processOffer(
  database: GradebookPostgresWritePortV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  offer: GradebookImportOfferV9,
  turmaId: number,
  professorId: number,
  bindings: ReadonlyMap<string, number>,
): Promise<void> {
  const disciplinaId = await resolveDiscipline(database, state, request, offer.disciplina);
  const ofertaId = await resolveOffer(database, state, request, turmaId, professorId, disciplinaId);
  const instrumentRows = await all<Row>(
    database,
    `SELECT id, trimestre, slot, maximo, descricao FROM gradebook.instrumento WHERE oferta_id = $1`,
    [ofertaId],
  );
  const existingInstruments = new Map<string, InstrumentStateV9>();
  for (const row of instrumentRows) {
    existingInstruments.set(
      `${asNumber(row.trimestre, 'trimestre')}:${asNumber(row.slot, 'slot')}`,
      {
        id: asNumber(row.id, 'instrumento-id'),
        maximo: row.maximo === null ? null : asNumber(row.maximo, 'maximo'),
        descricao: row.descricao === null ? null : String(row.descricao),
      },
    );
  }
  const noteRows = await all<Row>(
    database,
    `SELECT n.instrumento_id, n.aluno_id, n.valor
     FROM gradebook.nota n
     JOIN gradebook.instrumento i ON i.id = n.instrumento_id
     WHERE i.oferta_id = $1`,
    [ofertaId],
  );
  const notes = new Map<string, number | null>();
  const observedInstruments = new Set<number>();
  for (const row of noteRows) {
    const instrumentId = asNumber(row.instrumento_id, 'instrumento-id');
    observedInstruments.add(instrumentId);
    notes.set(
      `${instrumentId}:${asNumber(row.aluno_id, 'aluno-id')}`,
      row.valor === null ? null : asNumber(row.valor, 'nota'),
    );
  }

  await reconcileOfferInstrumentTermsV9({
    database,
    state,
    request,
    offer,
    ofertaId,
    turmaId,
    bindings,
    existingInstruments,
    observedInstruments,
    notes,
  });

  const fechamentoRows = await all<Row>(
    database,
    `SELECT oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte
     FROM gradebook.fechamento WHERE oferta_id = $1`,
    [ofertaId],
  );
  const closing = new Map<number, RelationalClosingStateV9>();
  for (const row of fechamentoRows) {
    closing.set(asNumber(row.aluno_id, 'aluno-id'), {
      exists: true,
      am: [
        row.am1_fonte === null ? null : asNumber(row.am1_fonte, 'am1'),
        row.am2_fonte === null ? null : asNumber(row.am2_fonte, 'am2'),
        row.am3_fonte === null ? null : asNumber(row.am3_fonte, 'am3'),
      ],
      rec: [
        row.rec1 === null ? null : asNumber(row.rec1, 'rec1'),
        row.rec2 === null ? null : asNumber(row.rec2, 'rec2'),
        row.rec3 === null ? null : asNumber(row.rec3, 'rec3'),
      ],
      ncMask: asNumber(row.rec_nc_mask, 'rec-nc-mask'),
      rrMask: asNumber(row.rec_rr_mask ?? 0, 'rec-rr-mask'),
      u: row.u_fonte === null ? null : asNumber(row.u_fonte, 'u'),
    });
  }

  const patches = new Map<number, RelationalClosingPatchV9>();
  for (const term of offer.trimestres) {
    for (const [numero, , am] of term.alunos) {
      const alunoId = bindings.get(`${turmaId}:${numero}`);
      if (alunoId === undefined)
        throw new RelationalImportErrorV9(
          'blocked',
          `Aluno número ${numero} não existe na turma ${offer.turmaCodigo}.`,
        );
      const patch = patches.get(alunoId) ?? {};
      const ams: [GradebookImportCellV9?, GradebookImportCellV9?, GradebookImportCellV9?] =
        patch.am ? [...patch.am] : [];
      ams[term.trimestre - 1] = am;
      patches.set(alunoId, { ...patch, am: ams });
    }
  }
  for (const [numero, rec1, rec2, rec3, u] of offer.recuperacao ?? []) {
    const alunoId = bindings.get(`${turmaId}:${numero}`);
    if (alunoId === undefined)
      throw new RelationalImportErrorV9(
        'blocked',
        `Aluno REC número ${numero} não existe na turma ${offer.turmaCodigo}.`,
      );
    const patch = patches.get(alunoId) ?? {};
    patches.set(alunoId, { ...patch, rec: [rec1, rec2, rec3], u });
  }

  for (const [alunoId, patch] of patches) {
    const current: RelationalClosingStateV9 = closing.get(alunoId) ?? {
      exists: false,
      am: [null, null, null],
      rec: [null, null, null],
      ncMask: 0,
      rrMask: 0,
      u: null,
    };
    const { next, changes, empty } = resolveRelationalClosingUpdateV9(current, patch);
    if (changes.length === 0) continue;
    const importId = await ensureImport(database, state, request, 2);
    for (const change of changes) {
      state.writes += await run(
        database,
        `INSERT INTO gradebook.fechamento_historico (importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          importId,
          ofertaId,
          alunoId,
          change.campo,
          change.oldValue,
          change.newValue,
          change.oldState,
          change.newState,
        ],
      );
    }
    if (empty && current.exists) {
      state.writes += await academicRun(
        database,
        state,
        `DELETE FROM gradebook.fechamento WHERE oferta_id = $1 AND aluno_id = $2`,
        [ofertaId, alunoId],
      );
      continue;
    }
    if (empty) continue;
    if (!current.exists) {
      state.writes += await academicRun(
        database,
        state,
        `INSERT INTO gradebook.fechamento (oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, rec_rr_mask, u_fonte) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ofertaId,
          alunoId,
          next.am[0],
          next.am[1],
          next.am[2],
          next.rec[0],
          next.rec[1],
          next.rec[2],
          next.ncMask,
          next.rrMask,
          next.u,
        ],
      );
    } else {
      state.writes += await academicRun(
        database,
        state,
        `UPDATE gradebook.fechamento
         SET am1_fonte = $1, am2_fonte = $2, am3_fonte = $3, rec1 = $4, rec2 = $5, rec3 = $6, rec_nc_mask = $7, rec_rr_mask = $8, u_fonte = $9
         WHERE oferta_id = $10 AND aluno_id = $11`,
        [
          next.am[0],
          next.am[1],
          next.am[2],
          next.rec[0],
          next.rec[1],
          next.rec[2],
          next.ncMask,
          next.rrMask,
          next.u,
          ofertaId,
          alunoId,
        ],
      );
    }
  }
}

async function persistNotes(
  database: GradebookPostgresWritePortV1,
  request: GradebookNotesImportRequestV9,
  state: ImportStateV9,
): Promise<void> {
  const year = await first<Row>(database, `SELECT ano FROM gradebook.ano_letivo WHERE ano = $1`, [
    request.ano,
  ]);
  if (!year) {
    throw new RelationalImportErrorV9('blocked', `Relação ${request.ano} ainda não foi importada.`);
  }
  const classRows = await all<Row>(
    database,
    `SELECT id, codigo FROM gradebook.turma WHERE ano = $1`,
    [request.ano],
  );
  const classes = new Map<string, number>();
  for (const row of classRows)
    classes.set(classKey(String(row.codigo)), asNumber(row.id, 'turma-id'));
  const bindingRows = await all<Row>(
    database,
    `SELECT turma_id, numero, aluno_id FROM gradebook.vinculo WHERE ano = $1`,
    [request.ano],
  );
  const bindings = new Map<string, number>();
  const classStudents = new Map<number, Set<number>>();
  for (const row of bindingRows) {
    const turmaId = asNumber(row.turma_id, 'turma-id');
    const numero = asNumber(row.numero, 'numero');
    const alunoId = asNumber(row.aluno_id, 'aluno-id');
    bindings.set(`${turmaId}:${numero}`, alunoId);
    const students = classStudents.get(turmaId) ?? new Set<number>();
    students.add(alunoId);
    classStudents.set(turmaId, students);
  }
  const professorId = await resolveProfessor(database, state, request);
  const seen = new Set<string>();
  for (const offer of request.ofertas) {
    const turmaId = classes.get(classKey(offer.turmaCodigo));
    if (turmaId === undefined) {
      throw new RelationalImportErrorV9(
        'blocked',
        `Turma ${offer.turmaCodigo} não existe na Relação ${request.ano}.`,
      );
    }
    const key = `${turmaId}:${dbNameKey(offer.disciplina)}`;
    if (seen.has(key))
      throw new RelationalImportErrorV9(
        'blocked',
        `Oferta duplicada: ${offer.turmaCodigo} / ${offer.disciplina}.`,
      );
    seen.add(key);
    const before = state.academicWrites;
    await processOffer(database, state, request, offer, turmaId, professorId, bindings);
    // The verified in-transaction binding map includes classmates affected by definitions,
    // including those with no mark in this file. No extra database round trip is needed.
    if (state.academicWrites > before) {
      for (const studentId of classStudents.get(turmaId) ?? [])
        state.sourceStudentIds.add(studentId);
    }
  }
}

function transactionDatabase(database: GradebookPostgresWritePortV1): TransactionDatabaseV9 {
  if (
    !('transaction' in database) ||
    typeof (database as { transaction?: unknown }).transaction !== 'function'
  ) {
    throw new Error('gradebook-relational-import-requires-postgres');
  }
  return database as TransactionDatabaseV9;
}

export function createGradebookRelationalImportServiceV9(database: GradebookPostgresWritePortV1) {
  return {
    async execute(
      request: GradebookImportPersistenceRequestV9,
    ): Promise<GradebookImportPersistenceResponseV9> {
      try {
        const result = await transactionDatabase(database).transaction(async (transaction) => {
          await lockAcademicYear(transaction, request.ano);
          const state: ImportStateV9 = {
            importId: null,
            writes: 0,
            academicWrites: 0,
            sourceStudentIds: new Set(),
            globalAcademicChange: false,
          };
          if (request.operation === 'persist-relacao')
            await persistRelation(transaction, request, state);
          else await persistNotes(transaction, request, state);
          if (state.writes > 0)
            await recordImportResetWriteV1(
              transaction,
              request.ano,
              request.operation === 'persist-relacao' ? 'relation' : 'marks',
              {
                changed: state.academicWrites > 0,
                studentIds: state.globalAcademicChange ? [] : [...state.sourceStudentIds],
              },
            );
          return state;
        });
        return {
          transportVersion: 9,
          state: result.writes === 0 ? 'no-changes' : 'applied',
          summary: summary(result.writes, result.importId !== null),
        };
      } catch (cause) {
        if (cause instanceof RelationalImportErrorV9) {
          return { transportVersion: 9, state: cause.state, reason: cause.reason };
        }
        const code =
          cause !== null && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        if (code === '23505' || code === '23503' || code === '23514') {
          return {
            transportVersion: 9,
            state: 'conflict',
            reason:
              'O estado acadêmico mudou ou violou uma regra de integridade durante a importação.',
          };
        }
        throw cause;
      }
    },
  };
}
