export function sortOpenApiDocument(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortOpenApiDocument(item));
  }

  if (value && typeof value === 'object') {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortOpenApiDocument(child)] as const);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}
