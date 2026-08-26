import { describe, expect, it, vi } from 'vitest';
import { storeShareAndVerifyTeacherModel } from '../server/banco-notas/teacher-model-graph';

const model = {
  teacherModelId: '11111111-1111-4111-8111-111111111111',
  fileName: 'modelo-generico-sintetico.xlsx',
  modelHash: 'a'.repeat(64),
  definitionVersion: '2026.1',
  mappingVersion: 1,
  content: new Uint8Array([1, 2, 3]),
};
const recipient = {
  entraObjectId: '22222222-2222-4222-8222-222222222222',
  upn: 'professor.synthetic@example.edu',
};

function gateway(overrides: Record<string, unknown> = {}) {
  return {
    store: vi.fn(async () => ({ driveItemId: 'drive-item-1', etag: 'stored' })),
    share: vi.fn(async () => ({ permissionId: 'permission-1' })),
    metadata: vi.fn(async () => ({ etag: 'verified', size: 3, sha256: 'a'.repeat(64) })),
    revokeShare: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('Banco de Notas teacher model Graph orchestration', () => {
  it('stores, shares with one authenticated recipient, verifies metadata and audits', async () => {
    const graph = gateway();
    const audit = { record: vi.fn(async () => undefined) };
    const result = await storeShareAndVerifyTeacherModel({
      model,
      recipient,
      gateway: graph,
      audit,
      correlationId: 'correlation-1',
    });

    expect(result).toMatchObject({ driveItemId: 'drive-item-1', permissionId: 'permission-1' });
    expect(graph.share).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEntraObjectId: recipient.entraObjectId,
        recipientUpn: recipient.upn,
        requireSignIn: true,
      }),
    );
    expect(graph.revokeShare).not.toHaveBeenCalled();
    expect(graph.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'succeeded' }));
  });

  it('revokes the permission and removes the stored model when metadata validation fails', async () => {
    const graph = gateway({
      metadata: vi.fn(async () => ({ etag: 'verified', size: 2 })),
    });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({ model, recipient, gateway: graph, audit }),
    ).rejects.toThrow('stored_model_size_mismatch');
    expect(graph.revokeShare).toHaveBeenCalledWith(
      expect.objectContaining({ driveItemId: 'drive-item-1', permissionId: 'permission-1' }),
    );
    expect(graph.remove).toHaveBeenCalledWith(
      expect.objectContaining({ driveItemId: 'drive-item-1' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        safeError: 'stored_model_size_mismatch',
        compensation: expect.objectContaining({
          shareRevoked: true,
          storedFileRemoved: true,
          errors: [],
        }),
      }),
    );
  });

  it('removes an uploaded file when sharing fails before a permission is created', async () => {
    const graph = gateway({
      share: vi.fn(async () => Promise.reject(new Error('share_failed'))),
    });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({ model, recipient, gateway: graph, audit }),
    ).rejects.toThrow('share_failed');
    expect(graph.revokeShare).not.toHaveBeenCalled();
    expect(graph.remove).toHaveBeenCalledTimes(1);
  });

  it('surfaces compensation failure instead of leaving a rejected share silently active', async () => {
    const graph = gateway({
      metadata: vi.fn(async () => ({ etag: 'verified', size: 2 })),
      revokeShare: vi.fn(async () => Promise.reject(new Error('revoke_failed'))),
    });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({ model, recipient, gateway: graph, audit }),
    ).rejects.toThrow('teacher_model_compensation_failed:stored_model_size_mismatch');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        compensation: expect.objectContaining({
          shareRevoked: false,
          storedFileRemoved: true,
          errors: ['revoke:revoke_failed'],
        }),
      }),
    );
  });

  it('rejects non-XLSX files and invalid recipients before calling Graph', async () => {
    const graph = gateway();
    const audit = { record: vi.fn(async () => undefined) };
    await expect(
      storeShareAndVerifyTeacherModel({
        model: { ...model, fileName: 'private-master.xlsb' },
        recipient,
        gateway: graph,
        audit,
      }),
    ).rejects.toThrow();
    expect(graph.store).not.toHaveBeenCalled();
  });
});
