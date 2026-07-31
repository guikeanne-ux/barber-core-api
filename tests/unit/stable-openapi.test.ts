import { describe, expect, it } from 'vitest';

import { sortOpenApiDocument } from '../../src/shared/openapi/stable-openapi.js';

describe('sortOpenApiDocument', () => {
  it('sorts object keys recursively while preserving array order', () => {
    const input = {
      zeta: {
        beta: 2,
        alpha: 1,
      },
      alpha: [
        {
          beta: true,
          alpha: false,
        },
      ],
    };

    expect(sortOpenApiDocument(input)).toEqual({
      alpha: [
        {
          alpha: false,
          beta: true,
        },
      ],
      zeta: {
        alpha: 1,
        beta: 2,
      },
    });
  });
});
