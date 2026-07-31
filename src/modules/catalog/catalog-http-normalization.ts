function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return value.trim();
}

function normalizeOptionalStringProperty(
  input: Record<string, unknown>,
  property: 'bio' | 'description' | 'q',
): void {
  const trimmed = trimString(input[property]);
  if (trimmed === undefined) {
    return;
  }

  if (trimmed.length === 0) {
    if (property === 'bio') {
      delete input.bio;
      return;
    }

    if (property === 'description') {
      delete input.description;
      return;
    }

    delete input.q;
    return;
  }

  input[property] = trimmed;
}

function normalizeRequiredStringProperty(input: Record<string, unknown>, property: 'name'): void {
  const trimmed = trimString(input[property]);
  if (trimmed === undefined) {
    return;
  }

  input[property] = trimmed;
}

function parseIntegerish(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return value;
  }

  return Number.parseInt(value, 10);
}

export function normalizeCatalogListQuery(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const query = input as Record<string, unknown>;
  query.page = parseIntegerish(query.page);
  query.pageSize = parseIntegerish(query.pageSize);
  normalizeOptionalStringProperty(query, 'q');
}

export function normalizeCreateProfessionalBody(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const body = input as Record<string, unknown>;
  normalizeRequiredStringProperty(body, 'name');
  normalizeOptionalStringProperty(body, 'bio');
}

export function normalizeUpdateProfessionalBody(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const body = input as Record<string, unknown>;
  normalizeRequiredStringProperty(body, 'name');
  normalizeOptionalStringProperty(body, 'bio');
}

export function normalizeCreateServiceBody(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const body = input as Record<string, unknown>;
  normalizeRequiredStringProperty(body, 'name');
  normalizeOptionalStringProperty(body, 'description');
}

export function normalizeUpdateServiceBody(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const body = input as Record<string, unknown>;
  normalizeRequiredStringProperty(body, 'name');
  normalizeOptionalStringProperty(body, 'description');
}
