/**
 * @param {import('kysely').Kysely<unknown>} db
 */
export async function up(db) {
  await db.schema
    .createTable('integration_probe')
    .addColumn('id', 'integer', (column) => column.primaryKey())
    .execute();
}

/**
 * @param {import('kysely').Kysely<unknown>} db
 */
export async function down(db) {
  await db.schema.dropTable('integration_probe').ifExists().execute();
}
