import { z } from 'zod';
import type { AttentionLevel } from './banco-notas-acompanhamento';
import type { PageResult } from './banco-notas-turmas-alunos';

export const professorModelStateSchema = z.enum([
  'draft',
  'validated',
  'ready_to_share',
  'shared',
  'connected',
  'suspended',
  'archived',
]);

export const professoresListQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive']).optional(),
  classGroupId: z.string().uuid().optional(),
  componentId: z.string().uuid().optional(),
  identity: z.enum(['linked', 'missing']).optional(),
  modelState: z.union([professorModelStateSchema, z.literal('missing')]).optional(),
  assignment: z.enum(['with', 'without']).optional(),
  attention: z.enum(['needs_attention', 'normal']).optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const professorDetailQuerySchema = z.object({
  schoolYearId: z.string().uuid().optional(),
});

export type ProfessoresListQuery = z.infer<typeof professoresListQuerySchema>;
export type ProfessorDetailQuery = z.infer<typeof professorDetailQuerySchema>;
export type IdentityState = 'linked' | 'missing';

export type ProfessorListItem = {
  id: string;
  displayName: string;
  status: string;
  identityState: IdentityState;
  classGroups: number;
  components: number;
  assignments: number;
  models: number;
  connectedModels: number;
  modelStates: string[];
  openFindings: number;
  attentionLevel: AttentionLevel;
  attentionReasons: string[];
  lastActivityAt: string | null;
};

export type ProfessoresDiagnostics = {
  orphanAssignments: number;
  modelsWithoutAssignments: number;
  inactiveTeachersWithActiveAssignments: number;
  assignmentsWithoutSource: number;
};

export type ProfessoresFilters = {
  schoolYears: Array<{ id: string; label: string }>;
  classGroups: Array<{ id: string; label: string; schoolYearId: string }>;
  components: Array<{ id: string; label: string; schoolYearId: string }>;
  diagnostics: ProfessoresDiagnostics;
};

export type ProfessorAssignmentContext = {
  assignmentId: string;
  schoolYearId: string;
  schoolYear: number;
  schoolYearName: string;
  classGroupId: string;
  classGroupName: string;
  componentId: string;
  componentName: string;
  assignmentStatus: string;
  modelState: string | null;
  modelVersion: number | null;
  modelSyncEnabled: boolean;
  sourceName: string | null;
  sourceAuthority: string | null;
  lastActivityAt: string | null;
};

export type ProfessorModel = {
  schoolYearId: string;
  schoolYearName: string;
  state: string;
  currentVersion: number | null;
  fileAvailable: boolean;
  syncEnabled: boolean;
  lastReconciledAt: string | null;
  lastActivityAt: string | null;
  assignments: number;
  openFindings: number;
};

export type ProfessorPending = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  context: string;
  status: 'open';
  schoolYearId: string | null;
  classGroupId: string | null;
  classGroupName: string | null;
  componentName: string | null;
  occurredAt: string | null;
};

export type ProfessorActivity = {
  kind: 'model' | 'import' | 'reconciliation' | 'grade' | 'source';
  label: string;
  status: string;
  occurredAt: string;
};

export type ProfessorDetail = {
  teacher: {
    id: string;
    displayName: string;
    status: string;
    identityState: IdentityState;
    attentionLevel: AttentionLevel;
    attentionReasons: string[];
    lastActivityAt: string | null;
  };
  selectedSchoolYearId: string | null;
  availableSchoolYears: Array<{ id: string; label: string }>;
  summary: {
    classGroups: number;
    components: number;
    assignments: number;
    models: number;
    connectedModels: number;
    openFindings: number;
  };
  contexts: ProfessorAssignmentContext[];
  models: ProfessorModel[];
  pending: ProfessorPending[];
  activity: ProfessorActivity[];
};

export interface ProfessoresRepository {
  filters(): Promise<ProfessoresFilters>;
  list(query: ProfessoresListQuery): Promise<PageResult<ProfessorListItem>>;
  detail(teacherId: string, query: ProfessorDetailQuery): Promise<ProfessorDetail | null>;
}
