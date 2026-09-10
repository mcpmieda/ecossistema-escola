import { describe, expect, it } from 'vitest';
import { GRADEBOOK_D1_IMPORT_BULK_LIMITS_V1 } from '../../../server/gradebook/persistence/d1/transaction/d1-import-bootstrap-bulk-write-v1';

describe('D1 import bulk statement limits', () => {
  it('keeps every set-based JSON statement well below the D1 payload ceiling', () => {
    expect(GRADEBOOK_D1_IMPORT_BULK_LIMITS_V1).toEqual({
      maxJsonBytes: 512 * 1024,
      maxRowsPerChunk: 1000,
    });
  });
});
