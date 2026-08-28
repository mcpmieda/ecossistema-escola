import { z } from 'zod';

export const pesquisaEntityTypeSchema = z.enum(['students', 'teachers', 'classGroups']);

const pesquisaTypesSchema = z
  .string()
  .trim()
  .transform((value, context) => {
    const values = [
      ...new Set(
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ];
    const parsed = z.array(pesquisaEntityTypeSchema).min(1).safeParse(values);
    if (!parsed.success) {
      context.addIssue({ code: 'custom', message: 'types contains an unsupported entity type' });
      return z.NEVER;
    }
    return parsed.data;
  });

export const pesquisaGlobalQuerySchema = z.object({
  q: z.string().trim().min(2).max(80),
  types: pesquisaTypesSchema.optional(),
  limitPerType: z.coerce.number().int().min(1).max(10).default(6),
  schoolYearId: z.string().uuid().optional(),
});

export type PesquisaEntityType = z.infer<typeof pesquisaEntityTypeSchema>;
export type PesquisaGlobalQuery = z.infer<typeof pesquisaGlobalQuerySchema>;

export type PesquisaBucket<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

export type PesquisaStudentItem = {
  id: string;
  displayName: string;
  classGroups: string[];
};

export type PesquisaTeacherItem = {
  id: string;
  displayName: string;
  components: string[];
  classGroups: string[];
};

export type PesquisaClassGroupItem = {
  id: string;
  name: string;
  schoolYearId: string;
  schoolYearName: string;
  components: string[];
  teachers: string[];
  acompanhamentoAvailable: boolean;
};

export type PesquisaGlobalResult = {
  query: string;
  normalizedQuery: string;
  limitPerType: number;
  results: {
    students: PesquisaBucket<PesquisaStudentItem>;
    teachers: PesquisaBucket<PesquisaTeacherItem>;
    classGroups: PesquisaBucket<PesquisaClassGroupItem>;
  };
};

export interface BancoNotasSearchRepository {
  search(query: PesquisaGlobalQuery): Promise<PesquisaGlobalResult>;
}
