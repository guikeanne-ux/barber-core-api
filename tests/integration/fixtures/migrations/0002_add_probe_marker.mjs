/**
 * @param {import('kysely').Kysely<unknown>} db
 */
export async function up(db) {
  await db.schema
    .alterTable('integration_probe')
    .addColumn('marker', 'varchar(32)', (column) => column.notNull().defaultTo('ok'))
    .execute();
}

/**
 * @param {import('kysely').Kysely<unknown>} db
 */
export async function down(db) {
  await db.schema.alterTable('integration_probe').dropColumn('marker').execute();
}
