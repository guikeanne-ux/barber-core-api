import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

interface SchemaObject {
  readonly type?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly additionalProperties?: boolean;
  readonly minProperties?: number;
  readonly properties?: Record<string, SchemaObject>;
  readonly anyOf?: readonly SchemaObject[];
}

interface OpenApiDocument {
  readonly components?: {
    readonly securitySchemes?: Record<string, { readonly scheme?: string }>;
  };
  readonly paths?: Record<
    string,
    Record<
      string,
      {
        readonly parameters?: readonly { readonly name: string; readonly schema?: SchemaObject }[];
        readonly requestBody?: {
          readonly content?: {
            readonly 'application/json'?: {
              readonly schema?: SchemaObject;
            };
          };
        };
      }
    >
  >;
}

function readOpenApi(): OpenApiDocument {
  return JSON.parse(
    readFileSync(new URL('../../openapi/openapi.json', import.meta.url), 'utf8'),
  ) as OpenApiDocument;
}

function requireProperty(schema: SchemaObject, propertyName: string): SchemaObject {
  const property = schema.properties?.[propertyName];
  expect(property).toBeDefined();
  if (property === undefined) {
    throw new Error(`Missing property schema: ${propertyName}`);
  }
  return property;
}

function requireQueryParameterSchema(
  document: OpenApiDocument,
  path: string,
  method: string,
  parameterName: string,
): SchemaObject {
  const operation = document.paths?.[path]?.[method];
  expect(operation).toBeDefined();
  const parameter = operation?.parameters?.find((item) => item.name === parameterName);
  expect(parameter?.schema).toBeDefined();
  if (parameter?.schema === undefined) {
    throw new Error(
      `Missing query parameter schema: ${method.toUpperCase()} ${path} ${parameterName}`,
    );
  }
  return parameter.schema;
}

function requireRequestBodySchema(
  document: OpenApiDocument,
  path: string,
  method: string,
): SchemaObject {
  const operation = document.paths?.[path]?.[method];
  expect(operation).toBeDefined();
  const schema = operation?.requestBody?.content?.['application/json']?.schema;
  expect(schema).toBeDefined();
  if (schema === undefined) {
    throw new Error(`Missing request body schema: ${method.toUpperCase()} ${path}`);
  }
  return schema;
}

describe('versioned OpenAPI contract', () => {
  it('documents catalog text limits, integer bounds, additionalProperties, and bearer auth', () => {
    const document = readOpenApi();

    expect(document.components?.securitySchemes?.bearerAuth?.scheme).toBe('bearer');

    const createProfessional = requireRequestBodySchema(document, '/api/v1/professionals', 'post');
    expect(requireProperty(createProfessional, 'name')).toMatchObject({
      minLength: 2,
      maxLength: 120,
    });
    expect(requireProperty(createProfessional, 'bio')).toMatchObject({
      maxLength: 1000,
    });
    expect(createProfessional.additionalProperties).toBe(false);

    const updateProfessional = requireRequestBodySchema(
      document,
      '/api/v1/professionals/{professionalId}',
      'patch',
    );
    expect(requireProperty(updateProfessional, 'name')).toMatchObject({
      minLength: 2,
      maxLength: 120,
    });
    expect(requireProperty(updateProfessional, 'bio').anyOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ maxLength: 1000 }),
        expect.objectContaining({ type: 'null' }),
      ]),
    );
    expect(updateProfessional.additionalProperties).toBe(false);
    expect(updateProfessional.minProperties).toBe(1);

    const createService = requireRequestBodySchema(document, '/api/v1/services', 'post');
    expect(requireProperty(createService, 'name')).toMatchObject({
      minLength: 2,
      maxLength: 120,
    });
    expect(requireProperty(createService, 'description')).toMatchObject({
      maxLength: 1000,
    });
    expect(requireProperty(createService, 'durationMinutes')).toMatchObject({
      minimum: 5,
      maximum: 480,
    });
    expect(requireProperty(createService, 'priceCents')).toMatchObject({
      minimum: 0,
      maximum: 10_000_000,
    });
    expect(createService.additionalProperties).toBe(false);

    const updateService = requireRequestBodySchema(
      document,
      '/api/v1/services/{serviceId}',
      'patch',
    );
    expect(requireProperty(updateService, 'name')).toMatchObject({
      minLength: 2,
      maxLength: 120,
    });
    expect(requireProperty(updateService, 'description').anyOf).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ maxLength: 1000 }),
        expect.objectContaining({ type: 'null' }),
      ]),
    );
    expect(requireProperty(updateService, 'durationMinutes')).toMatchObject({
      minimum: 5,
      maximum: 480,
    });
    expect(requireProperty(updateService, 'priceCents')).toMatchObject({
      minimum: 0,
      maximum: 10_000_000,
    });
    expect(updateService.additionalProperties).toBe(false);
    expect(updateService.minProperties).toBe(1);

    const professionalListQuery = requireQueryParameterSchema(
      document,
      '/api/v1/professionals',
      'get',
      'q',
    );
    expect(professionalListQuery.maxLength).toBe(100);

    const serviceListQuery = requireQueryParameterSchema(document, '/api/v1/services', 'get', 'q');
    expect(serviceListQuery.maxLength).toBe(100);

    const nestedServiceListQuery = requireQueryParameterSchema(
      document,
      '/api/v1/professionals/{professionalId}/services',
      'get',
      'q',
    );
    expect(nestedServiceListQuery.maxLength).toBe(100);
  });
});
