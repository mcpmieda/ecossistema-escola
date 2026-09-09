import type {
  GradebookImportCellV9,
  GradebookImportOfferV9,
  GradebookImportPersistenceRequestV9,
  GradebookImportPersistenceResponseV9,
  GradebookImportRecoveryCellV9,
  GradebookNotesImportRequestV9,
  GradebookRelationImportRequestV9,
} from '../../../../shared/gradebook-contracts/imports/import-persistence-transport-v9';
import type {
  D1WriteDatabaseV1,
  D1WriteValueV1,
} from '../../persistence/d1/write/d1-write-adapter-v1';

interface TransactionDatabaseV9 extends D1WriteDatabaseV1 {
  transaction<T>(operation: (database: D1WriteDatabaseV1) => Promise<T>): Promise<T>;
}

type Row = Record<string, unknown>;

type ImportStateV9 = {
  importId: number | null;
  writes: number;
};

class RelationalImportErrorV9 extends Error {
  constructor(
    readonly state: 'blocked' | 'conflict',
    readonly reason: string,
  ) {
    super(reason);
  }
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toUpperCase();
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
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<T | null> {
  return database.prepare(query).bind(...values).first<T>();
}

async function all<T extends Row>(
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<readonly T[]> {
  return (await database.prepare(query).bind(...values).all<T>()).results;
}

async function run(
  database: D1WriteDatabaseV1,
  query: string,
  values: readonly D1WriteValueV1[] = [],
): Promise<number> {
  const result = await database.prepare(query).bind(...values).run();
  return result.meta?.changes ?? result.changes ?? 0;
}

async function lockAcademicYear(database: D1WriteDatabaseV1, ano: number): Promise<void> {
  await first<Row>(database, `SELECT pg_advisory_xact_lock(613, ?) AS locked`, [ano]);
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
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
): Promise<number> {
  if (state.importId !== null) return state.importId;
  const row = await first<{ id: unknown }>(
    database,
    `INSERT INTO gradebook.importacao (ano, tipo, arquivo, hash)
     VALUES (?, ?, ?, decode(?, 'hex'))
     RETURNING id`,
    [request.ano, tipo, request.manifest.fileName, request.manifest.sha256],
  );
  if (!row) throw new Error('importacao-insert-without-id');
  state.importId = asNumber(row.id, 'import-id');
  state.writes++;
  return state.importId;
}

async function changedRun(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
  query: string,
  values: readonly D1WriteValueV1[],
): Promise<number> {
  await ensureImport(database, state, request, tipo);
  const changes = await run(database, query, values);
  state.writes += changes;
  return changes;
}

async function changedFirst<T extends Row>(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookImportPersistenceRequestV9,
  tipo: 1 | 2,
  query: string,
  values: readonly D1WriteValueV1[],
): Promise<T> {
  await ensureImport(database, state, request, tipo);
  const row = await first<T>(database, query, values);
  if (!row) throw new Error('write-without-returning-row');
  state.writes++;
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
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookRelationImportRequestV9,
): Promise<ReadonlyMap<string, ExistingClassV9>> {
  const result = new Map<string, ExistingClassV9>();
  for (const source of request.turmas) {
    const current = await first<Row>(
      database,
      `SELECT id, codigo, nome, etapa, turno
       FROM gradebook.turma
       WHERE ano = ? AND upper(btrim(codigo)) = upper(btrim(?))`,
      [request.ano, source.codigo],
    );
    if (!current) {
      const created = await changedFirst<Row>(
        database,
        state,
        request,
        1,
        `INSERT INTO gradebook.turma (ano, codigo, nome, etapa, turno)
         VALUES (?, ?, ?, ?, ?)
         RETURNING id, codigo, nome, etapa, turno`,
        [request.ano, source.codigo.trim().toUpperCase(), source.nome.trim(), source.etapa, source.turno.trim()],
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
         SET codigo = ?, nome = ?, etapa = ?, turno = ?
         WHERE id = ?`,
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

interface ExistingBindingV9 {
  readonly turmaId: number;
  readonly numero: number;
  readonly alunoId: number;
  readonly situacao: number | null;
  readonly turmaRelacionadaId: number | null;
  readonly nome: string;
}

interface SourceBindingV9 {
  readonly index: number;
  readonly turmaId: number;
  readonly turmaCode: string;
  readonly numero: number;
  readonly nome: string;
  readonly situacao: number | null;
  readonly relatedTurmaId: number | null;
  readonly relatedCode: string | null;
}

function bindingKey(turmaId: number, numero: number): string {
  return `${turmaId}:${numero}`;
}

function nameClassKey(turmaId: number, name: string): string {
  return `${turmaId}:${normalizeName(name)}`;
}

class UnionFindV9 {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }
  find(value: number): number {
    const parent = this.parent[value]!;
    if (parent === value) return value;
    const root = this.find(parent);
    this.parent[value] = root;
    return root;
  }
  union(left: number, right: number): void {
    const a = this.find(left);
    const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

async function persistRelation(
  database: D1WriteDatabaseV1,
  request: GradebookRelationImportRequestV9,
  state: ImportStateV9,
): Promise<void> {
  const year = await first<Row>(database, `SELECT ano FROM gradebook.ano_letivo WHERE ano = ?`, [request.ano]);
  if (!year) {
    await changedRun(
      database,
      state,
      request,
      1,
      `INSERT INTO gradebook.ano_letivo (ano, minimo_aprovacao, max_componentes_conselho)
       VALUES (?, 60000, 2)`,
      [request.ano],
    );
  }

  const classes = await resolveRelationClasses(database, state, request);
  const existingRows = await all<Row>(
    database,
    `SELECT v.turma_id, v.numero, v.aluno_id, v.situacao, v.turma_relacionada_id, a.nome
     FROM gradebook.vinculo v
     JOIN gradebook.aluno a ON a.id = v.aluno_id
     WHERE v.ano = ?`,
    [request.ano],
  );
  const existingByBinding = new Map<string, ExistingBindingV9>();
  const existingByNameClass = new Map<string, ExistingBindingV9[]>();
  for (const row of existingRows) {
    const item: ExistingBindingV9 = {
      turmaId: asNumber(row.turma_id, 'turma-id'),
      numero: asNumber(row.numero, 'numero'),
      alunoId: asNumber(row.aluno_id, 'aluno-id'),
      situacao: row.situacao === null ? null : asNumber(row.situacao, 'situacao'),
      turmaRelacionadaId:
        row.turma_relacionada_id === null ? null : asNumber(row.turma_relacionada_id, 'turma-relacionada-id'),
      nome: String(row.nome),
    };
    existingByBinding.set(bindingKey(item.turmaId, item.numero), item);
    const key = nameClassKey(item.turmaId, item.nome);
    existingByNameClass.set(key, [...(existingByNameClass.get(key) ?? []), item]);
  }

  const source: SourceBindingV9[] = [];
  for (const turma of request.turmas) {
    const resolved = classes.get(classKey(turma.codigo));
    if (!resolved) throw new Error('resolved-class-missing');
    for (const aluno of turma.alunos) {
      const rawStatus = aluno[2];
      const related = aluno[3] === undefined ? null : classes.get(classKey(aluno[3]));
      if (aluno[3] !== undefined && !related) {
        throw new RelationalImportErrorV9('blocked', `Turma relacionada não encontrada: ${aluno[3]}.`);
      }
      source.push({
        index: source.length,
        turmaId: resolved.id,
        turmaCode: resolved.codigo,
        numero: aluno[0],
        nome: aluno[1].trim(),
        situacao: rawStatus === 0 ? null : rawStatus,
        relatedTurmaId: related?.id ?? null,
        relatedCode: aluno[3] ?? null,
      });
    }
  }

  const sourceByNameClass = new Map<string, SourceBindingV9[]>();
  for (const item of source) {
    const key = nameClassKey(item.turmaId, item.nome);
    sourceByNameClass.set(key, [...(sourceByNameClass.get(key) ?? []), item]);
  }
  const union = new UnionFindV9(source.length);
  const externalSeed = new Map<number, number>();
  for (const item of source) {
    if (item.relatedTurmaId === null) continue;
    const candidates = sourceByNameClass.get(nameClassKey(item.relatedTurmaId, item.nome)) ?? [];
    if (candidates.length > 1) {
      throw new RelationalImportErrorV9('blocked', `Movimentação ambígua para ${item.nome}.`);
    }
    if (candidates.length === 1) {
      union.union(item.index, candidates[0]!.index);
      continue;
    }
    const existing = existingByNameClass.get(nameClassKey(item.relatedTurmaId, item.nome)) ?? [];
    const ids = [...new Set(existing.map((value) => value.alunoId))];
    if (ids.length !== 1) {
      throw new RelationalImportErrorV9(
        'blocked',
        ids.length === 0
          ? `Movimentação sem vínculo de origem/destino para ${item.nome}.`
          : `Movimentação ambígua para ${item.nome}.`,
      );
    }
    externalSeed.set(item.index, ids[0]!);
  }

  const components = new Map<number, SourceBindingV9[]>();
  for (const item of source) {
    const root = union.find(item.index);
    components.set(root, [...(components.get(root) ?? []), item]);
  }

  const alunoForSource = new Map<number, number>();
  for (const [root, items] of components) {
    const seeds = new Set<number>();
    for (const item of items) {
      const existing = existingByBinding.get(bindingKey(item.turmaId, item.numero));
      if (existing) seeds.add(existing.alunoId);
      const external = externalSeed.get(item.index);
      if (external !== undefined) seeds.add(external);
    }
    if (seeds.size > 1) {
      throw new RelationalImportErrorV9('conflict', `Vínculos existentes apontam para alunos diferentes em ${items[0]!.nome}.`);
    }
    const preferred = items.find((item) => item.situacao !== 6) ?? items[0]!;
    let alunoId = [...seeds][0];
    if (alunoId === undefined) {
      const created = await changedFirst<Row>(
        database,
        state,
        request,
        1,
        `INSERT INTO gradebook.aluno (ano, nome) VALUES (?, ?) RETURNING id`,
        [request.ano, preferred.nome],
      );
      alunoId = asNumber(created.id, 'aluno-id');
    } else {
      const current = await first<Row>(database, `SELECT nome FROM gradebook.aluno WHERE id = ? AND ano = ?`, [alunoId, request.ano]);
      if (!current) throw new RelationalImportErrorV9('conflict', `Aluno existente fora do ano ${request.ano}.`);
      if (String(current.nome) !== preferred.nome) {
        await changedRun(database, state, request, 1, `UPDATE gradebook.aluno SET nome = ? WHERE id = ?`, [preferred.nome, alunoId]);
      }
    }
    for (const item of items) alunoForSource.set(item.index, alunoId);
    void root;
  }

  const ordered = [...source].sort((left, right) => (left.situacao === 6 ? -1 : right.situacao === 6 ? 1 : left.index - right.index));
  for (const item of ordered) {
    const alunoId = alunoForSource.get(item.index);
    if (alunoId === undefined) throw new Error('component-aluno-missing');
    const current = existingByBinding.get(bindingKey(item.turmaId, item.numero));
    if (!current) {
      await changedRun(
        database,
        state,
        request,
        1,
        `INSERT INTO gradebook.vinculo (ano, turma_id, numero, aluno_id, situacao, turma_relacionada_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [request.ano, item.turmaId, item.numero, alunoId, item.situacao, item.relatedTurmaId],
      );
      continue;
    }
    if (current.alunoId !== alunoId) {
      throw new RelationalImportErrorV9('conflict', `Vínculo ${item.turmaCode}/${item.numero} pertence a outro aluno.`);
    }
    if (current.situacao === item.situacao && current.turmaRelacionadaId === item.relatedTurmaId) continue;
    const importId = await ensureImport(database, state, request, 1);
    await run(
      database,
      `INSERT INTO gradebook.vinculo_historico
       (importacao_id, turma_id, numero, situacao_anterior, situacao_nova, turma_rel_anterior, turma_rel_nova)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [importId, item.turmaId, item.numero, current.situacao, item.situacao, current.turmaRelacionadaId, item.relatedTurmaId],
    );
    state.writes++;
    state.writes += await run(
      database,
      `UPDATE gradebook.vinculo SET situacao = ?, turma_relacionada_id = ?
       WHERE turma_id = ? AND numero = ?`,
      [item.situacao, item.relatedTurmaId, item.turmaId, item.numero],
    );
  }
}

async function resolveProfessor(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id, nome FROM gradebook.professor WHERE ano = ? AND lower(btrim(nome)) = lower(btrim(?))`,
    [request.ano, request.professor],
  );
  if (!current) {
    const created = await changedFirst<Row>(
      database,
      state,
      request,
      2,
      `INSERT INTO gradebook.professor (ano, nome) VALUES (?, ?) RETURNING id`,
      [request.ano, request.professor.trim()],
    );
    return asNumber(created.id, 'professor-id');
  }
  const id = asNumber(current.id, 'professor-id');
  if (String(current.nome) !== request.professor.trim()) {
    await changedRun(database, state, request, 2, `UPDATE gradebook.professor SET nome = ? WHERE id = ?`, [request.professor.trim(), id]);
  }
  return id;
}

async function resolveDiscipline(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  name: string,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id, nome FROM gradebook.disciplina WHERE ano = ? AND lower(btrim(nome)) = lower(btrim(?))`,
    [request.ano, name],
  );
  if (!current) {
    const created = await changedFirst<Row>(
      database,
      state,
      request,
      2,
      `INSERT INTO gradebook.disciplina (ano, nome) VALUES (?, ?) RETURNING id`,
      [request.ano, name.trim()],
    );
    return asNumber(created.id, 'disciplina-id');
  }
  const id = asNumber(current.id, 'disciplina-id');
  if (String(current.nome) !== name.trim()) {
    await changedRun(database, state, request, 2, `UPDATE gradebook.disciplina SET nome = ? WHERE id = ?`, [name.trim(), id]);
  }
  return id;
}

async function resolveOffer(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  turmaId: number,
  professorId: number,
  disciplinaId: number,
): Promise<number> {
  const current = await first<Row>(
    database,
    `SELECT id FROM gradebook.oferta
     WHERE ano = ? AND turma_id = ? AND professor_id = ? AND disciplina_id = ?`,
    [request.ano, turmaId, professorId, disciplinaId],
  );
  if (current) return asNumber(current.id, 'oferta-id');
  const created = await changedFirst<Row>(
    database,
    state,
    request,
    2,
    `INSERT INTO gradebook.oferta (ano, turma_id, professor_id, disciplina_id)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [request.ano, turmaId, professorId, disciplinaId],
  );
  return asNumber(created.id, 'oferta-id');
}

function isUnavailable(value: GradebookImportCellV9 | GradebookImportRecoveryCellV9): boolean {
  return Array.isArray(value) && value[0] === 'u';
}

function isNc(value: GradebookImportRecoveryCellV9): boolean {
  return Array.isArray(value) && value[0] === 'n';
}

interface InstrumentStateV9 {
  readonly id: number;
  maximo: number | null;
  descricao: string | null;
}

async function historyNote(
  database: D1WriteDatabaseV1,
  state: ImportStateV9,
  request: GradebookNotesImportRequestV9,
  instrumentoId: number,
  alunoId: number,
  previous: number | null,
  next: number | null,
): Promise<void> {
  const importId = await ensureImport(database, state, request, 2);
  state.writes += await run(
    database,
    `INSERT INTO gradebook.nota_historico
     (importacao_id, instrumento_id, aluno_id, valor_anterior, valor_novo)
     VALUES (?, ?, ?, ?, ?)`,
    [importId, instrumentoId, alunoId, previous, next],
  );
}

async function processOffer(
  database: D1WriteDatabaseV1,
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
    `SELECT id, trimestre, slot, maximo, descricao FROM gradebook.instrumento WHERE oferta_id = ?`,
    [ofertaId],
  );
  const existingInstruments = new Map<string, InstrumentStateV9>();
  for (const row of instrumentRows) {
    existingInstruments.set(`${asNumber(row.trimestre, 'trimestre')}:${asNumber(row.slot, 'slot')}`, {
      id: asNumber(row.id, 'instrumento-id'),
      maximo: row.maximo === null ? null : asNumber(row.maximo, 'maximo'),
      descricao: row.descricao === null ? null : String(row.descricao),
    });
  }
  const noteRows = await all<Row>(
    database,
    `SELECT n.instrumento_id, n.aluno_id, n.valor
     FROM gradebook.nota n
     JOIN gradebook.instrumento i ON i.id = n.instrumento_id
     WHERE i.oferta_id = ?`,
    [ofertaId],
  );
  const notes = new Map<string, number>();
  for (const row of noteRows) {
    notes.set(`${asNumber(row.instrumento_id, 'instrumento-id')}:${asNumber(row.aluno_id, 'aluno-id')}`, asNumber(row.valor, 'nota'));
  }

  for (const term of offer.trimestres) {
    for (const [column, definition] of term.instrumentos.entries()) {
      const [slot, sourceMaximum, sourceDescription] = definition;
      const key = `${term.trimestre}:${slot}`;
      let instrument = existingInstruments.get(key);
      const hasValue = term.alunos.some(([, values]) => {
        const cell = values[column]!;
        return typeof cell === 'number';
      });
      const meaningful = sourceMaximum !== null || sourceDescription !== undefined || hasValue || instrument !== undefined;
      if (!meaningful) continue;
      if (!instrument) {
        const created = await changedFirst<Row>(
          database,
          state,
          request,
          2,
          `INSERT INTO gradebook.instrumento (oferta_id, trimestre, slot, maximo, descricao)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
          [ofertaId, term.trimestre, slot, sourceMaximum, sourceDescription ?? null],
        );
        instrument = { id: asNumber(created.id, 'instrumento-id'), maximo: sourceMaximum, descricao: sourceDescription ?? null };
        existingInstruments.set(key, instrument);
      } else {
        const nextMaximum = sourceMaximum === null ? instrument.maximo : sourceMaximum;
        const nextDescription = sourceDescription === undefined ? instrument.descricao : sourceDescription;
        if (nextMaximum !== instrument.maximo || nextDescription !== instrument.descricao) {
          const importId = await ensureImport(database, state, request, 2);
          state.writes += await run(
            database,
            `INSERT INTO gradebook.instrumento_historico
             (importacao_id, instrumento_id, maximo_anterior, maximo_novo, descricao_anterior, descricao_nova)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [importId, instrument.id, instrument.maximo, nextMaximum, instrument.descricao, nextDescription],
          );
          state.writes += await run(
            database,
            `UPDATE gradebook.instrumento SET maximo = ?, descricao = ? WHERE id = ?`,
            [nextMaximum, nextDescription, instrument.id],
          );
          instrument.maximo = nextMaximum;
          instrument.descricao = nextDescription;
        }
      }

      for (const [numero, values] of term.alunos) {
        const alunoId = bindings.get(`${turmaId}:${numero}`);
        if (alunoId === undefined) {
          throw new RelationalImportErrorV9('blocked', `Aluno número ${numero} não existe na turma ${offer.turmaCodigo}. Importe a Relação primeiro.`);
        }
        const target = values[column]!;
        if (isUnavailable(target)) continue;
        // Acima do máximo é um erro de lançamento corrigível: persiste o fato-fonte e o navegador avisa.
        const noteKey = `${instrument.id}:${alunoId}`;
        const previous = notes.get(noteKey) ?? null;
        const next = target === null ? null : (target as number);
        if (previous === next) continue;
        await historyNote(database, state, request, instrument.id, alunoId, previous, next);
        if (next === null) {
          state.writes += await run(database, `DELETE FROM gradebook.nota WHERE instrumento_id = ? AND aluno_id = ?`, [instrument.id, alunoId]);
          notes.delete(noteKey);
        } else if (previous === null) {
          state.writes += await run(database, `INSERT INTO gradebook.nota (instrumento_id, aluno_id, valor) VALUES (?, ?, ?)`, [instrument.id, alunoId, next]);
          notes.set(noteKey, next);
        } else {
          state.writes += await run(database, `UPDATE gradebook.nota SET valor = ? WHERE instrumento_id = ? AND aluno_id = ?`, [next, instrument.id, alunoId]);
          notes.set(noteKey, next);
        }
      }
    }
  }

  const fechamentoRows = await all<Row>(
    database,
    `SELECT oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, u_fonte
     FROM gradebook.fechamento WHERE oferta_id = ?`,
    [ofertaId],
  );
  type Close = {
    exists: boolean;
    am: [number | null, number | null, number | null];
    rec: [number | null, number | null, number | null];
    mask: number;
    u: number | null;
  };
  const closing = new Map<number, Close>();
  for (const row of fechamentoRows) {
    closing.set(asNumber(row.aluno_id, 'aluno-id'), {
      exists: true,
      am: [row.am1_fonte === null ? null : asNumber(row.am1_fonte, 'am1'), row.am2_fonte === null ? null : asNumber(row.am2_fonte, 'am2'), row.am3_fonte === null ? null : asNumber(row.am3_fonte, 'am3')],
      rec: [row.rec1 === null ? null : asNumber(row.rec1, 'rec1'), row.rec2 === null ? null : asNumber(row.rec2, 'rec2'), row.rec3 === null ? null : asNumber(row.rec3, 'rec3')],
      mask: asNumber(row.rec_nc_mask, 'rec-mask'),
      u: row.u_fonte === null ? null : asNumber(row.u_fonte, 'u'),
    });
  }

  type Patch = { am?: [GradebookImportCellV9?, GradebookImportCellV9?, GradebookImportCellV9?]; rec?: [GradebookImportRecoveryCellV9, GradebookImportRecoveryCellV9, GradebookImportRecoveryCellV9]; u?: GradebookImportCellV9 };
  const patches = new Map<number, Patch>();
  for (const term of offer.trimestres) {
    for (const [numero, , am] of term.alunos) {
      const alunoId = bindings.get(`${turmaId}:${numero}`);
      if (alunoId === undefined) throw new RelationalImportErrorV9('blocked', `Aluno número ${numero} não existe na turma ${offer.turmaCodigo}.`);
      const patch = patches.get(alunoId) ?? {};
      const ams = patch.am ?? [];
      ams[term.trimestre - 1] = am;
      patch.am = ams;
      patches.set(alunoId, patch);
    }
  }
  for (const [numero, rec1, rec2, rec3, u] of offer.recuperacao ?? []) {
    const alunoId = bindings.get(`${turmaId}:${numero}`);
    if (alunoId === undefined) throw new RelationalImportErrorV9('blocked', `Aluno REC número ${numero} não existe na turma ${offer.turmaCodigo}.`);
    const patch = patches.get(alunoId) ?? {};
    patch.rec = [rec1, rec2, rec3];
    patch.u = u;
    patches.set(alunoId, patch);
  }

  for (const [alunoId, patch] of patches) {
    const current = closing.get(alunoId) ?? { exists: false, am: [null, null, null], rec: [null, null, null], mask: 0, u: null };
    const next: Close = { exists: current.exists, am: [...current.am], rec: [...current.rec], mask: current.mask, u: current.u };
    const changes: Array<{ campo: number; oldValue: number | null; newValue: number | null; oldState: number; newState: number }> = [];
    for (let index = 0; index < 3; index++) {
      const target = patch.am?.[index];
      if (target === undefined || isUnavailable(target)) continue;
      const oldValue = next.am[index]!;
      const newValue = target === null ? null : (target as number);
      if (oldValue === newValue) continue;
      changes.push({ campo: index + 1, oldValue, newValue, oldState: oldValue === null ? 0 : 1, newState: newValue === null ? 0 : 1 });
      next.am[index] = newValue;
    }
    if (patch.rec) {
      for (let index = 0; index < 3; index++) {
        const target = patch.rec[index]!;
        if (isUnavailable(target)) continue;
        const bit = 1 << index;
        const oldNc = (next.mask & bit) !== 0;
        const oldValue = next.rec[index]!;
        const oldState = oldNc ? 2 : oldValue === null ? 0 : 1;
        let newState: number;
        let newValue: number | null;
        if (isNc(target)) {
          newState = 2;
          newValue = null;
          next.mask |= bit;
        } else if (target === null) {
          newState = 0;
          newValue = null;
          next.mask &= ~bit;
        } else {
          newState = 1;
          newValue = target as number;
          next.mask &= ~bit;
        }
        if (oldState === newState && oldValue === newValue) continue;
        changes.push({ campo: index + 4, oldValue, newValue, oldState, newState });
        next.rec[index] = newValue;
      }
    }
    if (patch.u !== undefined && !isUnavailable(patch.u)) {
      const oldValue = next.u;
      const newValue = patch.u === null ? null : (patch.u as number);
      if (oldValue !== newValue) {
        changes.push({ campo: 7, oldValue, newValue, oldState: oldValue === null ? 0 : 1, newState: newValue === null ? 0 : 1 });
        next.u = newValue;
      }
    }
    if (changes.length === 0) continue;
    const importId = await ensureImport(database, state, request, 2);
    for (const change of changes) {
      state.writes += await run(
        database,
        `INSERT INTO gradebook.fechamento_historico
         (importacao_id, oferta_id, aluno_id, campo, valor_anterior, valor_novo, estado_anterior, estado_novo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [importId, ofertaId, alunoId, change.campo, change.oldValue, change.newValue, change.oldState, change.newState],
      );
    }
    const empty = next.am.every((value) => value === null) && next.rec.every((value) => value === null) && next.mask === 0 && next.u === null;
    if (empty && current.exists) {
      state.writes += await run(database, `DELETE FROM gradebook.fechamento WHERE oferta_id = ? AND aluno_id = ?`, [ofertaId, alunoId]);
      continue;
    }
    if (empty) continue;
    if (!current.exists) {
      state.writes += await run(
        database,
        `INSERT INTO gradebook.fechamento
         (oferta_id, aluno_id, am1_fonte, am2_fonte, am3_fonte, rec1, rec2, rec3, rec_nc_mask, u_fonte)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ofertaId, alunoId, next.am[0], next.am[1], next.am[2], next.rec[0], next.rec[1], next.rec[2], next.mask, next.u],
      );
    } else {
      state.writes += await run(
        database,
        `UPDATE gradebook.fechamento
         SET am1_fonte = ?, am2_fonte = ?, am3_fonte = ?, rec1 = ?, rec2 = ?, rec3 = ?, rec_nc_mask = ?, u_fonte = ?
         WHERE oferta_id = ? AND aluno_id = ?`,
        [next.am[0], next.am[1], next.am[2], next.rec[0], next.rec[1], next.rec[2], next.mask, next.u, ofertaId, alunoId],
      );
    }
  }
}

async function persistNotes(
  database: D1WriteDatabaseV1,
  request: GradebookNotesImportRequestV9,
  state: ImportStateV9,
): Promise<void> {
  const year = await first<Row>(database, `SELECT ano FROM gradebook.ano_letivo WHERE ano = ?`, [request.ano]);
  if (!year) {
    throw new RelationalImportErrorV9('blocked', `Relação ${request.ano} ainda não foi importada.`);
  }
  const classRows = await all<Row>(
    database,
    `SELECT id, codigo FROM gradebook.turma WHERE ano = ?`,
    [request.ano],
  );
  const classes = new Map<string, number>();
  for (const row of classRows) classes.set(classKey(String(row.codigo)), asNumber(row.id, 'turma-id'));
  const bindingRows = await all<Row>(
    database,
    `SELECT turma_id, numero, aluno_id FROM gradebook.vinculo WHERE ano = ?`,
    [request.ano],
  );
  const bindings = new Map<string, number>();
  for (const row of bindingRows) {
    const turmaId = asNumber(row.turma_id, 'turma-id');
    const numero = asNumber(row.numero, 'numero');
    bindings.set(`${turmaId}:${numero}`, asNumber(row.aluno_id, 'aluno-id'));
  }
  const professorId = await resolveProfessor(database, state, request);
  const seen = new Set<string>();
  for (const offer of request.ofertas) {
    const turmaId = classes.get(classKey(offer.turmaCodigo));
    if (turmaId === undefined) {
      throw new RelationalImportErrorV9('blocked', `Turma ${offer.turmaCodigo} não existe na Relação ${request.ano}.`);
    }
    const key = `${turmaId}:${dbNameKey(offer.disciplina)}`;
    if (seen.has(key)) throw new RelationalImportErrorV9('blocked', `Oferta duplicada: ${offer.turmaCodigo} / ${offer.disciplina}.`);
    seen.add(key);
    await processOffer(database, state, request, offer, turmaId, professorId, bindings);
  }
}

function transactionDatabase(database: D1WriteDatabaseV1): TransactionDatabaseV9 {
  if (!('transaction' in database) || typeof (database as { transaction?: unknown }).transaction !== 'function') {
    throw new Error('gradebook-relational-import-requires-postgres');
  }
  return database as TransactionDatabaseV9;
}

export function createGradebookRelationalImportServiceV9(database: D1WriteDatabaseV1) {
  return {
    async execute(request: GradebookImportPersistenceRequestV9): Promise<GradebookImportPersistenceResponseV9> {
      try {
        const result = await transactionDatabase(database).transaction(async (transaction) => {
          await lockAcademicYear(transaction, request.ano);
          const state: ImportStateV9 = { importId: null, writes: 0 };
          if (request.operation === 'persist-relacao') await persistRelation(transaction, request, state);
          else await persistNotes(transaction, request, state);
          return state;
        });
        return {
          transportVersion: 9,
          state: result.importId === null ? 'no-changes' : 'applied',
          summary: summary(result.writes, result.importId !== null),
        };
      } catch (cause) {
        if (cause instanceof RelationalImportErrorV9) {
          return { transportVersion: 9, state: cause.state, reason: cause.reason };
        }
        const code = cause !== null && typeof cause === 'object' && 'code' in cause ? String(cause.code) : '';
        if (code === '23505' || code === '23503' || code === '23514') {
          return { transportVersion: 9, state: 'conflict', reason: 'O estado acadêmico mudou ou violou uma regra de integridade durante a importação.' };
        }
        throw cause;
      }
    },
  };
}