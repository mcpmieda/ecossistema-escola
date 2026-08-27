import { describe, expect, it, vi } from 'vitest';
import { storeShareAndVerifyTeacherModel } from '../server/banco-notas/teacher-model-graph';

const modelContent = new Uint8Array([1, 2, 3]);
const model = {
  teacherModelId: '11111111-1111-4111-8111-111111111111',
  fileName: 'modelo-generico-sintetico.xlsx',
  modelHash: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
  definitionVersion: '2026.1',
  mappingVersion: 1,
  content: modelContent,
};
const recipient = {
  entraObjectId: '22222222-2222-4222-8222-222222222222',
  upn: 'professor.synthetic@example.edu',
};

function gateway(overrides: Record<string, unknown> = {}) {
  return {
    store: vi.fn(async () => ({ driveItemId: 'drive-item-1', etag: 'stored' })),
    share: vi.fn(async () => ({ permissionId: 'permission-1' })),
    metadata: vi.fn(async () => ({ etag: 'verified', size: modelContent.byteLength })),
    download: vi.fn(async () => new Uint8Array(modelContent)),
    revokeShare: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
}

function verifier() {
  return vi.fn(async () => undefined);
}

describe('Banco de Notas teacher model Graph orchestration', () => {
  it('stores, shares, verifies package integrity, reanalyzes and only then audits success', async () => {
    const graph = gateway();
    const audit = { record: vi.fn(async () => undefined) };
    const verifyDownloadedWorkbook = verifier();
    const result = await storeShareAndVerifyTeacherModel({
      model,
      recipient,
      gateway: graph,
      audit,
      verifyDownloadedWorkbook,
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
    expect(graph.download).toHaveBeenCalledWith(
      expect.objectContaining({ driveItemId: 'drive-item-1', correlationId: 'correlation-1' }),
    );
    expect(verifyDownloadedWorkbook).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.any(Uint8Array),
        teacherModelId: model.teacherModelId,
        definitionVersion: model.definitionVersion,
        mappingVersion: model.mappingVersion,
        correlationId: 'correlation-1',
      }),
    );
    expect(verifyDownloadedWorkbook.mock.invocationCallOrder[0]).toBeLessThan(
      audit.record.mock.invocationCallOrder[0]!,
    );
    expect(graph.revokeShare).not.toHaveBeenCalled();
    expect(graph.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ result: 'succeeded' }));
  });

  it('rejects a local content hash mismatch before uploading anything', async () => {
    const graph = gateway();
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({
        model: { ...model, modelHash: 'a'.repeat(64) },
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
        correlationId: 'correlation-local-hash',
      }),
    ).rejects.toThrow('teacher_model_content_hash_mismatch');

    expect(graph.store).not.toHaveBeenCalled();
    expect(graph.share).not.toHaveBeenCalled();
    expect(graph.remove).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        safeError: 'teacher_model_content_hash_mismatch',
        correlationId: 'correlation-local-hash',
      }),
    );
  });

  it('revokes and removes when downloaded size differs from metadata', async () => {
    const graph = gateway({
      metadata: vi.fn(async () => ({ etag: 'verified', size: 2 })),
    });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
      }),
    ).rejects.toThrow('stored_model_download_size_mismatch');
    expect(graph.download).toHaveBeenCalledOnce();
    expect(graph.revokeShare).toHaveBeenCalledWith(
      expect.objectContaining({ driveItemId: 'drive-item-1', permissionId: 'permission-1' }),
    );
    expect(graph.remove).toHaveBeenCalledWith(
      expect.objectContaining({ driveItemId: 'drive-item-1' }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        result: 'failed',
        safeError: 'stored_model_download_size_mismatch',
        compensation: expect.objectContaining({
          shareRevoked: true,
          storedFileRemoved: true,
          errors: [],
        }),
      }),
    );
  });

  it('compensates when downloaded size differs from metadata', async () => {
    const graph = gateway({ download: vi.fn(async () => new Uint8Array([1, 2])) });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
      }),
    ).rejects.toThrow('stored_model_download_size_mismatch');
    expect(graph.revokeShare).toHaveBeenCalledOnce();
    expect(graph.remove).toHaveBeenCalledOnce();
  });

  it('compensates when downloaded bytes are not an exact or safely normalized package', async () => {
    const graph = gateway({ download: vi.fn(async () => new Uint8Array([3, 2, 1])) });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
      }),
    ).rejects.toThrow('stored_model_package_integrity_mismatch');
    expect(graph.revokeShare).toHaveBeenCalledOnce();
    expect(graph.remove).toHaveBeenCalledOnce();
  });

  it('compensates when OOXML reanalysis rejects the downloaded workbook', async () => {
    const graph = gateway();
    const audit = { record: vi.fn(async () => undefined) };
    const verifyDownloadedWorkbook = vi.fn(async () => {
      throw new Error('downloaded_workbook_invalid');
    });

    await expect(
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook,
      }),
    ).rejects.toThrow('downloaded_workbook_invalid');
    expect(graph.revokeShare).toHaveBeenCalledOnce();
    expect(graph.remove).toHaveBeenCalledOnce();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ result: 'failed', safeError: 'downloaded_workbook_invalid' }),
    );
  });

  it('removes an uploaded file when sharing fails before a permission is created', async () => {
    const graph = gateway({
      share: vi.fn(async () => Promise.reject(new Error('share_failed'))),
    });
    const audit = { record: vi.fn(async () => undefined) };

    await expect(
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
      }),
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
      storeShareAndVerifyTeacherModel({
        model,
        recipient,
        gateway: graph,
        audit,
        verifyDownloadedWorkbook: verifier(),
      }),
    ).rejects.toThrow('teacher_model_compensation_failed:stored_model_download_size_mismatch');
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
        verifyDownloadedWorkbook: verifier(),
      }),
    ).rejects.toThrow();
    expect(graph.store).not.toHaveBeenCalled();
  });
});
