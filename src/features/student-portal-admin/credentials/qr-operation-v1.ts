import {
  adminCommandV1,
  type AdminCommandV1,
} from '../../../../shared/student-portal-contracts/admin-v1';
import { PortalClientErrorV1 } from '../../student-portal/shared/transport-v1';
import type { PortalAdminClientV1 } from '../shared/admin-client-v1';
import { validatePrintCardsV1, type PrintCardV1, type QrArtifactV1 } from './qr-values-v1';
import { copyQrImageV1, createQrDownloadsV1 } from './qr-browser-v1';

export type QrCommandV1 = Extract<
  AdminCommandV1,
  { operation: 'qr-issue' | 'qr-reprint' | 'qr-batch' }
>;
export type QrOperationStateV1 =
  | { state: 'idle' | 'cancelled' | 'expired' }
  | { state: 'requesting'; count: number }
  | { state: 'rendering'; completed: number; total: number }
  | {
      state: 'ready';
      format: 'pdf' | 'png';
      count: number;
      pages: number;
      copy: 'none' | 'pending' | 'copied' | 'download-required';
      downloadFailed: boolean;
    }
  | {
      state: 'error';
      stage: 'request' | 'render';
      error: PortalClientErrorV1;
      retryable: boolean;
      retryAt: number;
    };
export type QrRendererV1 = (
  cards: PrintCardV1[],
  format: 'pdf' | 'png',
  signal: AbortSignal,
  progress: (completed: number, total: number) => void,
) => Promise<QrArtifactV1>;
const defaultRenderer: QrRendererV1 = async (cards, format, signal, progress) => {
  const render = await import('./qr-artifacts-v1');
  signal.throwIfAborted();
  return format === 'pdf'
    ? render.renderQrPdfV1(cards, signal, progress)
    : render.renderQrPngV1(cards[0]!.qr, signal);
};
/** Credentials/blobs never enter React state, errors, URLs or persistent storage. */
export function createQrOperationV1({
  client,
  publish,
  canWrite,
  render = defaultRenderer,
  now = Date.now,
  onAuthorizationLost,
}: {
  client: PortalAdminClientV1;
  publish: (state: QrOperationStateV1) => void;
  canWrite: boolean;
  render?: QrRendererV1;
  now?: () => number;
  onAuthorizationLost?: (error: PortalClientErrorV1) => void;
}) {
  let state: QrOperationStateV1 = { state: 'idle' },
    generation = 0;
  let active: AbortController | undefined;
  let prepared: ReturnType<PortalAdminClientV1['prepareCommand']> | undefined;
  let command: QrCommandV1 | undefined,
    format: 'pdf' | 'png' = 'pdf';
  let cards: PrintCardV1[] | undefined, artifact: QrArtifactV1 | undefined;
  let startedAt = 0,
    expires: ReturnType<typeof setTimeout> | undefined;
  const downloads = createQrDownloadsV1();
  function emit(next: QrOperationStateV1) {
    state = next;
    publish(next);
  }
  function clear(next: 'idle' | 'cancelled' | 'expired' = 'idle') {
    generation++;
    active?.abort();
    active = undefined;
    clearTimeout(expires);
    expires = undefined;
    prepared = command = cards = artifact = undefined;
    downloads.clear();
    emit({ state: next });
  }
  async function run() {
    if (active || (!prepared && !cards) || (state.state === 'error' && now() < state.retryAt))
      return;
    if (prepared && now() - startedAt >= 23 * 3600_000) {
      clear('expired');
      return;
    }
    const current = ++generation,
      controller = new AbortController();
    active = controller;
    let stage: 'request' | 'render' = cards ? 'render' : 'request';
    try {
      if (!cards) {
        const captured = command!;
        emit({
          state: 'requesting',
          count: captured.operation === 'qr-batch' ? captured.accountIds.length : 1,
        });
        const response = await prepared!.execute(controller.signal);
        if (current !== generation || controller.signal.aborted) return;
        if (response.state !== 'qr') throw new PortalClientErrorV1('invalid-response');
        let received: PrintCardV1[];
        try {
          received = validatePrintCardsV1(response.cards);
        } catch {
          throw new PortalClientErrorV1('invalid-response');
        }
        const ids = captured.operation === 'qr-batch' ? captured.accountIds : [captured.accountId];
        const byId = new Map(received.map((card) => [card.accountId.toLowerCase(), card]));
        if (
          received.length !== ids.length ||
          ids.some((id) => !byId.has(id.toLowerCase())) ||
          received.some(
            (card) => card.mode !== (captured.operation === 'qr-batch' ? captured.mode : 'qr-only'),
          ) ||
          response.version < captured.expectedVersion
        )
          throw new PortalClientErrorV1('invalid-response');
        cards = ids.map((id) => byId.get(id.toLowerCase())!);
        prepared = command = undefined;
        stage = 'render';
      }
      emit({ state: 'rendering', completed: 0, total: cards!.length });
      const result = await render(cards!, format, controller.signal, (completed, total) => {
        if (current === generation && !controller.signal.aborted)
          emit({ state: 'rendering', completed, total });
      });
      if (current !== generation || controller.signal.aborted) return;
      if (
        result.format !== format ||
        result.count !== cards!.length ||
        result.blob.size === 0 ||
        result.blob.type !== (format === 'pdf' ? 'application/pdf' : 'image/png')
      )
        throw new Error('artifact-unavailable');
      artifact = result;
      cards = undefined;
      emit({
        state: 'ready',
        format,
        count: result.count,
        pages: result.pages,
        copy: 'none',
        downloadFailed: false,
      });
      expires = setTimeout(() => clear('expired'), 5 * 60_000);
    } catch (error) {
      if (current !== generation || controller.signal.aborted) return;
      const failure =
        error instanceof PortalClientErrorV1 ? error : new PortalClientErrorV1('unavailable');
      if (['unauthenticated', 'forbidden'].includes(failure.state)) {
        clear();
        emit({ state: 'error', stage, error: failure, retryable: false, retryAt: 0 });
        onAuthorizationLost?.(failure);
        return;
      }
      const retryable =
        stage === 'render' ||
        ['network-error', 'invalid-response', 'unavailable', 'rate-limited'].includes(
          failure.state,
        );
      if (!retryable) prepared = command = undefined;
      emit({
        state: 'error',
        stage,
        error: failure,
        retryable,
        retryAt: now() + (failure.retryAfterSeconds ?? 0) * 1000,
      });
    } finally {
      if (current === generation) active = undefined;
    }
  }
  return {
    async submit(input: QrCommandV1, requestedFormat: 'pdf' | 'png') {
      if (!canWrite || active || prepared || cards || artifact) return;
      const parsed = adminCommandV1.safeParse(input);
      if (
        !parsed.success ||
        !['qr-issue', 'qr-reprint', 'qr-batch'].includes(parsed.data.operation) ||
        (requestedFormat === 'png' && input.operation === 'qr-batch') ||
        (requestedFormat === 'pdf' && input.operation !== 'qr-batch')
      )
        throw new PortalClientErrorV1('invalid-request');
      command = parsed.data as QrCommandV1;
      format = requestedFormat;
      prepared = client.prepareCommand(command);
      startedAt = now();
      await run();
    },
    retry: run,
    async copy() {
      if (!artifact || state.state !== 'ready' || state.copy === 'pending') return;
      const current = generation,
        ready = state;
      emit({ ...ready, copy: 'pending' });
      const result = await copyQrImageV1(artifact);
      if (current === generation) emit({ ...ready, copy: result });
    },
    download() {
      if (!artifact || state.state !== 'ready') return;
      try {
        downloads.download(artifact);
        emit({ ...state, downloadFailed: false });
      } catch {
        emit({ ...state, downloadFailed: true });
      }
    },
    cancel: () => clear('cancelled'),
    clear: () => clear(),
  };
}
