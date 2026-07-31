import { describe, expect, it } from 'vitest';

import { isValidUuid, resolveRequestId } from '../../src/shared/http/request-id.js';

describe('request id helpers', () => {
  it('accepts a valid UUID', () => {
    const requestId = '7fef1a5d-7f30-4b77-a59c-7ed57546f18c';

    expect(resolveRequestId(requestId)).toBe(requestId);
    expect(isValidUuid(requestId)).toBe(true);
  });

  it('generates a UUID when absent', () => {
    const generated = resolveRequestId(undefined);

    expect(isValidUuid(generated)).toBe(true);
  });

  it('generates a UUID when invalid', () => {
    const generated = resolveRequestId('invalid-request-id');

    expect(isValidUuid(generated)).toBe(true);
    expect(generated).not.toBe('invalid-request-id');
  });
});
