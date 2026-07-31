import { randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function resolveRequestId(headerValue: string | undefined): string {
  if (headerValue && isValidUuid(headerValue)) {
    return headerValue;
  }

  return randomUUID();
}
