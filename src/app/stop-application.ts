import type { BuiltApplication } from './application-types.js';

import { closeDatabaseConnection } from '../shared/database/database.js';

export class ShutdownTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`Application shutdown exceeded ${String(timeoutMs)}ms.`);
    this.name = 'ShutdownTimeoutError';
  }
}

export interface StopApplicationOptions {
  readonly timeoutMs?: number;
}

const shutdownOperations = new WeakMap<BuiltApplication, Promise<void>>();

export async function stopApplication(
  application: BuiltApplication,
  options: Readonly<StopApplicationOptions> = {},
): Promise<void> {
  const existingOperation = shutdownOperations.get(application);
  if (existingOperation) {
    return existingOperation;
  }

  const timeoutMs = options.timeoutMs ?? application.dependencies.configuration.SHUTDOWN_TIMEOUT_MS;

  const operation = (async () => {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new ShutdownTimeoutError(timeoutMs));
      }, timeoutMs);
      timeoutHandle.unref();
    });

    try {
      await Promise.race([
        (async () => {
          await application.app.close();
          await closeDatabaseConnection(application.dependencies.database);
        })(),
        timeoutPromise,
      ]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  })();

  shutdownOperations.set(application, operation);
  return operation;
}
