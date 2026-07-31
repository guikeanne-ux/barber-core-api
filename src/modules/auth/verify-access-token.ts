import {
  createRemoteJWKSet,
  customFetch,
  errors,
  jwtVerify,
  type FetchImplementation,
  type JWTPayload,
} from 'jose';

import type { OidcConfiguration } from '../../app/configuration/configuration-schema.js';
import type { AuthenticatedPrincipal, BarberRole } from './authenticated-principal.js';
import { BARBER_ROLES, isBarberRole } from './authenticated-principal.js';
import {
  AuthenticationProblem,
  identityProviderUnavailable,
  invalidAccessToken,
} from './authentication-errors.js';

const ALLOWED_ALGORITHMS = ['RS256'] as const;
const KNOWN_NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET',
]);

export type VerifyAccessToken = (token: string) => Promise<AuthenticatedPrincipal>;

export interface AccessTokenVerifierOptions {
  readonly cooldownDurationMs?: number;
  readonly cacheMaxAgeMs?: number;
  readonly fetchImplementation?: FetchImplementation;
}

type JwksOperationalFailureCategory = 'timeout' | 'network' | 'http' | 'invalid-response';

class IdentityProviderUnavailableError extends Error {
  readonly category: JwksOperationalFailureCategory;

  constructor(category: JwksOperationalFailureCategory, cause?: unknown) {
    super('The identity provider is temporarily unavailable.', cause ? { cause } : undefined);
    this.name = 'IdentityProviderUnavailableError';
    this.category = category;
  }
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const { code } = error as { code?: unknown };
  return typeof code === 'string' ? code : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: unknown }).name === 'AbortError';
}

function isKnownNetworkError(error: unknown): boolean {
  const errorCode = readErrorCode(error);
  if (errorCode && KNOWN_NETWORK_ERROR_CODES.has(errorCode)) {
    return true;
  }

  if (typeof error !== 'object' || error === null || !('cause' in error)) {
    return false;
  }

  return isKnownNetworkError((error as { cause?: unknown }).cause);
}

function createJwksFetch(
  fetchImplementation: FetchImplementation = globalThis.fetch,
): FetchImplementation {
  return async (url, init) => {
    let response: Response;

    try {
      response = await fetchImplementation(url, init);
    } catch (error) {
      if (isAbortError(error) || init.signal.aborted) {
        throw new IdentityProviderUnavailableError('timeout', error);
      }

      if (isKnownNetworkError(error)) {
        throw new IdentityProviderUnavailableError('network', error);
      }

      throw error;
    }

    if (!response.ok) {
      throw new IdentityProviderUnavailableError('http');
    }

    let parsed: unknown;

    try {
      parsed = await response.clone().json();
    } catch (error) {
      throw new IdentityProviderUnavailableError('invalid-response', error);
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('keys' in parsed) ||
      !Array.isArray((parsed as { keys?: unknown }).keys)
    ) {
      throw new IdentityProviderUnavailableError('invalid-response');
    }

    return response;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRolesFromPayload(payload: JWTPayload, audience: string): readonly BarberRole[] {
  const resourceAccess = payload.resource_access;
  if (resourceAccess === undefined) {
    return [];
  }

  if (!isRecord(resourceAccess)) {
    throw invalidAccessToken();
  }

  const clientAccess = resourceAccess[audience];
  if (clientAccess === undefined) {
    return [];
  }

  if (!isRecord(clientAccess)) {
    throw invalidAccessToken();
  }

  const roles = clientAccess.roles;
  if (roles === undefined) {
    return [];
  }

  if (!Array.isArray(roles) || roles.some((role) => typeof role !== 'string')) {
    throw invalidAccessToken();
  }

  const roleValues = roles as string[];
  const acceptedRoles = new Set(
    roleValues.filter((role): role is BarberRole => isBarberRole(role)),
  );
  return BARBER_ROLES.filter((role) => acceptedRoles.has(role));
}

function mapPayloadToPrincipal(payload: JWTPayload, audience: string): AuthenticatedPrincipal {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw invalidAccessToken();
  }

  if (payload.iat !== undefined && typeof payload.iat !== 'number') {
    throw invalidAccessToken();
  }

  const username = readOptionalString(payload.preferred_username);
  const email = readOptionalString(payload.email);

  const principal: AuthenticatedPrincipal = {
    subject: payload.sub,
    roles: readRolesFromPayload(payload, audience),
  };

  if (username !== undefined) {
    Object.assign(principal, { username });
  }

  if (email !== undefined) {
    Object.assign(principal, { email });
  }

  return principal;
}

function toAuthenticationProblemOrThrow(error: unknown): AuthenticationProblem {
  if (error instanceof AuthenticationProblem) {
    return error;
  }

  if (error instanceof IdentityProviderUnavailableError) {
    if (error.category === 'timeout') {
      return identityProviderUnavailable('jwks_timeout', error);
    }

    if (error.category === 'network') {
      return identityProviderUnavailable('jwks_unavailable', error);
    }

    return identityProviderUnavailable('jwks_invalid_response', error);
  }

  if (error instanceof errors.JWKSTimeout) {
    return identityProviderUnavailable('jwks_timeout', error);
  }

  if (error instanceof errors.JWKSMultipleMatchingKeys || error instanceof errors.JWKSInvalid) {
    return identityProviderUnavailable('jwks_invalid_response', error);
  }

  if (error instanceof errors.JWKSNoMatchingKey) {
    return invalidAccessToken('invalid_token', error);
  }

  if (error instanceof errors.JWTExpired) {
    return invalidAccessToken('expired_token', error);
  }

  if (error instanceof errors.JWTClaimValidationFailed) {
    if (error.claim === 'iss') {
      return invalidAccessToken('wrong_issuer', error);
    }

    if (error.claim === 'aud') {
      return invalidAccessToken('wrong_audience', error);
    }

    if (error.claim === 'nbf') {
      return invalidAccessToken('not_yet_valid', error);
    }

    return invalidAccessToken('invalid_token', error);
  }

  if (
    error instanceof errors.JOSEAlgNotAllowed ||
    error instanceof errors.JOSENotSupported ||
    error instanceof errors.JWSInvalid ||
    error instanceof errors.JWSSignatureVerificationFailed ||
    error instanceof errors.JWTInvalid ||
    error instanceof errors.JWKInvalid
  ) {
    return invalidAccessToken('invalid_token', error);
  }

  throw error;
}

export function createVerifyAccessToken(
  configuration: Pick<
    OidcConfiguration,
    | 'OIDC_ISSUER_URL'
    | 'OIDC_JWKS_URL'
    | 'OIDC_AUDIENCE'
    | 'OIDC_CLOCK_TOLERANCE_SECONDS'
    | 'OIDC_JWKS_TIMEOUT_MS'
  >,
  options: Readonly<AccessTokenVerifierOptions> = {},
): VerifyAccessToken {
  const jwks = createRemoteJWKSet(new URL(configuration.OIDC_JWKS_URL), {
    timeoutDuration: configuration.OIDC_JWKS_TIMEOUT_MS,
    ...(options.cooldownDurationMs !== undefined
      ? { cooldownDuration: options.cooldownDurationMs }
      : {}),
    ...(options.cacheMaxAgeMs !== undefined ? { cacheMaxAge: options.cacheMaxAgeMs } : {}),
    [customFetch]: createJwksFetch(options.fetchImplementation),
  });

  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: configuration.OIDC_ISSUER_URL,
        audience: configuration.OIDC_AUDIENCE,
        algorithms: [...ALLOWED_ALGORITHMS],
        clockTolerance: configuration.OIDC_CLOCK_TOLERANCE_SECONDS,
      });

      return mapPayloadToPrincipal(payload, configuration.OIDC_AUDIENCE);
    } catch (error) {
      throw toAuthenticationProblemOrThrow(error);
    }
  };
}
