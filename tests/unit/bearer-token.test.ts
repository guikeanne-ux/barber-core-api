import { describe, expect, it } from 'vitest';

import { parseBearerToken } from '../../src/modules/auth/bearer-token.js';
import { AuthenticationProblem } from '../../src/modules/auth/authentication-errors.js';

describe('parseBearerToken', () => {
  it('returns the token for a valid bearer header', () => {
    expect(parseBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
  });

  it('accepts case-insensitive bearer scheme', () => {
    expect(parseBearerToken('bearer abc')).toBe('abc');
  });

  it('throws authentication required when the header is absent', () => {
    expect(() => parseBearerToken(undefined)).toThrow(AuthenticationProblem);
    expect(() => parseBearerToken(undefined)).toThrow(/Authentication is required/);
  });

  it('throws authentication required when the header is empty', () => {
    expect(() => parseBearerToken('   ')).toThrow(/Authentication is required/);
  });

  it('rejects the wrong scheme', () => {
    expect(() => parseBearerToken('Basic abc')).toThrow(/access token is invalid/i);
  });

  it('rejects malformed bearer values', () => {
    expect(() => parseBearerToken('Bearer')).toThrow(/access token is invalid/i);
    expect(() => parseBearerToken('Bearer too many parts here')).toThrow(
      /access token is invalid/i,
    );
  });

  it('rejects oversized tokens', () => {
    expect(() => parseBearerToken(`Bearer ${'a'.repeat(8193)}`)).toThrow(
      /access token is invalid/i,
    );
  });
});
