import { describe, expect, it } from 'vitest';
import { readBirthPageV1 } from '../../../../src/features/student-portal-admin/birth-year/birth-read-v1';
import {
  birthDirtyV1,
  birthDraftRowV1,
  birthSetItemV1,
  birthSingleCommandV1,
  validBirthYearV1,
} from '../../../../src/features/student-portal-admin/birth-year/birth-values-v1';
import { BIRTH_CLASS_V1, birthMockV1, birthJsonV1 } from './fixtures-v1';

describe('birth values and bounded joined reads', () => {
  it('accepts only four ASCII digits in1900..2026, never trim/coerce incomplete input', () => {
    for (const value of ['1900', '2000', '2026']) expect(validBirthYearV1(value)).toBe(true);
    for (const value of [
      '',
      '2',
      '20',
      '201',
      '0000',
      '1899',
      '2027',
      ' 2000',
      '2000 ',
      '２０２０',
      '2e03',
      '20.0',
    ])
      expect(validBirthYearV1(value)).toBe(false);
  });
  it('pairs two opaque cursors across105 accounts and preserves all three distinct versions', async () => {
    const mock = birthMockV1({ count: 105 }),
      signal = new AbortController().signal;
    const first = await readBirthPageV1(
      mock.client,
      mock.reader,
      BIRTH_CLASS_V1,
      undefined,
      signal,
    );
    expect(first.rows).toHaveLength(100);
    expect(first.scopeVersion).toBe(47);
    expect(first.next?.accounts).not.toBe(first.next?.birth);
    const second = await readBirthPageV1(
      mock.client,
      mock.reader,
      BIRTH_CLASS_V1,
      first.next!,
      signal,
    );
    expect(second.rows).toHaveLength(5);
    expect(second.next).toBeNull();
    const row = birthDraftRowV1(first.rows[0]!);
    row.year = '2001';
    const command = birthSingleCommandV1(row, birthSetItemV1(row));
    expect(command.expectedVersion).toBe(19);
    expect(command.item.expectedVersion).toBe(7);
    expect(command.item).toMatchObject({ confirmation: 'unconfirmed-test' });
    expect(birthDirtyV1(row)).toBe(true);
    expect(mock.queries).toHaveLength(4);
  });
  it('joins by identity even when a birth page arrives in another order', async () => {
    const mock = birthMockV1({
      query(query) {
        if (query.operation !== 'birth-years') return;
        return mock
          .defaultQuery(query)
          .json()
          .then((data) => birthJsonV1({ ...data, items: data.items.reverse() }));
      },
    });
    const page = await readBirthPageV1(
      mock.client,
      mock.reader,
      BIRTH_CLASS_V1,
      undefined,
      new AbortController().signal,
    );
    expect(page.rows[0]?.birth.year).toBe('2000');
    expect(page.rows[1]?.birth.year).toBeNull();
  });
  it('rejects mismatched account CAS rather than rebasing a birth draft', async () => {
    const mock = birthMockV1({
      query(query) {
        if (query.operation !== 'birth-years') return;
        return mock
          .defaultQuery(query)
          .json()
          .then((data) => {
            data.items[0].accountVersion++;
            return birthJsonV1(data);
          });
      },
    });
    await expect(
      readBirthPageV1(
        mock.client,
        mock.reader,
        BIRTH_CLASS_V1,
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ state: 'conflict' });
  });
  it('rejects closed, moved or mismatched identities and refuses school scope before a request', async () => {
    const mock = birthMockV1(),
      signal = new AbortController().signal;
    await expect(
      readBirthPageV1(
        mock.client,
        mock.reader,
        { kind: 'account', academicYear: 2026, accountId: mock.accounts[0]!.accountId },
        undefined,
        signal,
        754002,
      ),
    ).rejects.toMatchObject({ state: 'conflict' });
    mock.accounts[0]!.linkClosed = true;
    await expect(
      readBirthPageV1(mock.client, mock.reader, BIRTH_CLASS_V1, undefined, signal),
    ).rejects.toMatchObject({ state: 'conflict' });
    const before = mock.queries.length;
    // @ts-expect-error unsupported runtime input from a composition bug must also fail closed
    await expect(
      readBirthPageV1(
        mock.client,
        mock.reader,
        { kind: 'school', academicYear: 2026 },
        undefined,
        signal,
      ),
    ).rejects.toMatchObject({ state: 'invalid-request' });
    expect(mock.queries).toHaveLength(before);
  });
});
