import { startServer } from './app/start-server.js';
import { stopApplication } from './app/stop-application.js';

const application = await startServer();

const shutdown = async (signal: string): Promise<void> => {
  application.app.log.info({ signal }, 'shutdown_started');
  try {
    await stopApplication(application);
    application.app.log.info({ signal }, 'shutdown_completed');
    process.exit(0);
  } catch (error) {
    application.app.log.error({ signal, error }, 'shutdown_failed');
    process.exit(1);
  }
};

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});
