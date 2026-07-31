import {
  authenticationRequired,
  invalidAccessToken,
  type AuthenticationProblem,
} from './authentication-errors.js';

export const MAX_BEARER_TOKEN_LENGTH = 8192;

export function parseBearerToken(headerValue: string | undefined): string {
  if (headerValue === undefined) {
    throw authenticationRequired();
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    throw authenticationRequired();
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length !== 2) {
    throw invalidAccessToken();
  }

  const scheme = parts[0];
  const token = parts[1];
  if (scheme?.toLowerCase() !== 'bearer') {
    throw invalidAccessToken();
  }

  if (token === undefined || token.length === 0 || token.length > MAX_BEARER_TOKEN_LENGTH) {
    throw invalidAccessToken();
  }

  return token;
}

export function isAuthenticationProblem(error: unknown): error is AuthenticationProblem {
  return error instanceof Error && error.name === 'AuthenticationProblem';
}
