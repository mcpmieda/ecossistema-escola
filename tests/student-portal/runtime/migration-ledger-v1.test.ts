import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('Student Portal migration ledger', () => {
  it('lists every repository migration exactly once and in order', () => {
    const directory = join(root, 'migrations/student-portal');
    const migrations = readdirSync(directory)
      .filter((name) => /^\d{4}_.+\.sql$/.test(name))
      .sort();
    const readme = readFileSync(join(directory, 'README.md'), 'utf8');

    for (const migration of migrations) {
      const token = '`' + migration + '`';
      expect(readme.split(token)).toHaveLength(2);
    }

    const ledgerOrder = Array.from(readme.matchAll(/\| `(\d{4}_[^`]+\.sql)` \|/g)).map(
      (match) => match[1],
    );
    expect(ledgerOrder).toEqual(migrations);
  });
});
