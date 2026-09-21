import type { D1WriteValueV1 } from '../d1/write/d1-write-adapter-v1';

/** Assign the placeholder and its bound value together, including optional SQL clauses. */
export function createGradebookPostgresParametersV1() {
  const values: D1WriteValueV1[] = [];
  return {
    values,
    param(value: D1WriteValueV1): string {
      values.push(value);
      return `$${String(values.length)}`;
    },
  };
}
