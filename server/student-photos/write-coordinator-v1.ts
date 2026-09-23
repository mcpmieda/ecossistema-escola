import {
  photoWriteContextV1, photoWriteCommandV1, photoWritePlanV1, assertPhotoWritePlanV1, PhotoWriteErrorV1,
  type PhotoWriteContextV1, type PhotoWriteCommandV1, type PhotoWritePlanV1, type PhotoAssetV1,
  type PhotoVariantMetadataV1, type PhotoWriteReceiptV1,
} from '../../shared/student-photos/write-v1';
import type { PhotoWriteRepositoryV1 } from './write-repository-v1';

export type PhotoVariantV1 = 'portrait' | 'avatar';
export interface ValidatedPhotoBytesV1 { bytes: Uint8Array; width: number; height: number }
export interface PhotoWritePortsV1 {
  /** Mandatory existing administrative authorization; rechecked before commit/deletion. */
  authorize(context: PhotoWriteContextV1): Promise<void>;
  /** MUST decode and re-encode in the server runtime. No header-only/default implementation. */
  validate(bytes: Uint8Array, variant: PhotoVariantV1, signal: AbortSignal): Promise<ValidatedPhotoBytesV1>;
  /** Create-only, deterministic operation key; reconcile an ambiguous response by verifying remote bytes.
   * Never overwrite the current family or infer success from size alone. */
  upload(input: { context: PhotoWriteContextV1; requestId: string; variant: PhotoVariantV1;
    bytes: Uint8Array; metadata: PhotoVariantMetadataV1; signal: AbortSignal }): Promise<PhotoAssetV1>;
  /** Must use the exact retired locator and expected ETag, no lock/retention bypass. */
  remove(asset: PhotoAssetV1, signal: AbortSignal): Promise<'deleted' | 'already-absent'>;
}
export interface PhotoWriteInputV1 { portrait: Uint8Array | null; avatar: Uint8Array | null }
export type PhotoWriteResultV1 =
  | { state: 'pending'; requestId: string; stage: 'upload' | 'commit' }
  | { state: 'committed'; requestId: string; revision: string; cleanupPending: boolean };

async function metadataOf(value: ValidatedPhotoBytesV1): Promise<PhotoVariantMetadataV1> {
  const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(value.bytes).buffer)),
    byte => byte.toString(16).padStart(2, '0')).join('');
  return { width: value.width, height: value.height, byteSize: value.bytes.length, sha256 };
}

/** Composes short database transactions and remote I/O; NEVER mounts an HTTP endpoint.
 * Deliberately has no permissive codec or authorization fallback. The application must
 * prove those production adapters before connecting this coordinator to the editor. */
export class PhotoWriteCoordinatorV1 {
  constructor(private readonly repository: Pick<PhotoWriteRepositoryV1, 'claim' | 'commit' | 'acknowledgeCleanup' | 'complete'>,
    private readonly ports: PhotoWritePortsV1) {}

  private async prepare(command: PhotoWriteCommandV1, input: PhotoWriteInputV1, signal: AbortSignal) {
    const validated: Partial<Record<PhotoVariantV1, ValidatedPhotoBytesV1>> = {};
    const plan: PhotoWritePlanV1 = { portrait: null, avatar: null };
    for (const variant of ['portrait','avatar'] as const) {
      const wanted = variant === 'portrait' ? command.kind === 'replace' : command.kind !== 'remove';
      const bytes = input[variant];
      if (wanted !== (bytes !== null)) throw new PhotoWriteErrorV1('invalid');
      if (!bytes) continue;
      if (!(bytes instanceof Uint8Array) || bytes.length < 20 || bytes.length > (variant === 'portrait' ? 131072 : 65536))
        throw new PhotoWriteErrorV1('invalid');
      signal.throwIfAborted();
      const result = await this.ports.validate(new Uint8Array(bytes), variant, signal);
      signal.throwIfAborted();
      // Own the output before hashing or awaiting any remote operation.
      const stable = { ...result, bytes: new Uint8Array(result.bytes) };
      plan[variant] = await metadataOf(stable);
      validated[variant] = stable;
    }
    const checked = photoWritePlanV1.parse(plan);
    assertPhotoWritePlanV1(command, checked);
    return { validated, plan: checked };
  }

  async execute(contextInput: PhotoWriteContextV1, commandInput: PhotoWriteCommandV1,
    input: PhotoWriteInputV1, signal: AbortSignal): Promise<PhotoWriteResultV1> {
    const context = photoWriteContextV1.parse(contextInput), command = photoWriteCommandV1.parse(commandInput);
    signal.throwIfAborted();
    await this.ports.authorize(context);
    const prepared = await this.prepare(command, input, signal);
    signal.throwIfAborted();
    let receipt = await this.repository.claim(context, command, prepared.plan);
    if (receipt.phase === 'complete') return { state: 'committed', requestId: command.requestId, revision: command.requestId, cleanupPending: false };
    if (receipt.phase === 'prepared') {
      const uploaded: { portrait: PhotoAssetV1 | null; avatar: PhotoAssetV1 | null } = { portrait: null, avatar: null };
      try {
        for (const variant of ['portrait','avatar'] as const) {
          const data = prepared.validated[variant], metadata = prepared.plan[variant];
          if (!data || !metadata) continue;
          signal.throwIfAborted();
          uploaded[variant] = await this.ports.upload({ context, requestId: command.requestId, variant,
            bytes: data.bytes, metadata, signal });
        }
      } catch {
        // The server may have stored bytes before the response was lost. Keep the reservation
        // and retry this SAME receipt; do not delete a file that may still be uploading.
        return { state: 'pending', requestId: command.requestId, stage: 'upload' };
      }
      signal.throwIfAborted();
      await this.ports.authorize(context);
      try { receipt = await this.repository.commit(context, command.requestId, uploaded); }
      catch (error) {
        if (error instanceof PhotoWriteErrorV1) throw error;
        // Commit may have succeeded: only its durable receipt can settle the outcome.
        return { state: 'pending', requestId: command.requestId, stage: 'commit' };
      }
    }
    return this.cleanup(context, receipt, signal);
  }

  private async cleanup(context: PhotoWriteContextV1, initial: PhotoWriteReceiptV1, signal: AbortSignal): Promise<PhotoWriteResultV1> {
    let receipt = initial;
    for (const asset of initial.cleanup) {
      signal.throwIfAborted();
      await this.ports.authorize(context);
      try {
        const outcome = await this.ports.remove(asset, signal);
        receipt = await this.repository.acknowledgeCleanup(context, receipt.requestId, asset, outcome);
      } catch {
        return { state: 'committed', requestId: receipt.requestId, revision: receipt.requestId, cleanupPending: true };
      }
    }
    try { await this.repository.complete(context, receipt.requestId); }
    catch {
      return { state: 'committed', requestId: receipt.requestId, revision: receipt.requestId, cleanupPending: true };
    }
    return { state: 'committed', requestId: receipt.requestId, revision: receipt.requestId, cleanupPending: false };
  }
}
