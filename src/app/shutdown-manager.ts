import { setTimeout as sleep } from 'node:timers/promises';

import type { BuiltApplication } from './application-types.js';
import { stopApplication, ShutdownTimeoutError } from './stop-application.js';

export type ShutdownSignal = 'SIGINT' | 'SIGTERM';

export interface ShutdownProcessController {
  exitCode?: number;
  once(event: ShutdownSignal, listener: () => void): void;
}

export interface ShutdownManagerOptions {
  readonly application: BuiltApplication;
  readonly processController?: ShutdownProcessController;
  readonly forceExit?: (code: number) => never;
  readonly stop?: typeof stopApplication;
  readonly flushDelayMs?: number;
  readonly sleep?: (delayMs: number) => Promise<unknown>;
}

export interface ShutdownManager {
  registerSignalHandlers(): void;
  shutdown(signal: ShutdownSignal): Promise<void>;
}

export function createShutdownManager(options: ShutdownManagerOptions): ShutdownManager {
  const processController = options.processController ?? process;
  const stop = options.stop ?? stopApplication;
  const flush = options.sleep ?? sleep;
  const forceExit = options.forceExit ?? ((code: number): never => process.exit(code));
  const flushDelayMs = options.flushDelayMs ?? 50;

  let shutdownPromise: Promise<void> | undefined;

  async function shutdown(signal: ShutdownSignal): Promise<void> {
    if (shutdownPromise) {
      options.application.app.log.warn({ signal }, 'shutdown_already_in_progress');
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      options.application.app.log.info(
        {
          signal,
          timeoutMs: options.application.dependencies.configuration.SHUTDOWN_TIMEOUT_MS,
        },
        'shutdown_started',
      );

      try {
        await stop(options.application, {
          timeoutMs: options.application.dependencies.configuration.SHUTDOWN_TIMEOUT_MS,
        });
        processController.exitCode = 0;
        options.application.app.log.info({ signal }, 'shutdown_completed');
      } catch (error) {
        processController.exitCode = 1;

        if (error instanceof ShutdownTimeoutError) {
          options.application.app.log.error(
            {
              signal,
              timeoutMs: error.timeoutMs,
              error,
            },
            'shutdown_timed_out',
          );

          await flush(flushDelayMs);
          forceExit(1);
        }

        options.application.app.log.error({ signal, error }, 'shutdown_failed');
      }
    })();

    return shutdownPromise;
  }

  return {
    registerSignalHandlers() {
      processController.once('SIGINT', () => {
        void shutdown('SIGINT');
      });

      processController.once('SIGTERM', () => {
        void shutdown('SIGTERM');
      });
    },
    shutdown,
  };
}
