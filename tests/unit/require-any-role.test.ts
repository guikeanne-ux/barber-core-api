import { describe, expect, it } from 'vitest';

import { AuthenticationProblem } from '../../src/modules/auth/authentication-errors.js';
import { requireAnyRole } from '../../src/modules/auth/require-any-role.js';

function runRequireAnyRole(
  handler: ReturnType<typeof requireAnyRole>,
  identity: {
    subject: string;
    roles: readonly string[];
  } | null,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    handler.call({} as never, { identity } as never, {} as never, (error?: Error | null) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('requireAnyRole', () => {
  it('allows access when the authenticated identity has any required role', async () => {
    await expect(
      runRequireAnyRole(requireAnyRole('manager', 'admin'), {
        subject: 'subject-1',
        roles: ['manager'],
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed when no authenticated identity is present', async () => {
    await expect(runRequireAnyRole(requireAnyRole('manager'), null)).rejects.toBeInstanceOf(
      AuthenticationProblem,
    );
    await expect(runRequireAnyRole(requireAnyRole('manager'), null)).rejects.toMatchObject({
      code: 'AUTHENTICATION_REQUIRED',
      statusCode: 401,
    });
  });

  it('returns insufficient permissions when the identity lacks the required role', async () => {
    await expect(
      runRequireAnyRole(requireAnyRole('admin'), {
        subject: 'subject-1',
        roles: ['barber'],
      }),
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSIONS',
      statusCode: 403,
    });
  });
});
