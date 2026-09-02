import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  isAuditWorkspaceFiltersValidV1,
  AUDIT_WORKSPACE_PROMOTION_POLICY_V1,
} from '../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';
import {
  academicRecordStreamKeyV1,
  type ImportChangePlanV1,
} from '../../../server/gradebook/application/import/import-reconciliation-v1';
import type {
  AcademicRecordStreamV1,
  LogicalSourceRecordAssociationStreamV1,
} from '../../../src/gradebook-domain/ports/persistence/persistence-ports-v1';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

const ROADMAP_F4_BULLETS = [
  'chave técnica de lançamento e prevenção de duplicidade;',
  'versões de arquivos e valores;',
  'tratamento `FOI PARA` / `ESTAVA NO` sem dupla contagem;',
  'promoção/rejeição de lote;',
  'ocorrências estruturais, cadastrais, de nota, cálculo, origem e tempo;',
  'área funcional de Auditoria com gravidade, origem, ação e resolução;',
  'bloqueio de falso sucesso quando houver erro crítico.',
] as const;

const AUDIT_CATEGORY_FAMILIES = [
  'estrutural',
  'cadastral',
  'nota',
  'cálculo',
  'origem',
  'tempo',
] as const;

describe('F4 authoritative closure V1 — ROADMAP bullet-by-bullet', () => {
  it('locks the current seven F4 requirements as the authoritative closure scope', () => {
    const roadmap = source('docs/gradebook/ROADMAP.md');
    const f4Start = roadmap.indexOf('## F4 — Reconciliação e Auditoria');
    const f5Start = roadmap.indexOf('## F5 — Contexto e centrais operacionais');
    expect(f4Start).toBeGreaterThanOrEqual(0);
    expect(f5Start).toBeGreaterThan(f4Start);
    const f4 = roadmap.slice(f4Start, f5Start);

    for (const bullet of ROADMAP_F4_BULLETS) expect(f4).toContain(`- ${bullet}`);
    expect(ROADMAP_F4_BULLETS).toHaveLength(7);
  });

  it('bullet 1 — stable academic keys prevent duplicate streams without using technical record ids', () => {
    const gradeEntryStream: AcademicRecordStreamV1 = {
      kind: 'grade-entry',
      studentId: 'student:f4-closure:synthetic',
      enrollmentId: 'enrollment:f4-closure:synthetic',
      assessmentComponentId: 'assessment:f4-closure:synthetic',
    } as AcademicRecordStreamV1;
    const stableKey = academicRecordStreamKeyV1(gradeEntryStream);
    const associationStream = {
      logicalSourceId: 'logical-source:f4-closure:synthetic',
      academicRecordStream: gradeEntryStream,
      stableKey,
    } as LogicalSourceRecordAssociationStreamV1;

    expect(associationStream.stableKey).toBe(stableKey);
    expect(stableKey).not.toContain('grade-entry:f4-closure:technical-id');

    const planner = source('server/gradebook/application/import/import-reconciliation-v1.ts');
    const plannerTests = source(
      'tests/gradebook/reconciliation/idempotency/import-reconciliation-v1.test.ts',
    );
    expect(planner).toContain("'duplicate-incoming-stream'");
    expect(planner).toContain('academicRecordsSemanticallyEqualV1');
    expect(plannerTests).toContain(
      'keeps identical and renamed hashes free of academic association versions',
    );
  });

  it('bullet 2 — source, academic values and source associations keep append-only versions', () => {
    const schema = source('docs/gradebook/D1_SCHEMA.md');
    const executorTests = source(
      'tests/gradebook/reconciliation/execution/execute-import-change-plan-v1.test.ts',
    );
    const writeAdapter = source(
      'server/gradebook/persistence/d1/write/d1-write-adapter-v1.ts',
    );

    for (const table of [
      'source_file_streams',
      'source_file_versions',
      'academic_record_streams',
      'academic_record_versions',
      'logical_source_record_streams',
      'logical_source_record_versions',
    ]) {
      expect(schema).toContain(`\`${table}\``);
    }
    expect(schema).toContain('histórico fica em tabelas `*_versions` append-only');
    expect(executorTests).toContain(
      'commits source, academic records and associations in one transaction',
    );
    expect(executorTests).toContain("status: 'version-conflict'");
    expect(writeAdapter).toContain('previous_version');
  });

  it('bullet 3 — FOI PARA / ESTAVA NO preserves trajectory and the current population without double counting', () => {
    const sourceContract = source('docs/gradebook/SOURCE_CONTRACT.md');
    const sourceTests = source('tests/gradebook/source/synthetic-source.test.ts');
    const entityTests = source('tests/gradebook/entity-contracts/entities.test.ts');

    expect(sourceContract).toContain(
      '`FOI PARA XX` na origem e `ESTAVA NO XX` no destino representam movimento explícito dentro do ano.',
    );
    expect(sourceContract).toContain(
      'Notas anteriores replicadas no destino não podem causar dupla contagem.',
    );
    expect(sourceTests).toContain(
      'ID-002/ID-003: preserva FOI PARA/ESTAVA NO e notas replicadas nas duas posições',
    );
    expect(entityTests).toContain("expect(currentEnrollment.position).toBe('current')");
    expect(entityTests).toContain("expect(outgoing.sourceText).toBe('FOI PARA 6B')");
    expect(entityTests).toContain("expect(incoming.sourceText).toBe('ESTAVA NO 6A')");
  });

  it('bullet 4 — promotion/rejection remains isolated in the official planner and transactional executor', () => {
    const plannerTests = source(
      'tests/gradebook/reconciliation/idempotency/import-reconciliation-v1.test.ts',
    );
    const executor = source(
      'server/gradebook/application/import/execution/execute-import-change-plan-v1.ts',
    );
    const executorTests = source(
      'tests/gradebook/reconciliation/execution/execute-import-change-plan-v1.test.ts',
    );

    expect(AUDIT_WORKSPACE_PROMOTION_POLICY_V1).toEqual({
      eligibilitySource: 'existing-import-change-plan',
      planner: 'planImportReconciliation',
      executor: 'executeImportChangePlan',
      workspacePromotionOperation: 'forbidden',
      promotionRequestPayload: 'forbidden',
    });
    expect(plannerTests).toContain('isolates a critical file while preserving all writes for another approved file');
    expect(plannerTests).toContain('plan.promotionRequest.approvedImportFileIds');
    expect(executor).toContain("readonly status: 'applied'");
    expect(executor).toContain("readonly status: 'rejected-invalid-plan'");
    expect(executorTests).toContain('rejects tampered association provenance before opening the transaction');
  });

  it('bullet 5 — all six official occurrence families remain representable/filterable without inventing a taxonomy enum', () => {
    for (const category of AUDIT_CATEGORY_FAMILIES) {
      expect(isAuditWorkspaceFiltersValidV1({ categories: [category] })).toBe(true);
    }

    const auditContract = source('shared/gradebook-contracts/audit/audit-contract-v1.ts');
    const auditRepository = source(
      'server/gradebook/persistence/d1/audit/d1-audit-repository-v1.ts',
    );
    const auditReadSource = source(
      'server/gradebook/persistence/d1/audit-workspace/d1-audit-workspace-source-v1.ts',
    );
    const readSourceTests = source(
      'tests/gradebook/audit-workspace/d1-audit-workspace-source-v1.test.ts',
    );

    expect(auditContract).toContain('readonly category: string;');
    expect(auditRepository).toContain('category');
    expect(auditReadSource).toContain('filters.categories');
    expect(readSourceTests).toContain('categories: [\'synthetic-category\']');
    expect(auditContract).not.toContain('AUDIT_CATEGORIES_V1');
  });

  it('bullet 6 — Audit Workspace exposes severity/origin/action and versioned server-side resolution', () => {
    const auditContract = source('shared/gradebook-contracts/audit/audit-contract-v1.ts');
    const workspace = source(
      'server/gradebook/application/audit-workspace/audit-workspace-v1.ts',
    );
    const http = source('server/gradebook/http/audit-workspace-routes-v1.ts');
    const ui = source('src/features/gradebook/audit-workspace/audit-workspace-page.tsx');
    const workspaceTests = source('tests/gradebook/audit-workspace/audit-workspace-v1.test.ts');

    expect(auditContract).toContain('readonly severity: AuditSeverityV1;');
    expect(auditContract).toContain('readonly source?: AuditSourceReferenceV1;');
    expect(auditContract).toContain('readonly recommendedAction?: string;');
    expect(workspace).toContain('expectedVersion: request.expectedVersion');
    expect(workspace).toContain('resolutionIdentity()');
    expect(http).toContain("'/api/gradebook/audit-workspace'");
    expect(ui).toContain('Registrar resolução');
    expect(ui).toContain('Ação recomendada:');
    expect(workspaceTests).toContain(
      'resolve pela escrita CAS existente usando ator e instante do servidor',
    );
  });

  it('bullet 7 — critical errors cannot masquerade as full success and valid files stay independently promotable', () => {
    const planner = source('server/gradebook/application/import/import-reconciliation-v1.ts');
    const plannerTests = source(
      'tests/gradebook/reconciliation/idempotency/import-reconciliation-v1.test.ts',
    );
    const importContracts = source(
      'shared/gradebook-contracts/imports/import-contract-v1.ts',
    );

    expect(planner).toContain("diagnostic.severity === 'critical-error'");
    expect(plannerTests).toContain("expect(plan.status).toBe('partially-ready')");
    expect(plannerTests).toContain('expect(plan.blockedImportFileIds).toEqual([invalidFile.id])');
    expect(plannerTests).toContain(
      'expect(plan.promotionRequest.approvedImportFileIds).toEqual([validFile.id])',
    );
    expect(importContracts).toContain('criticalErrorCount');
    expect(importContracts).toContain("'partially-approved'");
  });

  it('keeps the closure inside existing semantics and provider-independent boundaries', () => {
    const planner = source('server/gradebook/application/import/import-reconciliation-v1.ts');
    const workspace = source(
      'server/gradebook/application/audit-workspace/audit-workspace-v1.ts',
    );
    const projectState = source('docs/gradebook/PROJECT_STATE.yaml');

    expect(projectState).toContain('academic_authority_mode: imported-source');
    expect(planner).not.toContain('D1Database');
    expect(workspace).not.toContain('D1Database');
    expect(workspace).not.toContain('executeImportChangePlan(');
    expect({} as Partial<ImportChangePlanV1>).not.toHaveProperty('academicRule');
  });
});
