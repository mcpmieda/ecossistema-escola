import type { RuntimeEnv, RuntimeEnvironment } from '../../../../env';
import type { PerformanceComparisonConfigurationV1 } from '../../../../../shared/gradebook-contracts/performance/performance-comparison-contract-v2';
import {
  createAuditWorkspaceV1,
  type AuditWorkspaceServerContextV1,
  type AuditWorkspaceV1,
  type ExistingImportChangePlanSourceV1,
} from '../../../application/audit-workspace/audit-workspace-v1';
import {
  createDeterministicCorrectionWorkspaceV2,
  createLocalDeterministicCorrectionCaseStoreV2,
  type DeterministicCorrectionCaseStoreV2,
  type DeterministicCorrectionServerContextV2,
  type DeterministicCorrectionWorkspaceV2,
} from '../../../application/audit-workspace/deterministic-correction-v2';
import type { BulletinSnapshotRepositoryV1 } from '../../../application/bulletins/bulletin-snapshot-repository-v1';
import {
  createCouncilInstitutionalWorkspaceV2,
  type CouncilInstitutionalServerContextV2,
  type CouncilInstitutionalWorkspaceV2,
} from '../../../application/council/council-institutional-workspace-v2';
import type { CouncilDecisionStoreV1 } from '../../../application/council/council-decision-store-v1';
import {
  createLocalCouncilSessionStoreV2,
  type CouncilSessionStoreV2,
} from '../../../application/council/council-session-store-v2';
import type { CouncilWorkspaceSourceV1 } from '../../../application/council/council-workspace-source-v1';
import {
  createCouncilWorkspaceV1,
  type CouncilWorkspaceServerContextV1,
  type CouncilWorkspaceV1,
} from '../../../application/council/council-workspace-v1';
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
import {
  createClassPerformanceReadModelV1,
  type ClassPerformanceReadModelProviderV1,
} from '../../../application/read-models/performance/class-performance-read-model-v1';
import type { PersistenceUnitOfWorkV1 } from '../../../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';
import { GradebookD1AuditWorkspaceSourceV1 } from '../audit-workspace/d1-audit-workspace-source-v1';
import { createGradebookD1PersistenceUnitOfWorkV1 } from '../composition/d1-persistence-unit-of-work-v1';
import { createGradebookD1CouncilOfficialProjectionSourceV1 } from '../council/d1-council-official-projection-source-v1';
import {
  createGradebookD1BulletinCouncilDurabilityV1,
  type GradebookD1BulletinCouncilDurabilityV1,
} from '../durability/d1-bulletin-council-durability-v1';
import {
  createOperationalWorkspaceAcademicYearCatalogV1,
  type OperationalWorkspaceAcademicYearCatalogV1,
} from '../operational-workspace/academic-year-catalog-v1';
import { createGradebookD1ClassPerformanceSourceV1 } from '../performance/d1-class-performance-source-v1';
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

export type GradebookD1RuntimeEnvironmentV1 = RuntimeEnvironment;

export interface GradebookD1RuntimeOptionsV1 extends GradebookD1MigrationRunnerOptionsV1 {
  readonly now?: () => string;
  readonly performanceComparisonConfiguration?: PerformanceComparisonConfigurationV1;
}

const councilSessionStores = new WeakMap<object, CouncilSessionStoreV2>();
const deterministicCorrectionStores = new WeakMap<object, DeterministicCorrectionCaseStoreV2>();

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
  if (environment === 'production') {
    if (env.GRADEBOOK_PRODUCTION_ENABLED !== 'true') {
      return fail('runtime-environment-disabled');
    }
    return environment;
  }
  if (environment !== 'local' && environment !== 'preview') {
    return fail('runtime-environment-disabled');
  }
  return environment;
}

function councilSessionStore(database: D1WriteDatabaseV1): CouncilSessionStoreV2 {
  const key = database as unknown as object;
  const existing = councilSessionStores.get(key);
  if (existing !== undefined) return existing;
  const created = createLocalCouncilSessionStoreV2();
  councilSessionStores.set(key, created);
  return created;
}

function deterministicCorrectionStore(
  database: D1WriteDatabaseV1,
  now?: () => string,
): DeterministicCorrectionCaseStoreV2 {
  const key = database as unknown as object;
  const existing = deterministicCorrectionStores.get(key);
  if (existing !== undefined) return existing;
  const created = createLocalDeterministicCorrectionCaseStoreV2(now);
  deterministicCorrectionStores.set(key, created);
  return created;
}

export class GradebookD1RuntimeV1 {
  constructor(
    readonly environment: GradebookD1RuntimeEnvironmentV1,
    private readonly authorization: GradebookD1RuntimeAuthorizationV1,
    private readonly unitOfWork: PersistenceUnitOfWorkV1,
    private readonly readModels: GradebookOperationalReadModelsV1,
    private readonly operationalAcademicYears: OperationalWorkspaceAcademicYearCatalogV1,
    private readonly auditWorkspaceSource: GradebookD1AuditWorkspaceSourceV1,
    private readonly deterministicCorrections: DeterministicCorrectionCaseStoreV2,
    private readonly performanceReadModel: ClassPerformanceReadModelProviderV1,
    private readonly councilWorkspaceSource: CouncilWorkspaceSourceV1,
    private readonly durability: GradebookD1BulletinCouncilDurabilityV1,
    private readonly councilSessions: CouncilSessionStoreV2,
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

  operationalWorkspaceAcademicYears(): OperationalWorkspaceAcademicYearCatalogV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.operationalAcademicYears;
  }

  auditWorkspace(
    server: Pick<AuditWorkspaceServerContextV1, 'resolutionIdentity'>,
    existingPlans?: ExistingImportChangePlanSourceV1,
  ): AuditWorkspaceV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return createAuditWorkspaceV1({
      source: this.auditWorkspaceSource,
      imports: this.unitOfWork.imports,
      audit: this.unitOfWork.audit,
      server: {
        isAuthorized: () => {
          requireGradebookD1RuntimeAuthorizationV1(this.authorization);
          return true;
        },
        resolutionIdentity: () => server.resolutionIdentity(),
      },
      ...(existingPlans === undefined ? {} : { existingPlans }),
    });
  }

  deterministicCorrectionWorkspace(
    server: Pick<DeterministicCorrectionServerContextV2, 'correctionIdentity'>,
  ): DeterministicCorrectionWorkspaceV2 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return createDeterministicCorrectionWorkspaceV2({
      store: this.deterministicCorrections,
      audit: this.unitOfWork.audit,
      planningRepositories: this.planningRepositories(),
      transaction: this.transaction,
      server: {
        isAuthorized: () => {
          requireGradebookD1RuntimeAuthorizationV1(this.authorization);
          return true;
        },
        correctionIdentity: () => server.correctionIdentity(),
      },
    });
  }

  classPerformanceReadModel(): ClassPerformanceReadModelProviderV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.performanceReadModel;
  }

  bulletinSnapshotRepository(): BulletinSnapshotRepositoryV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.durability.bulletinSnapshots;
  }

  councilDecisionStore(): CouncilDecisionStoreV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return this.durability.councilDecisions;
  }

  councilWorkspace(
    server: Pick<CouncilWorkspaceServerContextV1, 'decisionIdentity'>,
  ): CouncilWorkspaceV1 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    return createCouncilWorkspaceV1({
      source: this.councilWorkspaceSource,
      decisions: this.durability.councilDecisions,
      server: {
        isAuthorized: () => {
          requireGradebookD1RuntimeAuthorizationV1(this.authorization);
          return true;
        },
        decisionIdentity: () => server.decisionIdentity(),
      },
    });
  }

  councilInstitutionalWorkspace(
    server: CouncilInstitutionalServerContextV2,
  ): CouncilInstitutionalWorkspaceV2 {
    requireGradebookD1RuntimeAuthorizationV1(this.authorization);
    const workspace = this.councilWorkspace(server);
    return createCouncilInstitutionalWorkspaceV2({
      source: this.councilWorkspaceSource,
      decisions: this.durability.councilDecisions,
      workspace,
      sessions: this.councilSessions,
      server: {
        isAuthorized: () => {
          requireGradebookD1RuntimeAuthorizationV1(this.authorization);
          return true;
        },
        decisionIdentity: () => server.decisionIdentity(),
        institutionalIdentity: () => server.institutionalIdentity(),
      },
    });
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
  const operationalAcademicYears = createOperationalWorkspaceAcademicYearCatalogV1(database);
  const auditWorkspaceSource = new GradebookD1AuditWorkspaceSourceV1(database);
  const deterministicCorrections = deterministicCorrectionStore(database, options.now);
  const performanceReadModel = createClassPerformanceReadModelV1(
    createGradebookD1ClassPerformanceSourceV1(database, {
      ...(options.performanceComparisonConfiguration === undefined
        ? {}
        : { comparisonConfiguration: options.performanceComparisonConfiguration }),
    }),
  );
  const councilWorkspaceSource = createGradebookD1CouncilOfficialProjectionSourceV1(database);
  const durability = createGradebookD1BulletinCouncilDurabilityV1(database);
  const sessions = councilSessionStore(database);
  const transaction = new GradebookD1BatchPromotionTransactionV1(database, { now: options.now });
  const migrations = new GradebookD1MigrationRunnerV1(database, {
    migrationSql: options.migrationSql,
  });
  return new GradebookD1RuntimeV1(
    environment,
    authorization,
    unitOfWork,
    readModels,
    operationalAcademicYears,
    auditWorkspaceSource,
    deterministicCorrections,
    performanceReadModel,
    councilWorkspaceSource,
    durability,
    sessions,
    transaction,
    migrations,
  );
}
