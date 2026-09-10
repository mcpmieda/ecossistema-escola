import { describe, expect, it } from 'vitest';
import {
  classifyGradebookImportFailureV1,
  createGradebookImportFailureCollectorV1,
} from '../../../server/gradebook/application/import/import-failure-diagnostics-v1';
import { parseGradebookImportFailureDiagnosticV1 } from '../../../shared/gradebook-import-diagnostics-v1';
import { isGradebookD1RetryableTransientErrorV1 } from '../../../server/gradebook/persistence/d1/transaction/d1-transient-observation-v1';

const cases = [
  ['D1 DB exceeded its CPU time limit and was reset.', 'd1-cpu-limit'],
  ['Exceeded maximum DB size.', 'd1-storage-limit'],
  [
    "Your account has exceeded D1's maximum account storage limit, please contact Cloudflare to raise your limit",
    'd1-storage-limit',
  ],
  ['database or disk is full: SQLITE_FULL', 'd1-storage-limit'],
  [
    "Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    'd1-read-quota',
  ],
  [
    "Your account has exceeded D1's free tier daily row write limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.",
    'd1-write-quota',
  ],
  ['RPC message size limit exceeded', 'd1-rpc-limit'],
  ['D1_TYPE_ERROR: unsupported synthetic type', 'd1-type'],
  ['Converting circular structure to JSON', 'd1-serialization'],
  ['Invalid string length', 'd1-serialization'],
  ['Unexpected token <, synthetic response is not valid JSON', 'd1-response-invalid'],
  ['D1_ERROR: internal error', 'd1-internal'],
] as const;
describe('Previously generic D1 failure categories (#559)', () => {
  it.each(cases)('classifies %s without exposing the original message', (message, code) => {
    const cause = new Error('D1_ERROR: wrapper', {
      cause: new Error(`${message} SYNTHETIC_PRIVATE_MARKER`),
    });
    const collector = createGradebookImportFailureCollectorV1();
    collector.d1('batch', cause);
    const snapshot = collector.snapshot();
    expect(snapshot.events).toEqual([{ phase: 'd1', code, operation: 'batch' }]);
    const raw = JSON.stringify(snapshot);
    expect(raw).not.toContain('SYNTHETIC_PRIVATE_MARKER');
    expect(raw).not.toContain(message);
    expect(parseGradebookImportFailureDiagnosticV1(raw)).toEqual(snapshot);
    expect(isGradebookD1RetryableTransientErrorV1(cause)).toBe(false);
  });
  it('preserves narrow transient precedence and never guesses an unknown message', () => {
    const message = 'Internal error in D1 DB storage caused object to be reset.';
    expect(classifyGradebookImportFailureV1(new Error(message), true)).toBe('d1-transient');
    expect(isGradebookD1RetryableTransientErrorV1(new Error(message))).toBe(true);
    expect(classifyGradebookImportFailureV1(new Error('unknown synthetic error'), true)).toBe(
      'd1-other',
    );
    expect(
      parseGradebookImportFailureDiagnosticV1(
        JSON.stringify({
          version: 1,
          events: [{ phase: 'd1', operation: 'batch', code: 'SYNTHETIC_PRIVATE_MARKER' }],
        }),
      ),
    ).toBeNull();
  });
});
