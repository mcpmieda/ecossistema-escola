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

describe('Banco de Notas teacher model Graph orchestration', () => {
  it('stores, shares with one authenticated recipient, verifies metadata and audits', async () => {
    const gateway = {
      store: vi.fn(async () => ({ driveItemId: 'drive-item-1', etag: 'stored' })),
      share: vi.fn(async () => ({ permissionId: 'permission-1' })),
      metadata: vi.fn(async () => ({ etag: 'verified', size: 3, sha256: 'a'.repeat(64) })),
    };
    const audit = { record: vi.fn(async () => undefined) };
    const result = await storeShareAndVerifyTeacherModel({
      model,
      recipient,
      gateway,
      audit,
      correlationId: 'correlation-1',
    });

    expect(result).toMatchObject({ driveItemId: 'drive-item-1', permissionId: 'permission-1' });
    expect(gateway.share).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientEntraObjectId: recipient.entraObjectId,
        recipientUpn: recipient.upn,
        requireSignIn: true,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'succeeded' }));
  });

  it('fails reconciliation on metadata mismatch and records a safe failed audit', async () => {
    const gateway = {
      store: vi.fn(async () => ({ driveItemId: 'drive-item-1', etag: 'stored' })),
      share: vi.fn(async () => ({ permissionId: 'permission-1' })),
      metadata: vi.fn(async () => ({ etag: 'verified', size: 2 })),
    };
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({ model, recipient, gateway, audit }),
    ).rejects.toThrow('stored_model_size_mismatch');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', safeError: 'stored_model_size_mismatch' }),
    );
  });

  it('rejects non-XLSX files and invalid recipients before calling Graph', async () => {
    const gateway = {
      store: vi.fn(),
      share: vi.fn(),
      metadata: vi.fn(),
    };
    const audit = { record: vi.fn(async () => undefined) };
    await expect(
      storeShareAndVerifyTeacherModel({
        model: { ...model, fileName: 'private-master.xlsb' },
        recipient,
        gateway,
        audit,
      }),
    ).rejects.toThrow();
    expect(gateway.store).not.toHaveBeenCalled();
  });
});
