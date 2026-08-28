type Row = Record<string, string | number | null>;

export class BancoNotasAddinForbiddenError extends Error {
  readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'BancoNotasAddinForbiddenError';
  }
}

export class D1BancoNotasAddinAuthorizer {
  constructor(private readonly db: D1Database) {}

  async assertTeacherModelOwner(input: {
    teacherModelId: string;
    entraObjectId: string;
  }): Promise<void> {
    const row = await this.db
      .prepare(
        `SELECT
           teacher.status AS teacher_status,
           teacher.entra_object_id AS entra_object_id
         FROM teacher_models model
         JOIN teachers teacher ON teacher.id = model.teacher_id
         WHERE model.id = ?
         LIMIT 1`,
      )
      .bind(input.teacherModelId)
      .first<Row>();

    if (!row) throw new BancoNotasAddinForbiddenError('teacher_model_not_owned');
    if (row.teacher_status !== 'active') {
      throw new BancoNotasAddinForbiddenError('teacher_identity_inactive');
    }
    if (!row.entra_object_id) {
      throw new BancoNotasAddinForbiddenError('teacher_entra_identity_missing');
    }
    if (String(row.entra_object_id).toLowerCase() !== input.entraObjectId.toLowerCase()) {
      throw new BancoNotasAddinForbiddenError('teacher_model_not_owned');
    }
  }
}
