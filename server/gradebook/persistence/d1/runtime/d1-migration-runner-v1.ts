import { GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS } from '../schema/migrations';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';
import {
  requireGradebookD1RuntimeAuthorizationV1,
  type GradebookD1RuntimeAuthorizationV1,
} from './d1-runtime-authorization-v1';

export type GradebookD1MigrationErrorCodeV1 =
  | 'migration-catalog-incompatible'
  | 'migration-read-failed'
  | 'migration-apply-failed';

const ERROR_MESSAGES: Record<GradebookD1MigrationErrorCodeV1, string> = {
  'migration-catalog-incompatible': 'O catálogo de migrations acadêmicas é incompatível.',
  'migration-read-failed': 'Não foi possível conferir o schema acadêmico.',
  'migration-apply-failed': 'Não foi possível aplicar o schema acadêmico.',
};

export class GradebookD1MigrationErrorV1 extends Error {
  readonly code: GradebookD1MigrationErrorCodeV1;

  constructor(code: GradebookD1MigrationErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1MigrationErrorV1';
    this.code = code;
  }
}

export interface GradebookD1MigrationStatusV1 {
  readonly status: 'pending' | 'ready';
  readonly currentVersion: number;
  readonly latestVersion: number;
  readonly appliedCount: number;
  readonly pendingCount: number;
}

export interface GradebookD1MigrationRunResultV1 extends GradebookD1MigrationStatusV1 {
  readonly result: 'applied' | 'up-to-date';
  readonly migrationsApplied: number;
}

export interface GradebookD1MigrationRunnerOptionsV1 {
  readonly migrationSql?: readonly string[];
}

type MigrationCatalogEntryV1 = (typeof GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS)[number] & {
  readonly sql: string;
};

type MigrationRowV1 = Record<string, unknown>;

const REGISTRATION_PATTERN =
  /INSERT\s+OR\s+IGNORE\s+INTO\s+gradebook_schema_migrations\s*\(\s*version\s*,\s*name\s*,\s*applied_at\s*\)\s*VALUES\s*\(\s*(\d+)\s*,\s*'([^']+)'\s*,/giu;

function fail(code: GradebookD1MigrationErrorCodeV1): never {
  throw new GradebookD1MigrationErrorV1(code);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function validateCanonicalCatalog(migrationSql: readonly string[]): readonly MigrationCatalogEntryV1[] {
  const catalog = GRADEBOOK_D1_READ_ADAPTER_MIGRATIONS;
  if (migrationSql.length !== catalog.length) {
    return fail('migration-catalog-incompatible');
  }

  const names = new Set<string>();
  const fileNames = new Set<string>();

  return catalog.map((migration, index) => {
    if (
      migration.version !== index + 1 ||
      !nonEmptyString(migration.name) ||
      !nonEmptyString(migration.fileName) ||
      names.has(migration.name) ||
      fileNames.has(migration.fileName)
    ) {
      return fail('migration-catalog-incompatible');
    }
    names.add(migration.name);
    fileNames.add(migration.fileName);

    const sql = migrationSql[index];
    if (!nonEmptyString(sql)) return fail('migration-catalog-incompatible');
    const registrations = [...sql.matchAll(REGISTRATION_PATTERN)];
    if (registrations.length !== 1) return fail('migration-catalog-incompatible');

    const registeredVersion = Number.parseInt(registrations[0]?.[1] ?? '', 10);
    const registeredName = registrations[0]?.[2];
    if (registeredVersion !== migration.version || registeredName !== migration.name) {
      return fail('migration-catalog-incompatible');
    }

    return { ...migration, sql };
  });
}

async function loadDefaultMigrationSql(): Promise<readonly string[]> {
  try {
    const source = await import('./d1-migration-sql-v1');
    return source.GRADEBOOK_D1_MIGRATION_SQL_V1;
  } catch {
    return fail('migration-catalog-incompatible');
  }
}

export class GradebookD1MigrationRunnerV1 {
  constructor(
    private readonly database: D1WriteDatabaseV1,
    private readonly options: GradebookD1MigrationRunnerOptionsV1 = {},
  ) {}

  private async catalog(): Promise<readonly MigrationCatalogEntryV1[]> {
    const migrationSql = this.options.migrationSql ?? (await loadDefaultMigrationSql());
    return validateCanonicalCatalog(migrationSql);
  }

  private async readApplied(
    catalog: readonly MigrationCatalogEntryV1[],
  ): Promise<readonly { readonly version: number; readonly name: string }[]> {
    try {
      const registry = await this.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .bind('gradebook_schema_migrations')
        .first<MigrationRowV1>();
      if (!registry) return [];

      const result = await this.database
        .prepare('SELECT version, name FROM gradebook_schema_migrations ORDER BY version')
        .all<MigrationRowV1>();
      if (!Array.isArray(result.results) || result.results.length > catalog.length) {
        return fail('migration-catalog-incompatible');
      }

      return result.results.map((row, index) => {
        const version = row.version;
        const name = row.name;
        const expected = catalog[index];
        if (
          !positiveInteger(version) ||
          !nonEmptyString(name) ||
          expected === undefined ||
          version !== expected.version ||
          name !== expected.name
        ) {
          return fail('migration-catalog-incompatible');
        }
        return { version, name };
      });
    } catch (cause) {
      if (cause instanceof GradebookD1MigrationErrorV1) throw cause;
      return fail('migration-read-failed');
    }
  }

  private async inspectAuthorized(): Promise<GradebookD1MigrationStatusV1> {
    const catalog = await this.catalog();
    const applied = await this.readApplied(catalog);
    const currentVersion = applied.at(-1)?.version ?? 0;
    const latestVersion = catalog.at(-1)?.version ?? 0;
    const pendingCount = catalog.length - applied.length;
    return {
      status: pendingCount === 0 ? 'ready' : 'pending',
      currentVersion,
      latestVersion,
      appliedCount: applied.length,
      pendingCount,
    };
  }

  async inspect(
    authorization: GradebookD1RuntimeAuthorizationV1,
  ): Promise<GradebookD1MigrationStatusV1> {
    requireGradebookD1RuntimeAuthorizationV1(authorization);
    return this.inspectAuthorized();
  }

  async run(
    authorization: GradebookD1RuntimeAuthorizationV1,
  ): Promise<GradebookD1MigrationRunResultV1> {
    requireGradebookD1RuntimeAuthorizationV1(authorization);
    const catalog = await this.catalog();
    const initialApplied = await this.readApplied(catalog);

    if (initialApplied.length === catalog.length) {
      const currentVersion = initialApplied.at(-1)?.version ?? 0;
      return {
        result: 'up-to-date',
        status: 'ready',
        currentVersion,
        latestVersion: currentVersion,
        appliedCount: initialApplied.length,
        pendingCount: 0,
        migrationsApplied: 0,
      };
    }

    for (let index = initialApplied.length; index < catalog.length; index += 1) {
      const migration = catalog[index];
      if (!migration) return fail('migration-catalog-incompatible');

      try {
        await this.database.exec(migration.sql);
      } catch {
        return fail('migration-apply-failed');
      }

      const applied = await this.readApplied(catalog);
      if (applied.length < index + 1) return fail('migration-catalog-incompatible');
    }

    const finalStatus = await this.inspectAuthorized();
    if (finalStatus.status !== 'ready') return fail('migration-catalog-incompatible');

    return {
      ...finalStatus,
      result: 'applied',
      migrationsApplied: finalStatus.appliedCount - initialApplied.length,
    };
  }
}
