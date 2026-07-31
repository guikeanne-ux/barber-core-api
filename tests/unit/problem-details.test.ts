import { describe, expect, it } from 'vitest';

import { createProblemDetails } from '../../src/shared/errors/problem-details.js';

describe('createProblemDetails', () => {
  it('creates a sanitized problem details payload', () => {
    const problem = createProblemDetails(
      {
        id: '7fef1a5d-7f30-4b77-a59c-7ed57546f18c',
        url: '/api/v1/example',
      },
      {
        type: 'https://barber-platform.dev/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        code: 'INTERNAL_ERROR',
      },
    );

    expect(problem.requestId).toBe('7fef1a5d-7f30-4b77-a59c-7ed57546f18c');
    expect(problem.instance).toBe('/api/v1/example');
  });
});
