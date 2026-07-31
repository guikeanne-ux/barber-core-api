export type AuthenticationFailureCategory =
  | 'missing_credentials'
  | 'invalid_token'
  | 'expired_token'
  | 'not_yet_valid'
  | 'wrong_issuer'
  | 'wrong_audience'
  | 'insufficient_permissions'
  | 'jwks_unavailable'
  | 'jwks_timeout'
  | 'jwks_invalid_response';

export class AuthenticationProblem extends Error {
  readonly statusCode: 401 | 403 | 503;
  readonly type: string;
  readonly code:
    | 'AUTHENTICATION_REQUIRED'
    | 'INVALID_ACCESS_TOKEN'
    | 'INSUFFICIENT_PERMISSIONS'
    | 'IDENTITY_PROVIDER_UNAVAILABLE';
  readonly detail: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly failureCategory: AuthenticationFailureCategory;

  constructor(input: {
    message: string;
    statusCode: 401 | 403 | 503;
    type: string;
    code:
      | 'AUTHENTICATION_REQUIRED'
      | 'INVALID_ACCESS_TOKEN'
      | 'INSUFFICIENT_PERMISSIONS'
      | 'IDENTITY_PROVIDER_UNAVAILABLE';
    detail: string;
    failureCategory: AuthenticationFailureCategory;
    headers?: Readonly<Record<string, string>>;
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = 'AuthenticationProblem';
    this.statusCode = input.statusCode;
    this.type = input.type;
    this.code = input.code;
    this.detail = input.detail;
    this.failureCategory = input.failureCategory;
    if (input.headers !== undefined) {
      this.headers = input.headers;
    }
  }
}

export function authenticationRequired(): AuthenticationProblem {
  return new AuthenticationProblem({
    message: 'Authentication is required.',
    statusCode: 401,
    type: 'https://barber-platform.dev/problems/authentication-required',
    code: 'AUTHENTICATION_REQUIRED',
    detail: 'Authentication is required to access this resource.',
    failureCategory: 'missing_credentials',
    headers: {
      'www-authenticate': 'Bearer',
    },
  });
}

export function invalidAccessToken(
  failureCategory:
    | 'invalid_token'
    | 'expired_token'
    | 'not_yet_valid'
    | 'wrong_issuer'
    | 'wrong_audience' = 'invalid_token',
  cause?: unknown,
): AuthenticationProblem {
  return new AuthenticationProblem({
    message: 'The access token is invalid.',
    statusCode: 401,
    type: 'https://barber-platform.dev/problems/invalid-access-token',
    code: 'INVALID_ACCESS_TOKEN',
    detail: 'The provided access token is invalid.',
    failureCategory,
    headers: {
      'www-authenticate': 'Bearer',
    },
    cause,
  });
}

export function insufficientPermissions(): AuthenticationProblem {
  return new AuthenticationProblem({
    message: 'The authenticated principal does not have permission to access this resource.',
    statusCode: 403,
    type: 'https://barber-platform.dev/problems/insufficient-permissions',
    code: 'INSUFFICIENT_PERMISSIONS',
    detail: 'The authenticated principal does not have permission to access this resource.',
    failureCategory: 'insufficient_permissions',
  });
}

export function identityProviderUnavailable(
  failureCategory: 'jwks_unavailable' | 'jwks_timeout' | 'jwks_invalid_response',
  cause?: unknown,
): AuthenticationProblem {
  return new AuthenticationProblem({
    message: 'The identity provider is temporarily unavailable.',
    statusCode: 503,
    type: 'https://barber-platform.dev/problems/identity-provider-unavailable',
    code: 'IDENTITY_PROVIDER_UNAVAILABLE',
    detail: 'The identity provider is temporarily unavailable.',
    failureCategory,
    cause,
  });
}
