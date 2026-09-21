import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type {
  AuditOccurrenceId,
  AuditOccurrenceStateTransitionV1,
  AuditOccurrenceV1,
  ReconciliationResultId,
  ReconciliationResultV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { AcademicYearId, StudentId } from '../../../../shared/gradebook-contracts/entities';
import type {
  ImportBatchId,
  SourceFileManifestId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type {
  AcademicGradeValueV1,
  ComparedGradeValueV1,
} from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  createGradebookD1AuditRepositoryV1,
  GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1,
} from '../../../../server/gradebook/persistence/d1/audit/d1-audit-repository-v1';
import { createGradebookD1WriteUnitOfWorkV1 } from '../../../../server/gradebook/persistence/d1/write/d1-write-adapter-v1';
import type {
  AcademicPersistenceContextV1,
  AuditRecordStreamV1,
  AuditRecordV1,
} from '../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import {
  context,
  gradeRecord,
  gradeStream,
  importBatchId,
  instant,
  openMigratedDatabase,
  seedBatch,
  seedContext,
  sourceFileVersion,
  studentId,
  type SqliteD1Database,
} from '../d1-transaction/d1-write-test-support';

const otherYearId = 'academic-year:d1-audit:2027' as AcademicYearId;
const otherContext = { academicYearId: otherYearId } satisfies AcademicPersistenceContextV1;
const actorId = 'actor:d1-audit:synthetic';
const occurrenceId = 'audit-occurrence:d1-audit:001' as AuditOccurrenceId;
const occurrenceStream = { kind: 'occurrence', id: occurrenceId } satisfies AuditRecordStreamV1;
const reconciliationId = 'reconciliation:d1-audit:001' as ReconciliationResultId;
const reconciliationStream = {
  kind: 'reconciliation',
  id: reconciliationId,
} satisfies AuditRecordStreamV1;

let database: SqliteD1Database;

beforeEach(async () => {
  database = await openMigratedDatabase();
  seedContext(database);
});

afterEach(() => {
  database.raw.close();
});

function seedOtherYear(): void {
  database.raw
    .prepare(
      `INSERT INTO academic_years (
         academic_year_id, school_id, year, current_version, created_at
       ) VALUES (?, 'school:d1-audit:other', 2027, 1, ?)`,
    )
    .run(otherYearId, instant);
}

function acknowledgement(note = 'Revisão sintética iniciada.') {
  return {
    previousState: 'open',
    nextState: 'acknowledged',
    actorId,
    occurredAt: '2026-09-01T02:01:00.000Z',
    note,
  } as const;
}

function resolution(previousState: 'open' | 'acknowledged' = 'acknowledged') {
  return {
    previousState,
    nextState: 'resolved',
    actorId,
    occurredAt: '2026-09-01T02:02:00.000Z',
    justification: 'Evidência sintética conferida.',
  } as const;
}

function dismissal(previousState: 'open' | 'acknowledged' = 'open') {
  return {
    previousState,
    nextState: 'dismissed-with-reason',
    actorId,
    occurredAt: '2026-09-01T02:03:00.000Z',
    justification: 'Ocorrência sintética não aplicável.',
  } as const;
}

function occurrence(
  state: AuditOccurrenceV1['state'] = 'open',
  stateHistory: readonly AuditOccurrenceStateTransitionV1[] = [],
  id: AuditOccurrenceId = occurrenceId,
): AuditOccurrenceV1 {
  return {
    id,
    severity: 'warning',
    category: 'synthetic-integrity',
    message: 'Ocorrência sintética para persistência local.',
    recommendedAction: 'Conferir a evidência sintética.',
    createdAt: instant,
    state,
    stateHistory,
  } as AuditOccurrenceV1;
}

function evidence(value: number | 0.1 = 8) {
  return value === 0.1
    ? ({
        provenance: {
          fileName: 'synthetic-gradebook.xlsx',
          fileSha256: 'a'.repeat(64),
          sheetName: 'Synthetic1º',
          cellAddress: 'AM10',
        },
        classification: 'manual-official-zero-marker',
        rawValue: 0.1,
      } as const)
    : ({
        provenance: {
          fileName: 'synthetic-gradebook.xlsx',
          fileSha256: 'a'.repeat(64),
          sheetName: 'Synthetic1º',
          cellAddress: 'AM10',
        },
        classification: 'manual-positive-number',
        rawValue: value,
      } as const);
}

function compared(
  imported: AcademicGradeValueV1 = { state: 'numeric', value: 8 },
  calculated: AcademicGradeValueV1 = { state: 'numeric', value: 8 },
): ComparedGradeValueV1 {
  return {
    imported: {
      value: imported,
      evidence: [evidence(imported.state === 'official-zero' ? 0.1 : 8)],
    },
    calculated: { value: calculated },
  };
}

function reconciliation(
  status: ReconciliationResultV1['status'],
  id: ReconciliationResultId = reconciliationId,
  value: ComparedGradeValueV1 = compared(),
): ReconciliationResultV1 {
  const base = {
    id,
    target: { kind: 'grade-entry' as const, id: gradeRecord(8).value.id },
    value,
    ruleVersion: 'synthetic-reconciliation-v1',
  };
  return status === 'not-comparable'
    ? {
        ...base,
        status,
        difference: null,
        tolerance: null,
        explanation: 'Dados sintéticos insuficientes para comparação.',
      }
    : {
        ...base,
        status,
        difference: status === 'mismatch' ? 0.5 : 0,
        tolerance: 0,
        ...(status === 'expected-difference'
          ? { explanation: 'Estados sintéticos de zero preservados.' }
          : {}),
      };
}

async function seedAcademicRecord(): Promise<void> {
  const result = await createGradebookD1WriteUnitOfWorkV1(database, {
    now: () => instant,
  }).academicRecords.appendVersion(context, gradeStream, gradeRecord(8), {
    expectedVersion: null,
  });
  expect(result.status).toBe('written');
}

async function seedSource(): Promise<ReturnType<typeof sourceFileVersion>> {
  const source = sourceFileVersion('a', 'synthetic-gradebook.xlsx');
  const result = await createGradebookD1WriteUnitOfWorkV1(database, {
    now: () => instant,
  }).imports.appendSourceFileVersion(context, source, { expectedVersion: null });
  expect(result.status).toBe('written');
  return source;
}

describe('repositório D1 local de Auditoria V1', () => {
  it('cria e lê uma ocorrência aberta inicial sem transição implícita', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const record = { kind: 'occurrence', value: occurrence() } satisfies AuditRecordV1;

    await expect(
      repository.appendVersion(context, occurrenceStream, record, { expectedVersion: null }),
    ).resolves.toEqual({
      status: 'written',
      record: { value: record, version: 1, recordedAt: instant },
    });
    await expect(repository.getCurrent(context, occurrenceStream)).resolves.toEqual({
      value: record,
      version: 1,
      recordedAt: instant,
    });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_occurrence_transitions').get(),
    ).toEqual({ count: 0 });
  });

  it('acrescenta reconhecimento e resolução sem regravar transições anteriores', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const open = { kind: 'occurrence', value: occurrence() } satisfies AuditRecordV1;
    const acknowledged = {
      kind: 'occurrence',
      value: occurrence('acknowledged', [acknowledgement()]),
    } satisfies AuditRecordV1;
    const resolved = {
      kind: 'occurrence',
      value: occurrence('resolved', [acknowledgement(), resolution()]),
    } satisfies AuditRecordV1;

    await repository.appendVersion(context, occurrenceStream, open, { expectedVersion: null });
    await repository.appendVersion(context, occurrenceStream, acknowledged, { expectedVersion: 1 });
    await repository.appendVersion(context, occurrenceStream, resolved, { expectedVersion: 2 });

    await expect(repository.getCurrent(context, occurrenceStream)).resolves.toMatchObject({
      value: resolved,
      version: 3,
    });
    expect(
      database.raw
        .prepare(
          `SELECT transition_sequence, previous_state, next_state, actor_id, note, justification
           FROM audit_occurrence_transitions ORDER BY transition_sequence`,
        )
        .all(),
    ).toEqual([
      {
        transition_sequence: 1,
        previous_state: 'open',
        next_state: 'acknowledged',
        actor_id: actorId,
        note: 'Revisão sintética iniciada.',
        justification: null,
      },
      {
        transition_sequence: 2,
        previous_state: 'acknowledged',
        next_state: 'resolved',
        actor_id: actorId,
        note: null,
        justification: 'Evidência sintética conferida.',
      },
    ]);
  });

  it('preserva descarte explícito com ator, data e justificativa', async () => {
    const id = 'audit-occurrence:d1-audit:dismissed' as AuditOccurrenceId;
    const stream = { kind: 'occurrence', id } satisfies AuditRecordStreamV1;
    const value = occurrence('dismissed-with-reason', [dismissal()], id);
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    await repository.appendVersion(
      context,
      stream,
      { kind: 'occurrence', value },
      {
        expectedVersion: null,
      },
    );
    await expect(repository.getCurrent(context, stream)).resolves.toMatchObject({
      value: { value },
    });
  });

  it('rejeita salto, remoção, alteração do passado e justificativa ausente', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    await repository.appendVersion(
      context,
      occurrenceStream,
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );
    await repository.appendVersion(
      context,
      occurrenceStream,
      { kind: 'occurrence', value: occurrence('acknowledged', [acknowledgement()]) },
      { expectedVersion: 1 },
    );

    const rewritten = occurrence('acknowledged', [acknowledgement('Histórico alterado.')]);
    const removed = occurrence('open', []);
    const skipped = occurrence('resolved', [
      {
        previousState: 'acknowledged',
        nextState: 'resolved',
        actorId,
        occurredAt: instant,
        justification: 'Salto sintético.',
      },
    ]);
    const missingJustification = occurrence('resolved', [
      {
        previousState: 'open',
        nextState: 'resolved',
        actorId,
        occurredAt: instant,
      } as AuditOccurrenceStateTransitionV1,
    ]);

    for (const value of [rewritten, removed]) {
      await expect(
        repository.appendVersion(
          context,
          occurrenceStream,
          { kind: 'occurrence', value },
          { expectedVersion: 2 },
        ),
      ).rejects.toMatchObject({ code: 'invalid-transition-history' });
    }
    for (const value of [skipped, missingJustification]) {
      await expect(
        repository.appendVersion(
          context,
          occurrenceStream,
          { kind: 'occurrence', value },
          { expectedVersion: 2 },
        ),
      ).rejects.toMatchObject({ code: 'incompatible-write' });
    }
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_record_versions').get(),
    ).toEqual({ count: 2 });
  });

  it('valida lote, entidade e manifesto no mesmo ano e preserva a origem', async () => {
    seedBatch(database);
    const source = await seedSource();
    const value: AuditOccurrenceV1 = {
      ...occurrence(),
      importBatchId,
      entity: { kind: 'student', id: studentId },
      source: {
        kind: 'cell',
        sourceFileManifestId: source.manifest.id,
        evidence: evidence(),
      },
    };
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    await repository.appendVersion(
      context,
      occurrenceStream,
      { kind: 'occurrence', value },
      { expectedVersion: null },
    );

    await expect(repository.getCurrent(context, occurrenceStream)).resolves.toMatchObject({
      value: { value },
    });
    expect(
      database.raw
        .prepare(
          `SELECT import_batch_id, entity_kind, entity_id, source_manifest_id,
                  source_manifest_version, source_sheet_name, source_cell_address
           FROM audit_record_versions`,
        )
        .get(),
    ).toEqual({
      import_batch_id: importBatchId,
      entity_kind: 'student',
      entity_id: studentId,
      source_manifest_id: source.manifest.id,
      source_manifest_version: 1,
      source_sheet_name: 'Synthetic1º',
      source_cell_address: 'AM10',
    });
  });

  it('recusa referências ausentes ou de outro ano e reverte a raiz', async () => {
    seedOtherYear();
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const cases: AuditOccurrenceV1[] = [
      { ...occurrence(), importBatchId: 'import-batch:absent' as ImportBatchId },
      {
        ...occurrence(),
        entity: { kind: 'student', id: 'student:absent' as StudentId },
      },
      {
        ...occurrence(),
        source: {
          kind: 'file',
          sourceFileManifestId: 'manifest:absent' as SourceFileManifestId,
        },
      },
    ];
    for (const [index, value] of cases.entries()) {
      const stream = {
        kind: 'occurrence',
        id: `audit-occurrence:d1-audit:broken:${String(index)}` as AuditOccurrenceId,
      } satisfies AuditRecordStreamV1;
      const record = { kind: 'occurrence', value: { ...value, id: stream.id } } as const;
      await expect(
        repository.appendVersion(context, stream, record, { expectedVersion: null }),
      ).rejects.toMatchObject({ code: 'broken-reference' });
    }
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_record_streams').get(),
    ).toEqual({ count: 0 });
  });

  it('preserva match, expected-difference, mismatch e not-comparable sem recalcular', async () => {
    await seedAcademicRecord();
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const officialZero: AcademicGradeValueV1 = {
      state: 'official-zero',
      value: 0,
      sourceMarker: 0.1,
    };
    const legacyZero: AcademicGradeValueV1 = { state: 'legacy-zero', value: 0 };
    const values = [
      reconciliation('match'),
      reconciliation(
        'expected-difference',
        'reconciliation:d1-audit:expected' as ReconciliationResultId,
        compared(officialZero, legacyZero),
      ),
      reconciliation('mismatch', 'reconciliation:d1-audit:mismatch' as ReconciliationResultId),
      reconciliation(
        'not-comparable',
        'reconciliation:d1-audit:not-comparable' as ReconciliationResultId,
      ),
    ];
    for (const value of values) {
      const stream = { kind: 'reconciliation', id: value.id } satisfies AuditRecordStreamV1;
      await repository.appendVersion(
        context,
        stream,
        { kind: 'reconciliation', value },
        { expectedVersion: null },
      );
      await expect(repository.getCurrent(context, stream)).resolves.toMatchObject({
        value: { value },
      });
    }
    const expected = await repository.getCurrent(context, {
      kind: 'reconciliation',
      id: values[1]!.id,
    });
    expect(expected?.value).toEqual({ kind: 'reconciliation', value: values[1] });
    expect(expected?.value).not.toHaveProperty('authorityMode');
  });

  it('valida o alvo acadêmico por ano e stream sem inventar equivalência', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const value = reconciliation('match');
    await expect(
      repository.appendVersion(
        context,
        reconciliationStream,
        { kind: 'reconciliation', value },
        { expectedVersion: null },
      ),
    ).rejects.toMatchObject({ code: 'broken-reference' });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_record_streams').get(),
    ).toEqual({ count: 0 });
  });

  it('atualiza reconciliação por CAS preservando as duas versões sem recalcular', async () => {
    await seedAcademicRecord();
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const first = reconciliation('match');
    const second = reconciliation(
      'mismatch',
      reconciliationId,
      compared({ state: 'numeric', value: 7.5 }, { state: 'numeric', value: 8 }),
    );
    await repository.appendVersion(
      context,
      reconciliationStream,
      { kind: 'reconciliation', value: first },
      { expectedVersion: null },
    );
    await repository.appendVersion(
      context,
      reconciliationStream,
      { kind: 'reconciliation', value: second },
      { expectedVersion: 1 },
    );

    await expect(repository.getCurrent(context, reconciliationStream)).resolves.toEqual({
      value: { kind: 'reconciliation', value: second },
      version: 2,
      recordedAt: instant,
    });
    const history = await repository.listVersions(context, reconciliationStream, { limit: 10 });
    expect(history.items.map(({ value }) => value)).toEqual([
      { kind: 'reconciliation', value: first },
      { kind: 'reconciliation', value: second },
    ]);
  });

  it('pagina o histórico em ordem crescente com cursor opaco isolado por stream e ano', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const records = [
      { kind: 'occurrence', value: occurrence() },
      { kind: 'occurrence', value: occurrence('acknowledged', [acknowledgement()]) },
      {
        kind: 'occurrence',
        value: occurrence('resolved', [acknowledgement(), resolution()]),
      },
    ] satisfies readonly AuditRecordV1[];
    await repository.appendVersion(context, occurrenceStream, records[0]!, {
      expectedVersion: null,
    });
    await repository.appendVersion(context, occurrenceStream, records[1]!, {
      expectedVersion: 1,
    });
    await repository.appendVersion(context, occurrenceStream, records[2]!, {
      expectedVersion: 2,
    });
    const first = await repository.listVersions(context, occurrenceStream, { limit: 2 });
    const second = await repository.listVersions(context, occurrenceStream, {
      limit: 2,
      cursor: first.nextCursor,
    });
    expect([...first.items, ...second.items].map(({ version }) => version)).toEqual([1, 2, 3]);
    expect(first.nextCursor).not.toBeNull();
    expect(second.nextCursor).toBeNull();

    await expect(
      repository.listVersions(
        otherContext,
        { kind: 'occurrence', id: occurrenceStream.id },
        { limit: 2, cursor: first.nextCursor },
      ),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
    await expect(
      repository.listVersions(
        context,
        {
          kind: 'occurrence',
          id: 'audit-occurrence:d1-audit:other' as AuditOccurrenceId,
        },
        { limit: 2, cursor: first.nextCursor },
      ),
    ).rejects.toMatchObject({ code: 'invalid-cursor' });
  });

  it('aplica CAS nulo/válido/obsoleto sem criar versão ou transição órfã', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const open = { kind: 'occurrence', value: occurrence() } satisfies AuditRecordV1;
    const acknowledged = {
      kind: 'occurrence',
      value: occurrence('acknowledged', [acknowledgement()]),
    } satisfies AuditRecordV1;
    expect(
      await repository.appendVersion(context, occurrenceStream, open, { expectedVersion: null }),
    ).toMatchObject({ status: 'written', record: { version: 1 } });
    expect(
      await repository.appendVersion(context, occurrenceStream, open, { expectedVersion: null }),
    ).toEqual({ status: 'version-conflict', currentVersion: 1 });
    expect(
      await repository.appendVersion(context, occurrenceStream, acknowledged, {
        expectedVersion: 1,
      }),
    ).toMatchObject({ status: 'written', record: { version: 2 } });
    expect(
      await repository.appendVersion(context, occurrenceStream, acknowledged, {
        expectedVersion: 1,
      }),
    ).toEqual({ status: 'version-conflict', currentVersion: 2 });
    expect(
      await repository.appendVersion(
        context,
        {
          kind: 'occurrence',
          id: 'audit-occurrence:d1-audit:missing' as AuditOccurrenceId,
        },
        {
          kind: 'occurrence',
          value: occurrence('open', [], 'audit-occurrence:d1-audit:missing' as AuditOccurrenceId),
        },
        { expectedVersion: 1 },
      ),
    ).toEqual({ status: 'version-conflict', currentVersion: null });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_record_versions').get(),
    ).toEqual({ count: 2 });
    expect(
      database.raw.prepare('SELECT COUNT(*) AS count FROM audit_occurrence_transitions').get(),
    ).toEqual({ count: 1 });
  });

  it('isola streams inexistentes entre anos', async () => {
    seedOtherYear();
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    await repository.appendVersion(
      otherContext,
      occurrenceStream,
      { kind: 'occurrence', value: occurrence() },
      { expectedVersion: null },
    );
    await expect(repository.getCurrent(context, occurrenceStream)).resolves.toBeNull();
    await expect(repository.getCurrent(otherContext, occurrenceStream)).resolves.toMatchObject({
      version: 1,
    });
  });

  it('reverte raiz, versão e transição quando um CHECK falha', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const invalidTransition = {
      ...acknowledgement(),
      occurredAt: 'invalid-timestamp',
    };
    const record = {
      kind: 'occurrence',
      value: occurrence('acknowledged', [invalidTransition]),
    } satisfies AuditRecordV1;
    const error = await repository
      .appendVersion(context, occurrenceStream, record, { expectedVersion: null })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'database-write-failed',
      message: 'Não foi possível gravar os dados de Auditoria persistidos.',
    });
    expect(String(error)).not.toContain('CHECK constraint');
    for (const table of [
      'audit_record_streams',
      'audit_record_versions',
      'audit_occurrence_transitions',
    ]) {
      expect(database.raw.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).toEqual({
        count: 0,
      });
    }
  });

  it('detecta JSON, shape e coluna divergente sem expor conteúdo', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const record = { kind: 'occurrence', value: occurrence() } satisfies AuditRecordV1;
    await repository.appendVersion(context, occurrenceStream, record, { expectedVersion: null });
    database.raw.exec('PRAGMA ignore_check_constraints = ON;');
    database.raw.prepare("UPDATE audit_record_versions SET payload_json = '{invalid-json'").run();
    database.raw.exec('PRAGMA ignore_check_constraints = OFF;');
    const invalidJson = await repository
      .getCurrent(context, occurrenceStream)
      .catch((cause: unknown) => cause);
    expect(invalidJson).toMatchObject({
      code: 'invalid-json',
      message: 'Os dados de Auditoria persistidos não puderam ser reconstruídos.',
    });
    expect(String(invalidJson)).not.toContain('{invalid-json');

    database.raw
      .prepare('UPDATE audit_record_versions SET payload_json = ?')
      .run(JSON.stringify(record));
    database.raw.prepare("UPDATE audit_record_versions SET category = 'divergent'").run();
    await expect(repository.getCurrent(context, occurrenceStream)).rejects.toMatchObject({
      code: 'incompatible-row',
    });
  });

  it('sanitiza falha bruta do driver e rejeita paginação/opções inválidas', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database);
    for (const limit of [0, GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 + 1]) {
      await expect(
        repository.listVersions(context, occurrenceStream, { limit }),
      ).rejects.toMatchObject({ code: 'invalid-page-request' });
    }
    database.raw.exec('DROP TABLE audit_record_versions;');
    const error = await repository
      .getCurrent(context, occurrenceStream)
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({
      code: 'database-read-failed',
      message: 'Não foi possível consultar os dados de Auditoria persistidos.',
    });
    expect(String(error)).not.toContain('SELECT');
    expect(String(error)).not.toContain(occurrenceId);
    expect(String(error)).not.toContain('no such table');

    for (const maximumPageSize of [0, GRADEBOOK_D1_AUDIT_DEFAULT_MAXIMUM_PAGE_SIZE_V1 + 1]) {
      expect(() => createGradebookD1AuditRepositoryV1(database, { maximumPageSize })).toThrow(
        expect.objectContaining({ code: 'invalid-options' }),
      );
    }
  });

  it('é determinístico e não altera contexto, stream ou payload', async () => {
    const repository = createGradebookD1AuditRepositoryV1(database, { now: () => instant });
    const record = { kind: 'occurrence', value: occurrence() } satisfies AuditRecordV1;
    const page = { limit: 10, cursor: null } as const;
    const contextSnapshot = structuredClone(context);
    const streamSnapshot = structuredClone(occurrenceStream);
    const recordSnapshot = structuredClone(record);
    const pageSnapshot = structuredClone(page);
    await repository.appendVersion(context, occurrenceStream, record, { expectedVersion: null });

    expect(await repository.getCurrent(context, occurrenceStream)).toEqual(
      await repository.getCurrent(context, occurrenceStream),
    );
    expect(await repository.listVersions(context, occurrenceStream, page)).toEqual(
      await repository.listVersions(context, occurrenceStream, page),
    );
    expect(context).toEqual(contextSnapshot);
    expect(occurrenceStream).toEqual(streamSnapshot);
    expect(record).toEqual(recordSnapshot);
    expect(page).toEqual(pageSnapshot);
  });
});
