import { z } from 'zod';
import type { PageResult } from './banco-notas-turmas-alunos';

export const pendingSeveritySchema = z.enum(['error', 'warning', 'info']);
export const pendingStatusSchema = z.literal('open');
export const pendingKindSchema = z.enum([
  'import_error',
  'finding_error',
  'finding_warning',
  'finding_info',
  'model_suspended',
  'model_missing',
  'identity_missing',
  'source_missing',
  'inactive_teacher_assignment',
  'orphan_assignment',
  'model_without_assignment',
  'model_not_connected',
  'import_analysis_pending',
]);

export const pendenciasFilterQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  severity: pendingSeveritySchema.optional(),
  kind: pendingKindSchema.optional(),
  teacherId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  status: pendingStatusSchema.optional(),
  q: z.string().trim().max(80).optional(),
});

export const pendenciasListQuerySchema = pendenciasFilterQuerySchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const pendingIdSchema = z.string().trim().min(3).max(300);

export type PendingSeverity = z.infer<typeof pendingSeveritySchema>;
export type PendingStatus = z.infer<typeof pendingStatusSchema>;
export type PendingKind = z.infer<typeof pendingKindSchema>;
export type PendenciasFilterQuery = z.infer<typeof pendenciasFilterQuerySchema>;
export type PendenciasListQuery = z.infer<typeof pendenciasListQuerySchema>;

export type PendingContextRef = { id: string; label: string };
export type PendingContextLink = {
  kind: 'professor' | 'turma' | 'acompanhamento';
  label: string;
  href: string;
};

export type PendingItem = {
  id: string;
  kind: PendingKind;
  severity: PendingSeverity;
  status: PendingStatus;
  title: string;
  description: string;
  evidence: string;
  origin: string;
  schoolYear: PendingContextRef | null;
  teacher: PendingContextRef | null;
  classGroup: PendingContextRef | null;
  component: PendingContextRef | null;
  modelState: string | null;
  sourceName: string | null;
  createdAt: string;
  updatedAt: string;
  contextLinks: PendingContextLink[];
};

export type PendenciasSummary = {
  total: number;
  error: number;
  warning: number;
  info: number;
  byKind: Array<{ kind: PendingKind; total: number }>;
  filters: {
    schoolYears: Array<{ id: string; label: string }>;
    teachers: Array<{ id: string; label: string }>;
    classGroups: Array<{ id: string; label: string; schoolYearId: string }>;
    components: Array<{ id: string; label: string; schoolYearId: string }>;
  };
};

export interface PendenciasRepository {
  summary(query: PendenciasFilterQuery): Promise<PendenciasSummary>;
  list(query: PendenciasListQuery): Promise<PageResult<PendingItem>>;
  detail(id: string): Promise<PendingItem | null>;
}
