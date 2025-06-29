import wkt from 'wkt';

import { getGeomFieldsFromContentType } from '../utils/getGeomFieldsFromContentType';

import type { Core } from '@strapi/strapi';
import type { Geometry } from 'geojson';

interface WktColumn {
  field: string;
  column: string;
  format: 'wkt' | 'geojson';
}

const pageActions = ['create', 'update', 'publish', 'findOne', 'findMany'];

export default ({ strapi }: { strapi: Core.Strapi }) => {
  return async (ctx: any, next: () => Promise<any>) => {
    const { uid: modelUid, action } = ctx;

    if (!pageActions.includes(action)) return next();
    if (!modelUid.startsWith('api')) return next();

    const contentType = strapi.contentTypes[modelUid];
    if (!contentType) return next();

    const tableName = contentType.info.pluralName;
    const wktColumns = getGeomFieldsFromContentType({ strapi }, modelUid);

    const result = await next();

    // === AFTER ACTION ===
    // if (action === 'create') {
    //   await create(result, tableName, wktColumns.fields);
    // }

    // if (action === 'update') {
    //   await update(result, tableName, wktColumns.fields);
    // }

    // if (action === 'publish') {
    //   await publish(result, tableName, wktColumns.fields);
    // }

    // if (action === 'findOne') {
    //   await findOne(result, tableName, wktColumns.fields);
    // }

    // if (action === 'findMany') {
    //   await findMany(result, tableName, wktColumns.fields);
    // }


    switch (action) {
      case "create":
        await create(result, tableName, wktColumns.fields);
        break;
      case "update":
        await update(result, tableName, wktColumns.fields);
        break;
      case "publish":
        await publish( result, tableName, wktColumns.fields);
        break;
      case "findOne":
        await findOne(result, tableName, wktColumns.fields);
        break;
      case "findMany":
        await findMany(result, tableName, wktColumns.fields);
        break;
    }

    return result;
  };
};

// Util function reads data from the geometry (PostGIS) column for findOne and findAll
async function getGeometryValue(
  tableName: string,
  geometryColumn: string,
  documentId: string,
  format: 'wkt' | 'geojson'
): Promise<Geometry | string | null> {
  const knex = strapi.db.connection;

  try {
    const rows = await knex(tableName)
      .select(knex.raw(`ST_AsText(${geometryColumn}) as ${geometryColumn}`))
      .where({ document_id: documentId });

    if (rows.length > 0 && rows[0][geometryColumn]) {
      const geom = format === 'wkt' ? rows[0][geometryColumn] : wkt.parse(rows[0][geometryColumn]);

      return geom;
    }
  } catch (err) {
    strapi.log.error('Failed to fetch geometry from PostGIS:', err);
  }

  return null;
}

// Overwrites the custom field with data from geometry (PostGIS) column for one item
async function findOne(result: any, tableName: string, wktColumns: WktColumn[]) {
  for (const wktColumn of wktColumns) {
    const geometryColumn = `__geom_${wktColumn.column}`;
    const geom = await getGeometryValue(
      tableName,
      geometryColumn,
      result.documentId,
      wktColumn.format
    );

    if (geom) {
       result[wktColumn.field] = wktColumn.format === 'wkt' ? { wkt: geom } : geom;    
    }
  }
}

// Overwrites the custom field with data from geometry (PostGIS) column for all items
async function findMany(result: any[], tableName, wktColumns: WktColumn[]) {
  for (const item of result) {
    for (const wktColumn of wktColumns) {
      const geometryColumn = `__geom_${wktColumn.column}`;
      const geom = await getGeometryValue(
        tableName,
        geometryColumn,
        item.documentId,
        wktColumn.format
      );

      if (geom) {
        item[wktColumn.field] = wktColumn.format === 'wkt' ? { wkt: geom } : geom;
      }
    }
  }
}

// Copies the custom field data to the geometry column on create
async function create(result: any, tableName: string, wktColumns: WktColumn[]) {
  const knex = strapi.db.connection;

  for (const wktColumn of wktColumns) {
    const geometryColumn = `__geom_${wktColumn.column}`;
    const geometry = result[wktColumn.column];

    try {
      await knex(tableName)
        .where({ id: result.id })
        .update({
          [geometryColumn]: knex.raw(
            wktColumn.format === 'wkt' ? 'ST_GeomFromText(?, 4326)' : 'ST_GeomFromGeoJSON(?)',
            [wktColumn.format === 'wkt' ? geometry.wkt : geometry]
          ),
        });
      strapi.log.info('Geometry column updated after publish');
    } catch (err) {
      strapi.log.error(`Failed to update ${geometryColumn} for ${tableName}:`, err);
    }
  }
}

// Copies the custom field data to the geometry column on update
// (with timeout to avoid lock from Strapi query) (only draft is updated)
async function update(result: any, tableName: string, wktColumns: WktColumn[]) {
  const knex = strapi.db.connection;

  for (const wktColumn of wktColumns) {
    const geometryColumn = `__geom_${wktColumn.column}`;
    const geometry = result[wktColumn.column];

    setTimeout(async () => {
      try {
        await knex(tableName)
          .where({ id: result.id })
          .update({
            [geometryColumn]: knex.raw(
              wktColumn.format === 'wkt' ? 'ST_GeomFromText(?, 4326)' : 'ST_GeomFromGeoJSON(?)',
              [wktColumn.format === 'wkt' ? geometry.wkt : geometry]
            ),
          });
        strapi.log.info('Geometry column updated after publish');
      } catch (err) {
        strapi.log.error(`Failed to update ${geometryColumn} for ${tableName}:`, err);
      }
    }, 0);
  }
}

// Copies the custom field data to the geometry column on publish
// (with timeout to avoid lock from Strapi query) (both draft and publish are updated)
async function publish(result: any, tableName: string, wktColumns: WktColumn[]) {
  const knex = strapi.db.connection;

  for (const wktColumn of wktColumns) {
    const geometryColumn = `__geom_${wktColumn.column}`;
    const geometry = result.entries[0][wktColumn.column];

    setTimeout(async () => {
      try {
        await knex(tableName)
          .where({ document_id: result.entries[0].documentId })
          .update({
            [geometryColumn]: knex.raw(
              wktColumn.format === 'wkt' ? 'ST_GeomFromText(?, 4326)' : 'ST_GeomFromGeoJSON(?)',
              [wktColumn.format === 'wkt' ? geometry.wkt : geometry]
            ),
          });
        strapi.log.info('Geometry column updated after publish');
      } catch (err) {
        strapi.log.error(`Failed to update ${geometryColumn} for ${tableName}:`, err);
      }
    }, 0);
  }
}
