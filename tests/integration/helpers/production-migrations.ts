import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const productionMigrationsPath = path.resolve(currentDir, '../../../migrations');
