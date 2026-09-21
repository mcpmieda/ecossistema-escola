import type { AcademicYearId } from '../../../../../shared/gradebook-contracts/entities';
import type { OperationalWorkspaceAcademicYearOptionV1 } from '../../../../../shared/gradebook-contracts/operational-workspace/operational-workspace-contract-v1';
import type { D1ReadDatabaseV1 } from '../read/d1-read-adapter-v1';

export type OperationalWorkspaceAcademicYearCatalogErrorCodeV1 =
  | 'database-read-failed'
  | 'incompatible-row';

const ERROR_MESSAGES: Record<OperationalWorkspaceAcademicYearCatalogErrorCodeV1, string> = {
  'database-read-failed': 'Não foi possível consultar os anos acadêmicos disponíveis.',
  'incompatible-row': 'O catálogo de anos acadêmicos possui dados incompatíveis.',
};

export class OperationalWorkspaceAcademicYearCatalogErrorV1 extends Error {
  readonly code: OperationalWorkspaceAcademicYearCatalogErrorCodeV1;

  constructor(code: OperationalWorkspaceAcademicYearCatalogErrorCodeV1) {
    super(ERROR_MESSAGES[code]);
    this.name = 'OperationalWorkspaceAcademicYearCatalogErrorV1';
    this.code = code;
  }
}

export interface OperationalWorkspaceAcademicYearCatalogV1 {
  list(): Promise<readonly OperationalWorkspaceAcademicYearOptionV1[]>;
}

interface AcademicYearCatalogRowV1 extends Record<string, unknown> {
  readonly academic_year_id: unknown;
  readonly year: unknown;
}

function fail(code: OperationalWorkspaceAcademicYearCatalogErrorCodeV1): never {
  throw new OperationalWorkspaceAcademicYearCatalogErrorV1(code);
}

function asOption(row: AcademicYearCatalogRowV1): OperationalWorkspaceAcademicYearOptionV1 {
  if (
    typeof row.academic_year_id !== 'string' ||
    row.academic_year_id.trim().length === 0 ||
    typeof row.year !== 'number' ||
    !Number.isInteger(row.year) ||
    row.year < 2000 ||
    row.year > 9999
  ) {
    return fail('incompatible-row');
  }

  return {
    id: row.academic_year_id as AcademicYearId,
    label: String(row.year),
  };
}

export function createOperationalWorkspaceAcademicYearCatalogV1(
  database: D1ReadDatabaseV1,
): OperationalWorkspaceAcademicYearCatalogV1 {
  return {
    async list() {
      let rows: readonly AcademicYearCatalogRowV1[];
      try {
        const result = await database
          .prepare(
            `SELECT academic_year_id, year
             FROM academic_years
             ORDER BY year DESC, academic_year_id ASC`,
          )
          .all<AcademicYearCatalogRowV1>();
        if (!Array.isArray(result.results)) return fail('incompatible-row');
        rows = result.results;
      } catch (cause) {
        if (cause instanceof OperationalWorkspaceAcademicYearCatalogErrorV1) throw cause;
        return fail('database-read-failed');
      }

      const options = rows.map(asOption);
      const ids = new Set<string>();
      for (const option of options) {
        if (ids.has(option.id)) return fail('incompatible-row');
        ids.add(option.id);
      }
      return options;
    },
  };
}
