import { z } from 'zod';
import type { RuntimeEnv } from '../env';
import { getGraphToken, graphRequest } from '../graph/client';
import { GraphError, graphDefaultsV1, graphFetchV1, graphRetryAfterMsV1, graphUrlV1, type GraphDependencies } from '../graph/request-policy-v1';
import { photoAssetV1, photoWriteContextV1, photoVariantMetadataV1, type PhotoAssetV1 } from '../../shared/student-photos/write-v1';
import { studentUidV1 } from '../../shared/student-identity/student-identity-v1';
import { probePhotoSourceV1 } from '../../shared/student-photos/source-probe-v1';
import { readSharePointPhotoV1 } from './sharepoint-download-v1';
import type { PhotoWritePortsV1 } from './write-coordinator-v1';

const locator = z.string().min(1).max(256).regex(/^[A-Za-z0-9!_-]+$/u);
// One strong opaque tag only. Never turn a wildcard/list into a conditional delete.
const strongETag = z.string().min(3).max(256).regex(/^"[\x20-\x21\x23-\x7e]+"$/u);
const librarySchema = z.object({ driveId: locator, parentItemId: locator }).strict();
const remoteFile = z.object({
  id: locator, name: z.string().min(1).max(256), eTag: strongETag,
  size: z.number().int().min(20).max(131072),
  file: z.object({ mimeType: z.literal('image/webp') }),
  parentReference: z.object({ driveId: locator, id: locator }),
  folder: z.never().optional(), package: z.never().optional(), remoteItem: z.never().optional(), deleted: z.never().optional(),
});
const uploadSchema = z.object({
  context: photoWriteContextV1, requestId: studentUidV1,
  variant: z.enum(['portrait', 'avatar']), metadata: photoVariantMetadataV1,
}).strict();
type RemoteFile = z.infer<typeof remoteFile>;
type Upload = z.infer<typeof uploadSchema>;
export type SharePointPhotoActionV1 =
  | ({ kind: 'upload' } & Upload)
  | { kind: 'remove'; asset: PhotoAssetV1 };
export interface SharePointPhotoOptionsV1 {
  env: RuntimeEnv;
  /** Trusted server binding, resolved from the designated library. Never request/body values. */
  library: z.infer<typeof librarySchema>;
  /** Must check current operator, person, reservation/receipt and exact asset membership.
   * Graph access alone is not permission to change a student's photo. No default allow. */
  authorize(action: SharePointPhotoActionV1): Promise<void>;
  dependencies?: GraphDependencies;
  token?: string;
}
interface Operation {
  token: string; signal: AbortSignal; correlationId: string;
  action: SharePointPhotoActionV1;
}
const selection = '?$select=id,name,eTag,size,file,parentReference,folder,package,remoteItem,deleted';
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',
  new Uint8Array(bytes).buffer)), value => value.toString(16).padStart(2, '0')).join('');
const ambiguous = (error: unknown): error is GraphError => error instanceof GraphError
  && (error.status === 409 || error.status === 412 || error.status >= 500);

/** Administrative transport, not an upload endpoint or codec. Only server-validated bytes
 * may reach this class; network fixtures prove protocol behavior, not tenant permissions. */
export class SharePointPhotoTransportV1 {
  private readonly library: z.infer<typeof librarySchema>;
  private readonly dependencies: GraphDependencies;
  private readonly host: string;
  constructor(private readonly options: SharePointPhotoOptionsV1) {
    this.library = librarySchema.parse(options.library);
    this.dependencies = options.dependencies ?? graphDefaultsV1;
    this.host = options.env.SHAREPOINT_SITE_ID.split(',')[0]!.toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.sharepoint\.com$/u.test(this.host) || typeof options.authorize !== 'function')
      throw new Error('student-photo-storage-unavailable');
  }
  private path(item: string): string {
    return `/drives/${encodeURIComponent(this.library.driveId)}/items/${encodeURIComponent(item)}`;
  }
  private async authorize(operation: Pick<Operation, 'action' | 'signal' | 'correlationId'>): Promise<void> {
    operation.signal.throwIfAborted();
    try { await this.options.authorize(operation.action); }
    catch { operation.signal.throwIfAborted(); throw new GraphError(403, operation.correlationId); }
    operation.signal.throwIfAborted();
  }
  private async start(action: SharePointPhotoActionV1, signal: AbortSignal, correlationId: string): Promise<Operation> {
    const operation = { action, signal, correlationId };
    await this.authorize(operation);
    const token = this.options.token ?? await getGraphToken(this.options.env, this.dependencies);
    signal.throwIfAborted();
    return { ...operation, token };
  }
  private async json(path: string, operation: Operation, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<unknown> {
    return (await graphRequest<unknown>({ env: this.options.env, dependencies: this.dependencies,
      token: operation.token, signal: operation.signal, correlationId: operation.correlationId, path, method, body })).data;
  }
  private async parent(operation: Operation): Promise<void> {
    const value = await this.json(this.path(this.library.parentItemId) + '?$select=id,folder', operation);
    const checked = z.object({ id: locator, folder: z.object({}) }).safeParse(value);
    if (!checked.success || checked.data.id !== this.library.parentItemId) throw new GraphError(502, operation.correlationId);
  }
  private checkedFile(value: unknown, operation: Operation, expected: { name?: string; itemId?: string; size: number }): RemoteFile {
    const checked = remoteFile.safeParse(value);
    if (!checked.success) throw new GraphError(502, operation.correlationId);
    const file = checked.data;
    if (file.parentReference.driveId !== this.library.driveId || file.parentReference.id !== this.library.parentItemId
      || file.size !== expected.size || (expected.name !== undefined && file.name !== expected.name)
      || (expected.itemId !== undefined && file.id !== expected.itemId)) throw new GraphError(409, operation.correlationId);
    return file;
  }
  private async lookup(path: string, operation: Operation): Promise<unknown | null> {
    try { return await this.json(path + selection, operation); }
    catch (error) { if (error instanceof GraphError && error.status === 404) return null; throw error; }
  }
  private async verifyExisting(input: Upload, name: string, operation: Operation): Promise<PhotoAssetV1 | null> {
    await this.authorize(operation);
    const value = await this.lookup(this.path(this.library.parentItemId) + ':/' + encodeURIComponent(name), operation);
    if (value === null) return null;
    const file = this.checkedFile(value, operation, { name, size: input.metadata.byteSize });
    const read = await readSharePointPhotoV1({ env: this.options.env, dependencies: this.dependencies,
      token: operation.token, driveId: this.library.driveId, itemId: file.id,
      expectedETag: file.eTag, signal: operation.signal });
    try {
      if (read.bytes.length !== input.metadata.byteSize || await hash(read.bytes) !== input.metadata.sha256)
        throw new GraphError(409, operation.correlationId);
      await this.authorize(operation);
      return photoAssetV1.parse({ ...input.metadata, driveId: this.library.driveId, itemId: file.id, etag: read.etag });
    } finally { read.bytes.fill(0); }
  }
  private sessionUrl(value: unknown, operation: Operation): string {
    const session = z.object({ uploadUrl: z.string().min(1).max(8192), expirationDateTime: z.string().min(1).max(64) }).safeParse(value);
    if (!session.success) throw new GraphError(502, operation.correlationId);
    const { uploadUrl, expirationDateTime } = session.data;
    let url: URL;
    try { url = new URL(uploadUrl); } catch { throw new GraphError(502, operation.correlationId); }
    const expiry = Date.parse(expirationDateTime);
    if (url.protocol !== 'https:' || url.hostname !== this.host || url.port || url.username || url.password || url.hash
      || uploadUrl.trim() !== uploadUrl || /[\r\n\t\\]/u.test(uploadUrl) || !Number.isFinite(expiry)
      || expiry <= (this.dependencies.now ?? Date.now)()) throw new GraphError(502, operation.correlationId);
    return url.href;
  }
  private async send(name: string, bytes: Uint8Array, operation: Operation): Promise<void> {
    await this.authorize(operation);
    const session = await this.json(this.path(this.library.parentItemId) + ':/' + encodeURIComponent(name) + ':/createUploadSession',
      operation, 'POST', { item: { name, '@microsoft.graph.conflictBehavior': 'fail' }, deferCommit: false });
    const url = this.sessionUrl(session, operation);
    await this.authorize(operation);
    let response: Response;
    try {
      // Whole final range (<320 KiB), not a sequence of undersized intermediate chunks.
      // Never forward the Graph bearer, cookies, referrer or caller headers to this URL.
      response = await this.dependencies.fetch(url, { method: 'PUT', redirect: 'manual', credentials: 'omit',
        headers: { 'Content-Type': 'image/webp', 'Content-Length': String(bytes.length),
          'Content-Range': `bytes 0-${bytes.length - 1}/${bytes.length}` },
        body: new Uint8Array(bytes).buffer, signal: operation.signal });
    } catch { operation.signal.throwIfAborted(); throw new GraphError(503, operation.correlationId); }
    const wait = graphRetryAfterMsV1(response.headers.get('Retry-After'), (this.dependencies.now ?? Date.now)());
    await response.body?.cancel().catch(() => undefined);
    if (response.redirected || ![200, 201].includes(response.status))
      throw new GraphError(response.status >= 400 ? response.status : 502, operation.correlationId,
        wait === undefined ? undefined : Math.ceil(wait / 1000));
    // Do not trust the PUT's returned locator/size: verify the deterministic path and bytes.
  }
  private checkUpload(input: Parameters<PhotoWritePortsV1['upload']>[0], correlationId: string): Upload {
    const parsed = uploadSchema.safeParse({ context: input.context, requestId: input.requestId, variant: input.variant, metadata: input.metadata });
    if (!parsed.success || !(input.bytes instanceof Uint8Array)) throw new GraphError(400, correlationId);
    const value = parsed.data, meta = value.metadata;
    if (input.bytes.length !== meta.byteSize || (value.variant === 'portrait' ? meta.width * 4 !== meta.height * 3
      : meta.width !== meta.height || meta.width > 320 || meta.byteSize > 65536)) throw new GraphError(400, correlationId);
    return value;
  }
  async upload(input: Parameters<PhotoWritePortsV1['upload']>[0]): Promise<PhotoAssetV1> {
    const correlationId = crypto.randomUUID(), parsed = this.checkUpload(input, correlationId);
    const bytes = new Uint8Array(input.bytes);
    const signal = AbortSignal.any([input.signal, AbortSignal.timeout(45_000)]);
    try {
      const operation = await this.start({ kind: 'upload', ...parsed }, signal, correlationId);
      const probe = probePhotoSourceV1(bytes);
      if (probe.type !== 'image/webp' || probe.width !== parsed.metadata.width || probe.height !== parsed.metadata.height
        || await hash(bytes) !== parsed.metadata.sha256) throw new GraphError(400, correlationId);
      await this.parent(operation);
      const name = `${parsed.context.studentUid}_${parsed.requestId}_${parsed.variant}.webp`;
      const existing = await this.verifyExisting(parsed, name, operation);
      if (existing) return existing;
      try { await this.send(name, bytes, operation); }
      catch (error) {
        signal.throwIfAborted();
        if (!ambiguous(error)) throw error;
        const recovered = await this.verifyExisting(parsed, name, operation);
        if (recovered) return recovered;
        throw error; // Keep durable reservation. No second POST/PUT after an ambiguous outcome.
      }
      const verified = await this.verifyExisting(parsed, name, operation);
      if (!verified) throw new GraphError(503, correlationId);
      return verified;
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GraphError) throw error;
      throw new GraphError(503, correlationId);
    } finally { bytes.fill(0); }
  }
  async remove(input: PhotoAssetV1, callerSignal: AbortSignal): Promise<'deleted' | 'already-absent'> {
    const correlationId = crypto.randomUUID(), checked = photoAssetV1.safeParse(input);
    if (!checked.success || !strongETag.safeParse(checked.data.etag).success || checked.data.driveId !== this.library.driveId)
      throw new GraphError(400, correlationId);
    const asset = checked.data, signal = AbortSignal.any([callerSignal, AbortSignal.timeout(30_000)]);
    try {
      const operation = await this.start({ kind: 'remove', asset }, signal, correlationId);
      await this.parent(operation);
      const path = this.path(asset.itemId), value = await this.lookup(path, operation);
      if (value === null) return 'already-absent'; // Visibility in the authorized scope, not proof of permanent erasure.
      const current = this.checkedFile(value, operation, { itemId: asset.itemId, size: asset.byteSize });
      if (current.eTag !== asset.etag) throw new GraphError(412, correlationId);
      await this.authorize(operation);
      try {
        const response = await graphFetchV1({ url: graphUrlV1(path), dependencies: this.dependencies, correlationId, signal,
          init: { method: 'DELETE', headers: { Authorization: `Bearer ${operation.token}`, 'If-Match': asset.etag,
            Accept: 'application/json', 'client-request-id': correlationId } } });
        await response.body?.cancel().catch(() => undefined);
        if (response.status !== 204 || response.redirected) throw new GraphError(502, correlationId);
        return 'deleted'; // Graph's conditional DELETE moves to the recycle bin; it is NOT permanentDelete.
      } catch (error) {
        if (error instanceof GraphError && error.status === 404) return 'already-absent';
        throw error;
      }
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof GraphError) throw error;
      throw new GraphError(503, correlationId);
    }
  }
}
