import type { GradebookImportFailureOperationV1 } from '../../../../../shared/gradebook-import-diagnostics-v1';
import type {
  D1WriteDatabaseV1,
  D1WriteRunResultV1,
  D1WriteStatementV1,
  D1WriteValueV1,
} from '../write/d1-write-adapter-v1';

const RETRYABLE_D1_TRANSIENT_PATTERNS_V1 = [
  /network connection lost/iu,
  /d1 db reset because its code was updated/iu,
  /internal error while starting up d1 db storage caused object to be reset/iu,
  /internal error in d1 db storage caused object to be reset/iu,
  /cannot resolve d1 db due to transient issue on remote node/iu,
  /replica disconnected from primary/iu,
] as const;

function causeText(cause: unknown, depth = 0): string {
  if (depth > 2) return '';
  if (cause instanceof Error) {
    const nested = 'cause' in cause ? causeText(cause.cause, depth + 1) : '';
    return `${cause.name} ${cause.message} ${nested}`;
  }
  return typeof cause === 'string' ? cause : '';
}

export function isGradebookD1RetryableTransientErrorV1(cause: unknown): boolean {
  const message = causeText(cause);
  return RETRYABLE_D1_TRANSIENT_PATTERNS_V1.some((pattern) => pattern.test(message));
}

class ObservedD1WriteStatementV1 implements D1WriteStatementV1 {
  constructor(
    readonly inner: D1WriteStatementV1,
    private readonly observe: (
      operation: Exclude<GradebookImportFailureOperationV1, 'none'>,
      cause: unknown,
    ) => void,
  ) {}

  bind(...values: D1WriteValueV1[]): D1WriteStatementV1 {
    try {
      return new ObservedD1WriteStatementV1(this.inner.bind(...values), this.observe);
    } catch (cause) {
      this.observe('bind', cause);
      throw cause;
    }
  }

  async first<Row extends Record<string, unknown>>(): Promise<Row | null> {
    try {
      return await this.inner.first<Row>();
    } catch (cause) {
      this.observe('first', cause);
      throw cause;
    }
  }

  async all<Row extends Record<string, unknown>>(): Promise<{ readonly results: readonly Row[] }> {
    try {
      return await this.inner.all<Row>();
    } catch (cause) {
      this.observe('all', cause);
      throw cause;
    }
  }

  async run(): Promise<D1WriteRunResultV1> {
    try {
      return await this.inner.run();
    } catch (cause) {
      this.observe('run', cause);
      throw cause;
    }
  }
}

export function observeGradebookD1RetryableTransientsV1(
  base: D1WriteDatabaseV1,
  onFailure?: (
    operation: Exclude<GradebookImportFailureOperationV1, 'none'>,
    cause: unknown,
  ) => void,
): {
  readonly database: D1WriteDatabaseV1;
  readonly retryableTransientObserved: () => boolean;
} {
  let observed = false;
  const observe = (
    operation: Exclude<GradebookImportFailureOperationV1, 'none'>,
    cause: unknown,
  ): void => {
    if (
      operation !== 'prepare' &&
      operation !== 'bind' &&
      isGradebookD1RetryableTransientErrorV1(cause)
    )
      observed = true;
    try {
      onFailure?.(operation, cause);
    } catch {
      /* Observability cannot change retries or writes. */
    }
  };
  const wrap = (statement: D1WriteStatementV1): D1WriteStatementV1 =>
    new ObservedD1WriteStatementV1(statement, observe);

  const database: D1WriteDatabaseV1 = {
    prepare(query) {
      try {
        return wrap(base.prepare(query));
      } catch (cause) {
        observe('prepare', cause);
        throw cause;
      }
    },
    async exec(query) {
      try {
        return await base.exec(query);
      } catch (cause) {
        observe('exec', cause);
        throw cause;
      }
    },
    ...(base.batch
      ? {
          async batch(statements: readonly D1WriteStatementV1[]) {
            const rawStatements = statements.map((statement) =>
              statement instanceof ObservedD1WriteStatementV1 ? statement.inner : statement,
            );
            try {
              return await base.batch!(rawStatements);
            } catch (cause) {
              observe('batch', cause);
              throw cause;
            }
          },
        }
      : {}),
  };

  return {
    database,
    retryableTransientObserved: () => observed,
  };
}
