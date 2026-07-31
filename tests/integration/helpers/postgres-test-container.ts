import { setTimeout as sleep } from 'node:timers/promises';

import { Client } from 'pg';
import { GenericContainer, Wait } from 'testcontainers';

async function waitForPostgres(databaseUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });

    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await sleep(500);
    }
  }

  throw new Error('PostgreSQL test container did not become ready in time.');
}

export async function startPostgresTestContainer() {
  const credentials = {
    database: 'barber_core_api_test',
    username: 'barber',
    password: 'barber',
  };

  const container = await new GenericContainer('postgres:18.4-bookworm')
    .withEnvironment({
      POSTGRES_DB: credentials.database,
      POSTGRES_USER: credentials.username,
      POSTGRES_PASSWORD: credentials.password,
    })
    .withExposedPorts(5432)
    .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  const databaseUrl = `postgresql://${credentials.username}:${credentials.password}@${host}:${String(port)}/${credentials.database}`;

  await waitForPostgres(databaseUrl);

  return {
    container,
    databaseUrl,
  };
}
