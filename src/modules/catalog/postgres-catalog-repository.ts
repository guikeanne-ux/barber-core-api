import { sql } from 'kysely';

import type { DatabaseConnection } from '../../shared/database/database.js';
import type { CatalogRepository } from './catalog-repository.js';
import type {
  BarberService,
  CatalogDatabase,
  Professional,
  ProfessionalRow,
  ServiceRow,
} from './catalog-types.js';

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    name: row.name,
    ...(row.bio !== null ? { bio: row.bio } : {}),
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapService(row: ServiceRow): BarberService {
  return {
    id: row.id,
    name: row.name,
    ...(row.description !== null ? { description: row.description } : {}),
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    currency: 'BRL',
    status: row.status,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function escapeLikePattern(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function parseCount(raw: unknown): number {
  const normalized =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'bigint'
        ? Number(raw)
        : typeof raw === 'string'
          ? Number.parseInt(raw, 10)
          : Number.NaN;

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error('Unable to parse count(*) result as a non-negative integer.');
  }

  return normalized;
}

export function createPostgresCatalogRepository(connection: DatabaseConnection): CatalogRepository {
  const db = connection.db as unknown as CatalogDatabase;

  return {
    async createProfessional(input) {
      const inserted = await db
        .insertInto('professionals')
        .values({
          id: input.id,
          name: input.name,
          bio: input.bio ?? null,
          status: 'active',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapProfessional(inserted);
    },

    async getProfessionalById(id) {
      const row = await db
        .selectFrom('professionals')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      return row ? mapProfessional(row) : undefined;
    },

    async listProfessionals(input) {
      let itemsQuery = db.selectFrom('professionals').selectAll();
      if (input.status !== 'all') {
        itemsQuery = itemsQuery.where('status', '=', input.status);
      }
      if (input.q) {
        const pattern = `%${escapeLikePattern(input.q)}%`;
        itemsQuery = itemsQuery.where(sql<boolean>`name ilike ${pattern} escape '\\'`);
      }

      const totalRow = await itemsQuery
        .clearSelect()
        .clearLimit()
        .clearOffset()
        .clearOrderBy()
        .select(sql<string>`count(*)::text`.as('count'))
        .executeTakeFirstOrThrow();
      const totalItems = parseCount(totalRow.count);
      const rows = await itemsQuery
        .orderBy('name', 'asc')
        .orderBy('id', 'asc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute();

      return {
        items: rows.map(mapProfessional),
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
      };
    },

    async updateProfessional(input) {
      const updated = await db
        .updateTable('professionals')
        .set({
          name: input.name,
          bio: input.bio ?? null,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapProfessional(updated);
    },

    async setProfessionalStatus(id, status) {
      const updated = await db
        .updateTable('professionals')
        .set({
          status,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      return updated ? mapProfessional(updated) : undefined;
    },

    async createService(input) {
      const inserted = await db
        .insertInto('services')
        .values({
          id: input.id,
          name: input.name,
          description: input.description ?? null,
          duration_minutes: input.durationMinutes,
          price_cents: input.priceCents,
          status: 'active',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapService(inserted);
    },

    async getServiceById(id) {
      const row = await db
        .selectFrom('services')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? mapService(row) : undefined;
    },

    async listServices(input) {
      let itemsQuery = db.selectFrom('services').selectAll();
      if (input.status !== 'all') {
        itemsQuery = itemsQuery.where('status', '=', input.status);
      }
      if (input.q) {
        const pattern = `%${escapeLikePattern(input.q)}%`;
        itemsQuery = itemsQuery.where(sql<boolean>`name ilike ${pattern} escape '\\'`);
      }

      const totalRow = await itemsQuery
        .clearSelect()
        .clearLimit()
        .clearOffset()
        .clearOrderBy()
        .select(sql<string>`count(*)::text`.as('count'))
        .executeTakeFirstOrThrow();
      const totalItems = parseCount(totalRow.count);
      const rows = await itemsQuery
        .orderBy('name', 'asc')
        .orderBy('id', 'asc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute();

      return {
        items: rows.map(mapService),
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
      };
    },

    async updateService(input) {
      const updated = await db
        .updateTable('services')
        .set({
          name: input.name,
          description: input.description ?? null,
          duration_minutes: input.durationMinutes,
          price_cents: input.priceCents,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', input.id)
        .returningAll()
        .executeTakeFirstOrThrow();

      return mapService(updated);
    },

    async setServiceStatus(id, status) {
      const updated = await db
        .updateTable('services')
        .set({
          status,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();

      return updated ? mapService(updated) : undefined;
    },

    async ensureProfessionalExists(id) {
      const row = await db
        .selectFrom('professionals')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();

      return row !== undefined;
    },

    async ensureServiceExists(id) {
      const row = await db
        .selectFrom('services')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      return row !== undefined;
    },

    async upsertProfessionalService(professionalId, serviceId) {
      await db
        .insertInto('professional_services')
        .values({
          professional_id: professionalId,
          service_id: serviceId,
        })
        .onConflict((oc) => oc.columns(['professional_id', 'service_id']).doNothing())
        .execute();
    },

    async removeProfessionalService(professionalId, serviceId) {
      await db
        .deleteFrom('professional_services')
        .where('professional_id', '=', professionalId)
        .where('service_id', '=', serviceId)
        .execute();
    },

    async listServicesByProfessional(professionalId, input) {
      let itemsQuery = db
        .selectFrom('services')
        .innerJoin('professional_services', 'professional_services.service_id', 'services.id')
        .select([
          'services.id',
          'services.name',
          'services.description',
          'services.duration_minutes',
          'services.price_cents',
          'services.status',
          'services.created_at',
          'services.updated_at',
        ])
        .where('professional_services.professional_id', '=', professionalId);

      if (input.status !== 'all') {
        itemsQuery = itemsQuery.where('services.status', '=', input.status);
      }
      if (input.q) {
        const pattern = `%${escapeLikePattern(input.q)}%`;
        itemsQuery = itemsQuery.where(sql<boolean>`services.name ilike ${pattern} escape '\\'`);
      }

      const totalRow = await itemsQuery
        .clearSelect()
        .clearLimit()
        .clearOffset()
        .clearOrderBy()
        .select(sql<string>`count(*)::text`.as('count'))
        .executeTakeFirstOrThrow();
      const totalItems = parseCount(totalRow.count);

      const rows = await itemsQuery
        .orderBy('services.name', 'asc')
        .orderBy('services.id', 'asc')
        .limit(input.pageSize)
        .offset((input.page - 1) * input.pageSize)
        .execute();

      return {
        items: rows.map(mapService),
        page: input.page,
        pageSize: input.pageSize,
        totalItems,
      };
    },
  };
}
