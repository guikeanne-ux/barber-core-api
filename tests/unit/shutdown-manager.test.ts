import { describe, expect, it, vi } from 'vitest';

import type { BuiltApplication } from '../../src/app/application-types.js';
import {
  createShutdownManager,
  type ShutdownProcessController,
} from '../../src/app/shutdown-manager.js';
import { ShutdownTimeoutError } from '../../src/app/stop-application.js';

function createBuiltApplication(): BuiltApplication {
  return {
    app: {
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      },
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
        SHUTDOWN_TIMEOUT_MS: 25,
      },
      database: {
        db: {
          destroy: vi.fn(),
        },
        pool: {} as never,
      },
      readinessProbe: () => Promise.resolve({ ready: true }),
    },
  } as unknown as BuiltApplication;
}

function createProcessController(): ShutdownProcessController & {
  handlers: Partial<Record<'SIGINT' | 'SIGTERM', () => void>>;
} {
  const handlers: Partial<Record<'SIGINT' | 'SIGTERM', () => void>> = {};

  return {
    handlers,
    once(event, listener) {
      handlers[event] = listener;
    },
  };
}

describe('createShutdownManager', () => {
  it('registers SIGINT and SIGTERM handlers', () => {
    const application = createBuiltApplication();
    const processController = createProcessController();

    createShutdownManager({
      application,
      processController,
    }).registerSignalHandlers();

    expect(processController.handlers.SIGINT).toBeTypeOf('function');
    expect(processController.handlers.SIGTERM).toBeTypeOf('function');
  });

  it('sets exitCode 0 on successful shutdown without forcing exit', async () => {
    const application = createBuiltApplication();
    const processController = createProcessController();
    const stop = vi.fn().mockResolvedValue(undefined);
    const forceExit = vi.fn();

    const manager = createShutdownManager({
      application,
      processController,
      stop,
      forceExit: forceExit as never,
    });

    await manager.shutdown('SIGTERM');

    expect(stop).toHaveBeenCalledTimes(1);
    expect(processController.exitCode).toBe(0);
    expect(forceExit).not.toHaveBeenCalled();
  });

  it('reuses the same shutdown operation when signals arrive in sequence', async () => {
    const application = createBuiltApplication();
    const processController = createProcessController();
    let resolveStop: (() => void) | undefined;
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveStop = resolve;
        }),
    );

    const manager = createShutdownManager({
      application,
      processController,
      stop,
    });

    const first = manager.shutdown('SIGTERM');
    const second = manager.shutdown('SIGINT');
    resolveStop?.();

    await Promise.all([first, second]);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(application.app.log.warn).toHaveBeenCalledWith(
      { signal: 'SIGINT' },
      'shutdown_already_in_progress',
    );
  });

  it('sets non-zero exitCode when shutdown fails', async () => {
    const application = createBuiltApplication();
    const processController = createProcessController();
    const stop = vi.fn().mockRejectedValue(new Error('close failed'));

    const manager = createShutdownManager({
      application,
      processController,
      stop,
    });

    await manager.shutdown('SIGTERM');

    expect(processController.exitCode).toBe(1);
    expect(application.app.log.error).toHaveBeenCalled();
  });

  it('forces exit after timeout only after marking failure', async () => {
    const application = createBuiltApplication();
    const processController = createProcessController();
    const stop = vi.fn().mockRejectedValue(new ShutdownTimeoutError(25));
    const forceExit = vi.fn();
    const sleep = vi.fn().mockResolvedValue(undefined);

    const manager = createShutdownManager({
      application,
      processController,
      stop,
      sleep,
      flushDelayMs: 1,
      forceExit: forceExit as never,
    });

    await manager.shutdown('SIGTERM');

    expect(processController.exitCode).toBe(1);
    expect(sleep).toHaveBeenCalledWith(1);
    expect(forceExit).toHaveBeenCalledWith(1);
  });
});
