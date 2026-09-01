import type { RuntimeEnv, RuntimeEnvironment } from '../../../../env';
import type { ImportChangeExecutionResultV1 } from '../../../application/import/execution/execute-import-change-plan-v1';
import { executeImportChangePlan } from '../../../application/import/execution/execute-import-change-plan-v1';
import type {
  ImportChangePlanV1,
  ImportReconciliationRepositoriesV1,
} from '../../../application/import/import-reconciliation-v1';
import {
  createGradebookOperationalReadModelsV1,
  type GradebookOperationalReadModelsV1,
} from '../../../application/read-models/composition/operational-read-models-v1';
import type { PersistenceUnitOfWorkV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { createGradebookD1PersistenceUnitOfWorkV1 } from '../composition/d1-persistence-unit-of-work-v1';
import { GradebookD1BatchPromotionTransactionV1 } from '../transaction/d1-batch-promotion-transaction-v1';
import type { D1WriteDatabaseV1 } from '../write/d1-write-adapter-v1';
import {
  requireGradebookD1RuntimeAuthorizationV1,
  type GradebookD1RuntimeAuthorizationV1,
} from './d1-runtime-authorization-v1';
import {
  GradebookD1MigrationRunnerV1,
  type GradebookD1MigrationRunResultV1,
  type GradebookD1MigrationRunnerOptionsV1,
  type GradebookD1MigrationStatusV1,
} from './d1-migration-runner-v1';

export type GradebookD1RuntimeErrorCodeV1 =
  'runtime-environment-disabled' | 'runtime-storage-missing' | 'runtime-storage-incompatible';

const ERROR_MESSAGES: Record<GradebookD1RuntimeErrorCodeV1, string> = {
  'runtime-environment-disabled': 'A persistência acadêmica não está disponível neste ambiente.',
  'runtime-storage-missing': 'O runtime acadêmico não possui armazenamento injetado.',
  'runtime-storage-incompatible': 'O armazenamento acadêmico injetado é incompatível.',
};

export class GradebookD1RuntimeErrorV1 extends Error {
  readonly code: GradebookD1RuntimeErrorCodeV1;

  constructor(code: GradebookD1RuntimeErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'GradebookD1RuntimeErrorV1';
    this.code = code;
  }
}

export type GradebookD1RuntimeEnvironmentV1 = Extract<RuntimeEnvironment, 'local' | 'preview'>;

export interface GradebookD1RuntimeOptionsV1 extends GradebookD1MigrationRunnerOptionsV1 {
  readonly now?: () => string;
}

function fail(code: GradebookD1RuntimeErrorCodeV1): never {
  throw new GradebookD1RuntimeErrorV1(code);
}

function isObject(value: unknown): value is Record<PropertyKey, unknown> {
  return value !== null && typeof value === 'object';
}

function hasMethod<Key extends PropertyKey>(
  value: Record<PropertyKey, unknown>,
  key: Key,
): value is Record<PropertyKey, unknown> & Record<Key, (...args: unknown[]) => unknown> {
  return typeof Reflect.get(value, key) === 'function';
}

function requireDatabase(binding: unknown): D1WriteDatabaseV1 {
  if (binding === undefined || binding === null) return fail('runtime-storage-missing');
  if (!isObject(binding) || !hasMethod(binding, 'prepare') || !hasMethod(binding, 'exec')) {
    return fail('runtime-storage-incompatible');
  }

  let statement: unknown;
  try {
    statement = binding.prepare('SELECT 1 AS gradebook_runtime_probe');
  } catch {
    return fail('runtime-storage-incompatible');
  }

  if (
    !isObject(statement) ||
    !hasMethod(statement, 'bind') ||
    !hasMethod(statement, 'first') ||
    !hasMethod(statement, 'all') ||
    !hasMethod(statement, 'run')
  ) {
    return fail('runtime-storage-incompatible');
  }

  return binding as unknown as D1WriteDatabaseV1;
}

function runtimeEnvironment(env: RuntimeEnv): GradebookD1RuntimeEnvironmentV1 {
  const environment = env.RUNTIME_ENVIRONMENT ?? 'production';
  if (environment !== 'local' && environment !== 'preview') {
    return fail('runtime-environment-disabled');
  }
  return environment;
}

export class GradebookD1RuntimeV1 {
  constructor(
    readonly environment: GradebookD1RuntimeEnvironmentV1,
    private readonly authorization: GradebookD1RuntimeAuthorizationV1,
    private readonly unitOfWork: PersistenceUnitOfWorkV1,
    private readonly readModels: GradebookOperationalReadModelsV1,
    private readonly transaction: GradebookD1BatchPromotionTransactionV1,
    private readonly migrations: GradebookD1MigrationRunnerV1,
  ) {}

  planningRepositories(): ImportReconciliationRepositoriesV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return {
      imports: {
        findSourceFileByHash: this.unitOfWork.imports.findSourceFileByHash,
        getSourceFileVersion: this.unitOfWork.imports.getSourceFileVersion,
      },
      academicRecords: {
        getCurrent: this.unitOfWork.academicRecords.getCurrent,
      },
      logicalSourceRecords: {
        getCurrent: this.unitOfWork.logicalSourceRecords.getCurrent,
        listCurrentStreams: this.unitOfWork.logicalSourceRecords.listCurrentStreams,
      },
    };
  }

  persistenceUnitOfWork(): PersistenceUnitOfWorkV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.unitOfWork;
  }

  operationalReadModels(): GradebookOperationalReadModelsV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.readModels;
  }

  inspectSchema(): Promise<GradebookD1MigrationStatusV1> {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.migrations.inspect(this.authorization);
  }

  runMigrations(): Promise<GradebookD1MigrationRunResultV1> {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.migrations.run(this.authorization);
  }

  promoteImportChangePlan(plan: ImportChangePlanV1): Promise<ImportChangeExecutionResultV1> {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return executeImportChangePlan(plan, this.transaction);
  }
}

export function createGradebookD1RuntimeV1(
  env: RuntimeEnv,
  authorization: GradebookD1RuntimeAuthorizationV1,
  options: GradebookD1RuntimeOptionsV1 = {},
): GradebookD1RuntimeV1 {
  requireGradebookD1RuntimeAuthorizationV1(authorization);
  const environment = runtimeEnvironment(env);
  const database = requireDatabase(env.GRADEBOOK_D1);
  const unitOfWork = createGradebookD1PersistenceUnitOfWorkV1(database, {
    now: options.now,
  });
  const readModels = createGradebookOperationalReadModelsV1(unitOfWork);
  const transaction = new GradebookD1BatchPromotionTransactionV1(database, { now: options.now });
  const migrations = new GradebookD1MigrationRunnerV1(database, {
    migrationSql: options.migrationSql,
  });
  return new GradebookD1RuntimeV1(
    environment,
    authorization,
    unitOfWork,
    readModels,
    transaction,
    migrations,
  );
}
