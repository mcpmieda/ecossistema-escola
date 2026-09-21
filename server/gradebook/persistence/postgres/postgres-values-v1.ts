export interface GradebookPostgresJsonTextV1 {
  readonly jsonText: string;
}

export type GradebookPostgresScalarV1 = string | number | null;
export type GradebookPostgresValueV1 = GradebookPostgresScalarV1 | GradebookPostgresJsonTextV1;

/** Serialized JSON is sent as PostgreSQL text for an explicit SQL ::jsonb cast. */
export function postgresJsonTextV1(jsonText: string): GradebookPostgresJsonTextV1 {
  return { jsonText };
}
