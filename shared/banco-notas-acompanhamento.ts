import { z } from 'zod';

export const acompanhamentoModelStateSchema = z.enum([
  'draft',
  'validated',
  'ready_to_share',
  'shared',
  'connected',
  'suspended',
  'archived',
]);

export const acompanhamentoListQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  classGroupId: z.string().uuid().optional(),
  teacherId: z.string().uuid().optional(),
  modelState: z.union([acompanhamentoModelStateSchema, z.literal('missing')]).optional(),
  sync: z.enum(['enabled', 'disabled']).optional(),
  attention: z.enum(['needs_attention', 'normal']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AcompanhamentoListQuery = z.infer<typeof acompanhamentoListQuerySchema>;
export type AttentionLevel = 'normal' | 'info' | 'warning' | 'error';

export type AcompanhamentoSummary = {
  classGroups: number;
  trackedItems: number;
  teachers: number;
  models: number;
  connectedModels: number;
  syncEnabled: number;
  openFindings: number;
  needsAttention: number;
  modelStates: Array<{ state: string; total: number }>;
  filters: {
    schoolYears: Array<{ id: string; label: string }>;
    classGroups: Array<{ id: string; label: string; schoolYearId: string }>;
    teachers: Array<{ id: string; label: string }>;
  };
  recentActivity: Array<{
    kind: 'model' | 'import' | 'reconciliation';
    label: string;
    status: string;
    occurredAt: string;
  }>;
};

export type AcompanhamentoListItem = {
  classGroupId: string;
  classGroupName: string;
  schoolYearId: string;
  schoolYear: number;
  schoolYearName: string;
  teacherId: string;
  teacherName: string;
  components: string[];
  modelState: string | null;
  sourceName: string | null;
  sourceType: string | null;
  syncEnabled: boolean;
  openFindings: number;
  lastActivityAt: string | null;
  attentionLevel: AttentionLevel;
  attentionReasons: string[];
};

export type AcompanhamentoListResult = {
  items: AcompanhamentoListItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type AcompanhamentoStudent = {
  id: string;
  displayName: string;
  fieldsAvailable: number;
  presentValues: number;
  absentValues: number;
  numericZeroValues: number;
  lastUpdatedAt: string | null;
};

export type AcompanhamentoDetail = {
  classGroup: {
    id: string;
    name: string;
    status: string;
    schoolYearId: string;
    schoolYear: number;
    schoolYearName: string;
  };
  assignments: Array<{
    teacherId: string;
    teacherName: string;
    componentName: string;
    assignmentStatus: string;
    modelState: string | null;
    modelSyncEnabled: boolean;
    sourceName: string | null;
    sourceType: string | null;
    sourceAuthority: string | null;
    lastReconciledAt: string | null;
    lastActivityAt: string | null;
  }>;
  students: AcompanhamentoStudent[];
  findings: Array<{
    severity: 'info' | 'warning' | 'error';
    code: string;
    status: 'open' | 'resolved';
    importState: string;
    occurredAt: string;
  }>;
  notes: {
    snapshots: number;
    presentValues: number;
    absentValues: number;
    numericZeroValues: number;
    lastUpdatedAt: string | null;
  };
};

export interface AcompanhamentoRepository {
  summary(): Promise<AcompanhamentoSummary>;
  list(query: AcompanhamentoListQuery): Promise<AcompanhamentoListResult>;
  detail(classGroupId: string): Promise<AcompanhamentoDetail | null>;
}
