// @vitest-environment node
import { expect, it } from 'vitest';
import { createBirthEditorV1, emptyBirthEditorV1 } from '../../../../src/features/student-portal-admin/birth-year/birth-editor-v1';
import { birthMockV1, birthIdV1 } from './fixtures-v1';

it('limits initial, refresh and append reads to the visited birth window while retaining drafts and paired cursors', async () => {
  const mock = birthMockV1({ count: 1005 });
  let state = emptyBirthEditorV1();
  const editor = createBirthEditorV1({
    ...mock.props,
    continuous: true,
    publish: (next) => { state = next; },
  });
  try {
    await editor.load();
    expect(state.rows).toHaveLength(100);
    expect(mock.queries).toHaveLength(2);
    await editor.refresh();
    expect(state.rows).toHaveLength(100);
    expect(mock.queries).toHaveLength(4);
    await editor.loadMore();
    expect(state.rows).toHaveLength(200);
    expect(mock.queries).toHaveLength(6);
    expect(mock.queries[4]!.page.cursor).not.toBe(mock.queries[5]!.page.cursor);
    editor.edit(birthIdV1(1), '20');
    await editor.loadMore();
    await editor.refresh();
    expect(mock.queries).toHaveLength(6);
    expect(state.rows[0]!.year).toBe('20');
    editor.restore(birthIdV1(1));
    for (let page = 3; page <= 11; page++) {
      await editor.loadMore();
      expect(state.rows).toHaveLength(Math.min(page * 100, 1005));
      expect(mock.queries).toHaveLength((page + 1) * 2);
    }
    expect(state.next).toBeNull();
    expect(state.rows.map((row) => row.record.account.accountId)).toEqual(
      Array.from({ length: 1005 }, (_, index) => birthIdV1(index + 1)),
    );
    expect(mock.queries.every((query) => query.page.limit === 100)).toBe(true);
    expect(mock.writes).toHaveLength(0);
  } finally {
    editor.clear();
  }
});
