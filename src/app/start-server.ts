import type { BuiltApplication } from './application-types.js';

import { createDependencies } from './create-dependencies.js';
import { buildApplication } from './build-application.js';
import { loadConfiguration } from './configuration/load-config.js';

export async function startServer(): Promise<BuiltApplication> {
  const configuration = loadConfiguration();
  const dependencies = createDependencies(configuration);
  const application = await buildApplication(dependencies);

  await application.app.listen({
    host: configuration.HOST,
    port: configuration.PORT,
  });

  application.app.log.info(
    {
      host: configuration.HOST,
      port: configuration.PORT,
      appVersion: configuration.APP_VERSION,
      environment: configuration.NODE_ENV,
    },
    'server_started',
  );

  return application;
}
