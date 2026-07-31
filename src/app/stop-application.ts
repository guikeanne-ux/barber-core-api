import type { BuiltApplication } from './application-types.js';

import { closeDatabaseConnection } from '../shared/database/database.js';

export async function stopApplication(application: BuiltApplication): Promise<void> {
  await application.app.close();
  await closeDatabaseConnection(application.dependencies.database);
}
