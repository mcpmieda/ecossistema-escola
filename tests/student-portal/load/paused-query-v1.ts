import type { StudentPortalPostgresSqlV1 } from '../../../server/student-portal/persistence/postgres-persistence-v1';

/** Hold a real transaction after a chosen query, without replacing SQL or its result. */
export function pausedPortalQueryV1(
  source: StudentPortalPostgresSqlV1,
  matches: (query: string) => boolean,
) {
  let release!: () => void;
  let entered!: () => void;
  let paused = false;
  const resumed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reached = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const sql: StudentPortalPostgresSqlV1 = {
    unsafe: (query, parameters) => source.unsafe(query, parameters),
    begin: (operation) =>
      source.begin((tx) =>
        operation({
          unsafe: async <Row extends Record<string, unknown>>(
            query: string,
            parameters?: readonly unknown[],
          ) => {
            const result = await tx.unsafe<Row>(query, parameters);
            if (!paused && matches(query)) {
              paused = true;
              entered();
              await resumed;
            }
            return result;
          },
        }),
      ),
  };
  return {
    sql,
    release,
    entered: (task: Promise<unknown>) =>
      Promise.race([
        reached,
        task.then(() => {
          throw new Error('Synthetic transaction finished before its pause');
        }),
      ]),
  };
}
