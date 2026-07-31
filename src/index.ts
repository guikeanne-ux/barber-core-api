import { startServer } from './app/start-server.js';
import { createShutdownManager } from './app/shutdown-manager.js';

const application = await startServer();
createShutdownManager({
  application,
}).registerSignalHandlers();
