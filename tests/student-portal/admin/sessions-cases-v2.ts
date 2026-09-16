import { describe, expect, it } from 'vitest';
import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';
import { PolicyServiceV1 } from '../../../server/student-portal/policies/policy-service-v1';
import {
  readApiV2,
  readAccountIdV2,
  readContextV2,
  READ_CLASS_V2,
  READ_SCHOOL_V2,
} from './read-fixture-v2';
import type { ScopeV1 } from '../../../shared/student-portal-contracts/core-v1';

export function sessionsCasesV2(
  get: () => {
    sql: StudentPortalPostgresSqlV1;
    admin: StudentPortalPostgresSqlV1;
    calls: () => number;
    resetCalls: () => void;
  },
) {
  const account = { kind: 'account', academicYear: 2026, accountId: readAccountIdV2(1) } as const;
  const query = (scope: ScopeV1 = READ_CLASS_V2, cursor?: string) => ({
    contractVersion: 2,
    operation: 'sessions-read',
    scope,
    page: { limit: 100, ...(cursor ? { cursor } : {}) },
  });
  const read = async (scope: ScopeV1 = READ_CLASS_V2, cursor?: string) => {
    const response = await readApiV2(get().sql).query(readContextV2(), query(scope, cursor));
    expect(response.state).toBe('sessions-read');
    if (response.state !== 'sessions-read') throw new Error('Session read unavailable');
    return response;
  };
  async function seed(count: number) {
    await get().admin.unsafe(
      `INSERT INTO student_portal.session(id,account_id,token_hash,security_version,created_at,expires_at,persistent)
      SELECT ('75600000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,$1::uuid,'synthetic-756-session-'||n,0,
        now()-interval '1 hour',now()+interval '1 day',false FROM generate_series(1,$2::integer) n`,
      [account.accountId, count],
    );
  }
  async function enable() {
    const defaults = await new PolicyServiceV1(get().admin).read(READ_SCHOOL_V2);
    await get().admin.unsafe(
      "UPDATE student_portal.setting SET value_json='true'::jsonb WHERE scope_key='school:2026' AND field_key='accessEnabled'",
    );
    await get().admin.unsafe(
      "UPDATE student_portal.setting SET value_json=$1::text::jsonb WHERE scope_key='school:2026' AND field_key='calendar'",
      [
        JSON.stringify({
          ...defaults.value.calendar,
          yearStartsAt: new Date(Date.now() - 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          yearEndsAt: new Date(Date.now() + 86400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        }),
      ],
    );
  }
  describe('authoritative administrative sessions V2', () => {
    it('pages 105 sessions with bounded queries, own scope/CAS and no secret fields', async () => {
      await seed(105);
      get().resetCalls();
      const first = await read();
      expect(get().calls()).toBeLessThanOrEqual(7);
      expect(first.revocableCount).toBe(105);
      expect(first.items).toHaveLength(100);
      expect(first.items[0]).toMatchObject({
        accountId: account.accountId,
        validity: 'unavailable',
      });
      expect(JSON.stringify(first)).not.toMatch(
        /token_hash|security_version|synthetic-756-session|birth|password/u,
      );
      const second = await read(READ_CLASS_V2, first.nextCursor!);
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      expect(new Set([...first.items, ...second.items].map((s) => s.sessionId)).size).toBe(105);
      const own = await read(account);
      expect(own.version).toBe(own.items[0]!.accountVersion);
      expect(own.scope).toEqual(account);
      const empty = await read({ ...READ_CLASS_V2, classId: 746106 });
      expect(empty).toMatchObject({ items: [], revocableCount: 0, nextCursor: null });
    });
    it('keeps active sessions ahead of history across bounded filtered pages and binds the cursor to the view', async () => {
      await enable();
      await seed(620);
      await get().admin.unsafe(
        `UPDATE student_portal.session SET created_at=now()-interval '13 hours' WHERE right(id::text,12)::bigint<=600`,
      );
      const api = readApiV2(get().sql),
        input = { ...query(account), sessionView: 'active' };
      const first = await api.query(readContextV2(), input);
      expect(first.state).toBe('sessions-read');
      if (first.state !== 'sessions-read') throw new Error('read failed');
      expect(first.items).toEqual([]);
      expect(first.nextCursor).not.toBeNull();
      const second = await api.query(readContextV2(), {
        ...input,
        page: { limit: 100, cursor: first.nextCursor },
      });
      expect(second.state).toBe('sessions-read');
      if (second.state !== 'sessions-read') throw new Error('read failed');
      expect(second.items).toHaveLength(20);
      expect(second.items.every((s) => s.validity === 'valid')).toBe(true);
      expect(second.nextCursor).toBeNull();
      expect(
        (
          await api.query(readContextV2(), {
            ...input,
            sessionView: 'history',
            page: { limit: 100, cursor: first.nextCursor },
          })
        ).state,
      ).toBe('invalid-request');
      const history = await api.query(readContextV2(), { ...input, sessionView: 'history' });
      expect(history.state).toBe('sessions-read');
      if (history.state !== 'sessions-read') throw new Error('read failed');
      expect(history.items).toHaveLength(100);
      expect(history.items.every((s) => s.validity === 'expired')).toBe(true);
      expect(new Set(second.items.map((s) => s.sessionId)).size).toBe(20);
    });
    it('uses the server clock, current duration/year cap, revocation, security and block policy', async () => {
      await enable();
      await seed(5);
      await get().admin.unsafe(`UPDATE student_portal.session SET
        created_at=CASE WHEN right(id::text,1)='2' THEN now()-interval '13 hours' ELSE created_at END,
        security_version=CASE WHEN right(id::text,1)='3' THEN 1 ELSE 0 END,
        revoked_at=CASE WHEN right(id::text,1)='4' THEN now() ELSE NULL END,
        expires_at=CASE WHEN right(id::text,1)='5' THEN now()-interval '1 second' ELSE expires_at END`);
      const response = await read(account);
      expect(response.items.map((s) => s.validity)).toEqual([
        'valid',
        'expired',
        'unavailable',
        'revoked',
        'expired',
      ]);
      expect(response.revocableCount).toBe(4);
      expect(Date.parse(response.items[0]!.effectiveExpiresAt!)).toBeLessThan(
        Date.parse(response.items[0]!.expiresAt),
      );
      const summary = await readApiV2(get().sql).query(readContextV2(), {
        ...query(account),
        operation: 'accounts-read',
      });
      expect(summary.state === 'accounts-read' && summary.items[0]!.validSessionCount).toBe(1);
      await get().admin.unsafe('UPDATE student_portal.account SET blocked=true WHERE id=$1::uuid', [
        account.accountId,
      ]);
      expect((await read(account)).items[0]!.validity).toBe('unavailable');
      await get().admin.unsafe(
        "UPDATE student_portal.setting SET value_json=jsonb_set(value_json,'{yearEndsAt}',to_jsonb(to_char(statement_timestamp()-interval '1 second','YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"'))) WHERE scope_key='school:2026' AND field_key='calendar'",
      );
      expect((await read(account)).items[0]!.validity).toBe('expired');
    });
    it('keeps ambiguous class members visible and revocable while denying validity', async () => {
      await enable();
      await seed(1);
      await get().admin.unsafe('DROP INDEX gradebook.vinculo_um_corrente_por_aluno_uidx');
      try {
        await get().admin.unsafe(
          'INSERT INTO gradebook.vinculo(ano,turma_id,numero,aluno_id) VALUES(2026,746002,1,746001)',
        );
        for (const classId of [746001, 746002]) {
          const page = await read({ ...READ_CLASS_V2, classId });
          expect(page).toMatchObject({ revocableCount: 1 });
          expect(page.items[0]).toMatchObject({ validity: 'unavailable', classLabel: '' });
        }
        const scope = { ...READ_CLASS_V2, classId: 746002 };
        const before = await read(scope);
        const result = await readApiV2(get().sql).command(
          { ...readContextV2(), capability: 'platform.settings.write' },
          {
            contractVersion: 1,
            operation: 'sessions-revoke',
            scope,
            expectedVersion: before.version,
            idempotencyKey: crypto.randomUUID(),
            confirmed: true,
          },
        );
        expect(result.state).toBe('committed');
        expect((await read()).items[0]!.validity).toBe('revoked');
      } finally {
        await get().admin.unsafe(
          'DELETE FROM gradebook.vinculo WHERE turma_id=746002 AND aluno_id=746001',
        );
        await get().admin.unsafe(
          'CREATE UNIQUE INDEX vinculo_um_corrente_por_aluno_uidx ON gradebook.vinculo(aluno_id) WHERE situacao IS DISTINCT FROM 6',
        );
      }
    });
    it('binds cursors to scope, actor and operation and rejects unused filters before SQL', async () => {
      await seed(105);
      const page = await read();
      const api = readApiV2(get().sql);
      expect((await api.query(readContextV2(), query(account, page.nextCursor!))).state).toBe(
        'invalid-request',
      );
      expect(
        (
          await api.query(
            { ...readContextV2(), actorId: readAccountIdV2(900) },
            query(READ_CLASS_V2, page.nextCursor!),
          )
        ).state,
      ).toBe('invalid-request');
      get().resetCalls();
      expect((await api.query(readContextV2(), { ...query(), nameSearch: 'hidden' })).state).toBe(
        'invalid-request',
      );
      expect(get().calls()).toBe(0);
    });
    it.each(['individual', 'account', 'class'] as const)(
      'rechecks real revocation CAS, write permission and receipt replay for %s',
      async (mode) => {
        await seed(3);
        const scope = mode === 'class' ? READ_CLASS_V2 : account;
        const before = await read(scope);
        const input = {
          contractVersion: 1,
          operation: 'sessions-revoke',
          scope,
          ...(mode === 'individual' ? { sessionId: before.items[0]!.sessionId } : {}),
          expectedVersion: before.version,
          idempotencyKey: crypto.randomUUID(),
          confirmed: true,
        };
        const api = readApiV2(get().sql);
        expect((await api.command(readContextV2(), input)).state).toBe('forbidden');
        const context = { ...readContextV2(), capability: 'platform.settings.write' };
        expect(
          (await api.command(context, { ...input, expectedVersion: before.version + 1 })).state,
        ).toBe('conflict');
        const committed = await api.command(context, input);
        expect(committed.state).toBe('committed');
        const after = await read(scope);
        expect(after.revocableCount).toBe(mode === 'individual' ? 2 : 0);
        expect(after.items.filter((s) => s.validity === 'revoked')).toHaveLength(
          mode === 'individual' ? 1 : 3,
        );
        const replay = await api.command(context, input);
        expect(
          replay.state === 'committed' &&
            committed.state === 'committed' &&
            replay.operationId === committed.operationId,
        ).toBe(true);
      },
    );
  });
}
