import { z } from 'zod';

const pagination = {
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const turmasListQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  attention: z.enum(['needs_attention', 'normal']).optional(),
  ...pagination,
});

export const alunosListQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  relationship: z.enum(['related', 'unrelated']).optional(),
  snapshots: z.enum(['present', 'none']).optional(),
  ...pagination,
});

export type TurmasListQuery = z.infer<typeof turmasListQuerySchema>;
export type AlunosListQuery = z.infer<typeof alunosListQuerySchema>;

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type TurmaListItem = {
  id: string;
  name: string;
  status: string;
  schoolYearId: string;
  schoolYear: number;
  schoolYearName: string;
  students: number;
  components: number;
  teachers: number;
  mappedFields: number;
  models: number;
  connectedModels: number;
  openFindings: number;
  attentionLevel: 'normal' | 'warning' | 'error';
  attentionReasons: string[];
  lastUpdatedAt: string | null;
};

export type AlunoListItem = {
  id: string;
  displayName: string;
  externalId: string | null;
  status: string;
  classGroups: number;
  schoolYears: number;
  mappedFields: number;
  snapshots: number;
  lastUpdatedAt: string | null;
};

export type TurmaDetail = {
  classGroup: Pick<
    TurmaListItem,
    'id' | 'name' | 'status' | 'schoolYearId' | 'schoolYear' | 'schoolYearName'
  >;
  students: Array<{
    id: string;
    displayName: string;
    status: string;
    components: string[];
    teachers: string[];
    mappedFields: number;
    presentValues: number;
    absentValues: number;
    numericZeroValues: number;
    lastUpdatedAt: string | null;
  }>;
  assignments: Array<{
    teacherId: string;
    teacherName: string;
    componentName: string;
    assignmentStatus: string;
    modelState: string | null;
    modelSyncEnabled: boolean;
    sourceName: string | null;
    sourceAuthority: string | null;
  }>;
  findings: Array<{
    severity: 'info' | 'warning' | 'error';
    code: string;
    status: 'open' | 'resolved';
    occurredAt: string;
  }>;
  lastUpdatedAt: string | null;
};

export type AlunoDetail = {
  student: { id: string; displayName: string; externalId: string | null; status: string };
  contexts: Array<{
    classGroupId: string;
    classGroupName: string;
    schoolYearId: string;
    schoolYear: number;
    schoolYearName: string;
    components: string[];
    teachers: string[];
    mappedFields: number;
    presentValues: number;
    absentValues: number;
    numericZeroValues: number;
    openFindings: number;
    lastUpdatedAt: string | null;
    snapshots: Array<{
      componentName: string;
      field: string;
      valueNumeric: number | null;
      valueText: string | null;
      isAbsent: boolean;
      sourceName: string;
      updatedAt: string;
    }>;
  }>;
};

export type TurmasAlunosFilters = {
  schoolYears: Array<{ id: string; label: string }>;
  classGroups: Array<{ id: string; label: string; schoolYearId: string }>;
  teachers: Array<{ id: string; label: string }>;
  components: Array<{ id: string; label: string; schoolYearId: string }>;
};

export interface TurmasAlunosRepository {
  filters(): Promise<TurmasAlunosFilters>;
  listTurmas(query: TurmasListQuery): Promise<PageResult<TurmaListItem>>;
  turmaDetail(classGroupId: string): Promise<TurmaDetail | null>;
  listAlunos(query: AlunosListQuery): Promise<PageResult<AlunoListItem>>;
  alunoDetail(studentId: string): Promise<AlunoDetail | null>;
}
