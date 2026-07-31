function parseIntegerish(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return value;
  }

  return Number.parseInt(value, 10);
}

export function coerceCatalogListQuery(input: unknown): void {
  if (typeof input !== 'object' || input === null) {
    return;
  }

  const query = input as { page?: unknown; pageSize?: unknown };
  query.page = parseIntegerish(query.page);
  query.pageSize = parseIntegerish(query.pageSize);
}
