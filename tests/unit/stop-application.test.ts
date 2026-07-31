import { describe, expect, it, vi } from 'vitest';

import type { BuiltApplication } from '../../src/app/application-types.js';
import { ShutdownTimeoutError, stopApplication } from '../../src/app/stop-application.js';

interface BuiltApplicationFixture {
  application: BuiltApplication;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  destroy: ReturnType<typeof vi.fn<() => Promise<void>>>;
}

function createBuiltApplication(
  options: {
    close?: () => Promise<void>;
    destroy?: () => Promise<void>;
    shutdownTimeoutMs?: number;
  } = {},
): BuiltApplicationFixture {
  const close = vi.fn(options.close ?? (() => Promise.resolve()));
  const destroy = vi.fn(options.destroy ?? (() => Promise.resolve()));

  return {
    close,
    destroy,
    application: {
      app: {
        close,
      },
      dependencies: {
        configuration: {
          NODE_ENV: 'test',
          HOST: '127.0.0.1',
          PORT: 3000,
          LOG_LEVEL: 'silent',
          DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
          CORS_ORIGIN: 'http://localhost:5173',
          APP_VERSION: '0.1.0',
          SHUTDOWN_TIMEOUT_MS: options.shutdownTimeoutMs ?? 50,
        },
        database: {
          db: {
            destroy,
          },
          pool: {} as never,
        },
        readinessProbe: () => Promise.resolve({ ready: true }),
      },
    } as unknown as BuiltApplication,
  };
}

describe('stopApplication', () => {
  it('closes fastify before closing database resources', async () => {
    const order: string[] = [];
    const fixture = createBuiltApplication({
      close: () => {
        order.push('fastify');
        return Promise.resolve();
      },
      destroy: () => {
        order.push('database');
        return Promise.resolve();
      },
    });

    await stopApplication(fixture.application);

    expect(order).toEqual(['fastify', 'database']);
  });

  it('is idempotent for concurrent shutdown attempts', async () => {
    let resolveClose: (() => void) | undefined;
    const fixture = createBuiltApplication({
      close: () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        }),
    });

    const first = stopApplication(fixture.application);
    const second = stopApplication(fixture.application);
    resolveClose?.();

    await Promise.all([first, second]);

    expect(fixture.close).toHaveBeenCalledTimes(1);
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
  });

  it('fails with a timeout when shutdown exceeds the configured limit', async () => {
    const fixture = createBuiltApplication({
      close: () => new Promise<void>(() => undefined),
      shutdownTimeoutMs: 10,
    });

    await expect(stopApplication(fixture.application)).rejects.toBeInstanceOf(ShutdownTimeoutError);
    expect(fixture.destroy).not.toHaveBeenCalled();
  });
});
