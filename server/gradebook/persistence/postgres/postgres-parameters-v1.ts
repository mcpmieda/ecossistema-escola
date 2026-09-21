import type { GradebookPostgresScalarV1 } from './postgres-database-v1';

/** Assign the placeholder and its bound value together, including optional SQL clauses. */
export function createGradebookPostgresParametersV1() {
  const values: GradebookPostgresScalarV1[] = [];
  return {
    values,
    param(value: GradebookPostgresScalarV1): string {
      values.push(value);
      return `$${String(values.length)}`;
    },
  };
}
