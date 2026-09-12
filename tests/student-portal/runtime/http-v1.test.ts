import { describe, expect, it } from 'vitest';
import { servePortalFoundationV1 } from '../../../server/student-portal/runtime/http-v1';

describe('streamed auth body bound', () => {
  it('counts bytes without trusting Content-Length and cancels excess input', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(5000));
      },
      cancel() {
        cancelled = true;
      },
    });
    const request = new Request('https://aluno.escolaieda.com/api/student/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '2' },
      body,
      // Node's request constructor requires duplex for synthetic streams.
      ...{ duplex: 'half' },
    });
    const response = await servePortalFoundationV1(
      request,
      'production',
      'https://aluno.escolaieda.com',
    );
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
  });
});
