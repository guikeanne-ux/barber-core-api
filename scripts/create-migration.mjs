import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const migrationName = process.argv[2];

if (!migrationName) {
  console.error('Usage: npm run db:migration:create -- <migration-name>');
  process.exit(1);
}

const sanitized = migrationName
  .trim()
  .replace(/\s+/g, '-')
  .replace(/[^a-zA-Z0-9-_]/g, '');
const timestamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, '')
  .slice(0, 14);
const fileName = `${timestamp}_${sanitized}.mjs`;
const targetPath = path.resolve('migrations', fileName);

await mkdir(path.dirname(targetPath), { recursive: true });
await writeFile(
  targetPath,
  `export async function up(db) {\n  // TODO: add migration logic.\n}\n\nexport async function down(db) {\n  // TODO: add rollback logic.\n}\n`,
  'utf8',
);

console.log(`Created migration ${targetPath}`);
