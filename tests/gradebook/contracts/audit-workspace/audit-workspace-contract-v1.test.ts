import { describe, expect, it } from 'vitest';
import type { AcademicYearId } from '../../../../shared/gradebook-contracts/entities';
import type {
  AuditOccurrenceId,
  AuditOccurrenceV1,
  ReconciliationResultId,
  ReconciliationResultV1,
} from '../../../../shared/gradebook-contracts/audit/audit-contract-v1';
import type { ImportBatchResultV1 } from '../../../../shared/gradebook-contracts/imports/import-contract-v1';
import type {
  ImportBatchId,
  ImportFileId,
} from '../../../../shared/gradebook-contracts/imports/import-ids-v1';
import type { GradeEntryId } from '../../../../shared/gradebook-contracts/results/results-contract-v1';
import {
  AUDIT_WORKSPACE_AUTHORIZATION_POLICY_V1,
  AUDIT_WORKSPACE_CONTRACT_V1,
  AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
  AUDIT_WORKSPACE_MAX_LIMIT_V1,
  AUDIT_WORKSPACE_ORDERS_V1,
  AUDIT_WORKSPACE_PROMOTION_POLICY_V1,
  AUDIT_WORKSPACE_RESOLUTION_POLICY_V1,
  compareAuditWorkspaceListItemsV1,
  inspectAuditWorkspaceDetailRequestV1,
  inspectAuditWorkspaceListRequestV1,
  inspectAuditWorkspaceResolutionRequestV1,
  isAuditWorkspaceDetailConsistentV1,
  isAuditWorkspaceFiltersValidV1,
  isAuditWorkspaceItemsPageValidV1,
  isAuditWorkspaceLimitV1,
  isAuditWorkspaceListItemOrderV1,
  type AuditWorkspaceCursorV1,
  type AuditWorkspaceDetailPresentV1,
  type AuditWorkspaceDetailRequestV1,
  type AuditWorkspaceDetailResponseV1,
  type AuditWorkspaceImportBatchListItemV1,
  type AuditWorkspaceItemsPageV1,
  type AuditWorkspaceListItemV1,
  type AuditWorkspaceListNonDisclosureV1,
  type AuditWorkspaceListRequestV1,
  type AuditWorkspaceOccurrenceListItemV1,
  type AuditWorkspacePromotionEligibilityV1,
  type AuditWorkspaceReconciliationListItemV1,
  type AuditWorkspaceResolutionRequestV1,
  type AuditWorkspaceResolutionResponseV1,
} from '../../../../shared/gradebook-contracts/audit-workspace/audit-workspace-contract-v1';

const academicYearId = 'academic-year:synthetic:2026' as AcademicYearId;
const importBatchId = 'import-batch:synthetic:001' as ImportBatchId;
const importFileId = 'import-file:synthetic:001' as ImportFileId;
const occurrenceId = 'audit-occurrence:synthetic:001' as AuditOccurrenceId;
const reconciliationId = 'reconciliation:synthetic:001' as ReconciliationResultId;
const cursor = 'audit-workspace:synthetic:next' as AuditWorkspaceCursorV1;

const batch = {
  id: importBatchId,
  status: 'approved',
  files: [],
  diagnostics: [],
  receivedAt: '2026-08-31T12:00:00.000Z',
  updatedAt: '2026-08-31T12:05:00.000Z',
  summary: {
    totalFileCount: 0,
    processedFileCount: 0,
    approvedFileCount: 0,
    reviewRequiredFileCount: 0,
    rejectedFileCount: 0,
    failedFileCount: 0,
    informationCount: 0,
    warningCount: 0,
    blockingErrorCount: 0,
    criticalErrorCount: 0,
  },
} satisfies ImportBatchResultV1;

const occurrence = {
  id: occurrenceId,
  importBatchId,
  severity: 'warning',
  category: 'synthetic-source-review',
  message: 'Ocorrência sintética para revisão contratual.',
  recommendedAction: 'Revisar a evidência sintética.',
  createdAt: '2026-08-31T12:03:00.000Z',
  state: 'open',
  stateHistory: [],
} satisfies AuditOccurrenceV1;

const reconciliation = {
  id: reconciliationId,
  target: {
    kind: 'grade-entry',
    id: 'grade-entry:synthetic:001' as GradeEntryId,
  },
  value: {
    imported: {
      value: { state: 'numeric', value: 7 },
      evidence: [
        {
          provenance: {
            fileName: 'PROFESSOR-SINTETICO.xlsx',
            fileSha256: 'synthetic-sha256',
            sheetName: '6A1º',
            cellAddress: 'AM8',
          },
          classification: 'manual-positive-number',
          rawValue: 7,
        },
      ],
    },
    calculated: { value: { state: 'numeric', value: 6 } },
  },
  ruleVersion: 'synthetic-rule-v1',
  status: 'mismatch',
  difference: 1,
  tolerance: 0,
  explanation: 'Divergência sintética preservada para revisão.',
} as ReconciliationResultV1;

const batchItem = {
  kind: 'import-batch',
  reference: { kind: 'import-batch', id: importBatchId },
  status: batch.status,
  receivedAt: batch.receivedAt,
  updatedAt: batch.updatedAt,
} satisfies AuditWorkspaceImportBatchListItemV1;

const occurrenceItem = {
  kind: 'audit-occurrence',
  reference: { kind: 'audit-occurrence', id: occurrenceId },
  importBatchId,
  state: occurrence.state,
  severity: occurrence.severity,
  category: occurrence.category,
  createdAt: occurrence.createdAt,
} satisfies AuditWorkspaceOccurrenceListItemV1;

const reconciliationItem = {
  kind: 'reconciliation',
  reference: { kind: 'reconciliation', id: reconciliationId },
  status: reconciliation.status,
  target: reconciliation.target,
  ruleVersion: reconciliation.ruleVersion,
  recordedAt: '2026-08-31T12:04:00.000Z',
} satisfies AuditWorkspaceReconciliationListItemV1;

function occurrenceListRequest(
  overrides: Partial<AuditWorkspaceListRequestV1> = {},
): AuditWorkspaceListRequestV1 {
  return {
    contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
    academicYearId,
    collection: 'audit-occurrences',
    filters: {},
    page: { limit: 20, cursor: null },
    order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
    ...overrides,
  } as AuditWorkspaceListRequestV1;
}

describe('audit and review workspace contract v1', () => {
  it('freezes one server-authorized provider-independent workspace contract', () => {
    expect(AUDIT_WORKSPACE_CONTRACT_V1.version).toBe(1);
    expect(AUDIT_WORKSPACE_CONTRACT_V1.collections).toEqual([
      'import-batches',
      'audit-occurrences',
      'reconciliations',
    ]);
    expect(AUDIT_WORKSPACE_AUTHORIZATION_POLICY_V1).toEqual({
      enforcement: 'server',
      requiredCapability: 'gradebook.persistence.admin',
      authorizationContext: 'server-issued-opaque',
      clientAuthorizationClaims: 'forbidden',
    });
    expect(AUDIT_WORKSPACE_CONTRACT_V1.listing).toEqual({
      implicitPerItemDetailFetch: 'forbidden',
      detailFetch: 'explicit-only',
    });
  });

  it('represents batches, occurrences and reconciliations without copying their academic payload into list items', () => {
    const items = [batchItem, occurrenceItem, reconciliationItem] satisfies AuditWorkspaceListItemV1[];

    expect(items.map((item) => item.kind)).toEqual([
      'import-batch',
      'audit-occurrence',
      'reconciliation',
    ]);
    expect(Object.keys(batchItem).sort()).toEqual([
      'kind',
      'receivedAt',
      'reference',
      'status',
      'updatedAt',
    ]);
    expect(Object.keys(occurrenceItem).sort()).toEqual([
      'category',
      'createdAt',
      'importBatchId',
      'kind',
      'reference',
      'severity',
      'state',
    ]);
    expect(Object.keys(reconciliationItem).sort()).toEqual([
      'kind',
      'recordedAt',
      'reference',
      'ruleVersion',
      'status',
      'target',
    ]);

    const serialized = JSON.stringify(items);
    for (const forbidden of [
      'evidence',
      'difference',
      'tolerance',
      'authorityMode',
      'promotionRequest',
    ]) {
      expect(serialized).not.toContain(`"${forbidden}"`);
    }
  });

  it('accepts combined existing-field filters and freezes logical-AND semantics', () => {
    const request = occurrenceListRequest({
      filters: {
        importBatchId,
        importBatchStatuses: ['approved'],
        occurrenceStates: ['open', 'acknowledged'],
        severities: ['warning', 'blocking-error'],
        categories: ['synthetic-source-review'],
        recordTypes: ['grade-entry', 'term-result'],
        reconciliationStatuses: ['mismatch', 'not-comparable'],
        period: {
          fromInclusive: '2026-08-01T00:00:00.000Z',
          toExclusive: '2026-09-01T00:00:00.000Z',
        },
      },
    });

    expect(isAuditWorkspaceFiltersValidV1(request.filters)).toBe(true);
    expect(inspectAuditWorkspaceListRequestV1(request)).toBe('ready');
    expect(AUDIT_WORKSPACE_CONTRACT_V1.filters).toEqual({
      combination: 'logical-and',
      semantics: 'projection-only-existing-contract-fields',
    });
  });

  it('uses deterministic collection-specific ordering with stable id tie breakers', () => {
    const olderOccurrence = {
      ...occurrenceItem,
      reference: {
        kind: 'audit-occurrence',
        id: 'audit-occurrence:synthetic:002' as AuditOccurrenceId,
      },
      createdAt: '2026-08-30T12:00:00.000Z',
    } satisfies AuditWorkspaceOccurrenceListItemV1;
    const sameTimeHigherId = {
      ...occurrenceItem,
      reference: {
        kind: 'audit-occurrence',
        id: 'audit-occurrence:synthetic:009' as AuditOccurrenceId,
      },
    } satisfies AuditWorkspaceOccurrenceListItemV1;
    const unordered: AuditWorkspaceOccurrenceListItemV1[] = [
      olderOccurrence,
      sameTimeHigherId,
      occurrenceItem,
    ];
    const ordered = [...unordered].sort(compareAuditWorkspaceListItemsV1);

    expect(ordered).toEqual([occurrenceItem, sameTimeHigherId, olderOccurrence]);
    expect(isAuditWorkspaceListItemOrderV1(ordered)).toBe(true);
    expect(isAuditWorkspaceListItemOrderV1(unordered)).toBe(false);
    expect(AUDIT_WORKSPACE_ORDERS_V1).toEqual({
      'import-batches': 'updated-at-desc-id-asc',
      'audit-occurrences': 'created-at-desc-id-asc',
      reconciliations: 'recorded-at-desc-id-asc',
    });
  });

  it('bounds pagination, keeps cursors opaque and rejects an invalid cursor', () => {
    expect(isAuditWorkspaceLimitV1(1)).toBe(true);
    expect(isAuditWorkspaceLimitV1(AUDIT_WORKSPACE_MAX_LIMIT_V1)).toBe(true);
    expect(isAuditWorkspaceLimitV1(0)).toBe(false);
    expect(isAuditWorkspaceLimitV1(AUDIT_WORKSPACE_MAX_LIMIT_V1 + 1)).toBe(false);

    expect(
      inspectAuditWorkspaceListRequestV1(
        occurrenceListRequest({ page: { limit: 20, cursor: '   ' as AuditWorkspaceCursorV1 } }),
      ),
    ).toBe('invalid-cursor');

    const page = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'items',
      academicYearId,
      collection: 'audit-occurrences',
      order: AUDIT_WORKSPACE_ORDERS_V1['audit-occurrences'],
      limit: 2,
      items: [occurrenceItem],
      nextCursor: cursor,
    } as const satisfies AuditWorkspaceItemsPageV1;
    expect(isAuditWorkspaceItemsPageValidV1(page)).toBe(true);
    expect(page).not.toHaveProperty('total');
  });

  it('keeps present detail discriminated and absent detail payload-free', () => {
    const promotionEligibility = {
      source: 'existing-import-change-plan',
      eligible: true,
      informationalOnly: true,
    } satisfies AuditWorkspacePromotionEligibilityV1;
    const batchDetail = {
      kind: 'import-batch',
      reference: { kind: 'import-batch', id: importBatchId },
      version: 3,
      recordedAt: '2026-08-31T12:05:01.000Z',
      record: batch,
      pendingItems: [{ kind: 'import-file-review', importBatchId, importFileId }],
      promotionEligibility,
    } as const;
    const occurrenceDetail = {
      kind: 'audit-occurrence',
      reference: { kind: 'audit-occurrence', id: occurrenceId },
      version: 2,
      recordedAt: '2026-08-31T12:03:01.000Z',
      record: occurrence,
      pendingItems: [{ kind: 'audit-occurrence', id: occurrenceId }],
    } as const;
    const reconciliationDetail = {
      kind: 'reconciliation',
      reference: { kind: 'reconciliation', id: reconciliationId },
      version: 1,
      recordedAt: '2026-08-31T12:04:00.000Z',
      record: reconciliation,
      pendingItems: [{ kind: 'reconciliation', id: reconciliationId }],
    } as const;

    const present = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'detail',
      academicYearId,
      detail: occurrenceDetail,
    } satisfies AuditWorkspaceDetailPresentV1;
    const absent = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'not-found',
      detail: null,
    } satisfies AuditWorkspaceDetailResponseV1;

    expect(isAuditWorkspaceDetailConsistentV1(batchDetail)).toBe(true);
    expect(isAuditWorkspaceDetailConsistentV1(occurrenceDetail)).toBe(true);
    expect(isAuditWorkspaceDetailConsistentV1(reconciliationDetail)).toBe(true);
    expect(present.detail.kind).toBe('audit-occurrence');
    expect(Object.keys(absent).sort()).toEqual(['contractVersion', 'detail', 'outcome']);
    expect(absent).not.toHaveProperty('academicYearId');
    expect(absent).not.toHaveProperty('reference');
    expect(absent).not.toHaveProperty('record');
  });

  it('validates detail references without accepting authorization claims', () => {
    const request = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      reference: { kind: 'audit-occurrence', id: occurrenceId },
    } satisfies AuditWorkspaceDetailRequestV1;
    expect(inspectAuditWorkspaceDetailRequestV1(request)).toBe('ready');

    const withAuthorizationClaim = {
      ...request,
      authorized: true,
    } as unknown as AuditWorkspaceDetailRequestV1;
    expect(inspectAuditWorkspaceDetailRequestV1(withAuthorizationClaim)).toBe('invalid-request');
  });

  it('accepts only existing Audit transitions and leaves actor/time to the server', () => {
    const valid = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      occurrenceId,
      expectedVersion: 2,
      transition: {
        previousState: 'acknowledged',
        nextState: 'resolved',
        justification: 'Justificativa sintética suficiente.',
      },
    } satisfies AuditWorkspaceResolutionRequestV1;

    expect(inspectAuditWorkspaceResolutionRequestV1(valid)).toBe('ready');
    expect(AUDIT_WORKSPACE_RESOLUTION_POLICY_V1).toEqual({
      transitionContract: 'AuditOccurrenceStateTransitionV1',
      actorSource: 'server-authenticated-context',
      occurredAtSource: 'server',
      clientActorClaims: 'forbidden',
      optimisticConcurrency: 'expected-version',
      rawExceptions: 'forbidden',
    });
    expect(valid).not.toHaveProperty('actorId');
    expect(valid.transition).not.toHaveProperty('actorId');
    expect(valid.transition).not.toHaveProperty('occurredAt');
  });

  it('rejects invalid transitions and actor/authentication claims supplied by the client', () => {
    const invalidTransition = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      academicYearId,
      occurrenceId,
      expectedVersion: 2,
      transition: {
        previousState: 'acknowledged',
        nextState: 'acknowledged',
      },
    } as unknown as AuditWorkspaceResolutionRequestV1;
    expect(inspectAuditWorkspaceResolutionRequestV1(invalidTransition)).toBe('invalid-transition');

    const actorClaim = {
      ...invalidTransition,
      transition: {
        previousState: 'open',
        nextState: 'resolved',
        justification: 'Sintética.',
        actorId: 'client-claimed-actor',
      },
    } as unknown as AuditWorkspaceResolutionRequestV1;
    expect(inspectAuditWorkspaceResolutionRequestV1(actorClaim)).toBe('invalid-transition');

    const authorizationClaim = {
      ...invalidTransition,
      transition: {
        previousState: 'open',
        nextState: 'resolved',
        justification: 'Sintética.',
      },
      authorized: true,
      capabilities: ['gradebook.persistence.admin'],
    } as unknown as AuditWorkspaceResolutionRequestV1;
    expect(inspectAuditWorkspaceResolutionRequestV1(authorizationClaim)).toBe('invalid-request');
  });

  it('returns explicit conflicts and other failures without academic payload or raw exceptions', () => {
    const conflict = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'version-conflict',
      currentVersion: 4,
    } satisfies AuditWorkspaceResolutionResponseV1;
    const unavailable = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'unavailable',
      currentVersion: null,
    } satisfies AuditWorkspaceResolutionResponseV1;
    const noResults = {
      contractVersion: AUDIT_WORKSPACE_CONTRACT_VERSION_V1,
      outcome: 'no-results',
      items: [],
      nextCursor: null,
    } satisfies AuditWorkspaceListNonDisclosureV1;

    for (const value of [conflict, unavailable, noResults]) {
      const serialized = JSON.stringify(value);
      for (const forbidden of [
        'record',
        'value',
        'evidence',
        'difference',
        'tolerance',
        'files',
        'exception',
        'stack',
      ]) {
        expect(serialized).not.toContain(`"${forbidden}"`);
      }
    }
    expect(conflict).toEqual({
      contractVersion: 1,
      outcome: 'version-conflict',
      currentVersion: 4,
    });
  });

  it('exposes promotion eligibility only as information and keeps execution exclusive to the existing planner/executor', () => {
    const eligibility = {
      source: 'existing-import-change-plan',
      eligible: false,
      informationalOnly: true,
    } satisfies AuditWorkspacePromotionEligibilityV1;

    expect(AUDIT_WORKSPACE_PROMOTION_POLICY_V1).toEqual({
      eligibilitySource: 'existing-import-change-plan',
      planner: 'planImportReconciliation',
      executor: 'executeImportChangePlan',
      workspacePromotionOperation: 'forbidden',
      promotionRequestPayload: 'forbidden',
    });
    expect(Object.keys(eligibility).sort()).toEqual(['eligible', 'informationalOnly', 'source']);
    expect(eligibility).not.toHaveProperty('promotionRequest');
    expect(eligibility).not.toHaveProperty('approvedImportFileIds');
    expect(AUDIT_WORKSPACE_PROMOTION_POLICY_V1).not.toHaveProperty('execute');
  });
});