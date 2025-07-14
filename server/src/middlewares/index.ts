import { getGeomFieldsFromContentType } from '../utils/getGeomFieldsFromContentType';
import { updateGeometryColumn } from './helpers/updateGeometryColumn';
import { getGeometryValue } from './helpers/getGeometryValue';

import type { Core } from '@strapi/strapi';

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

    switch (action) {
      case 'create':
        await create(result, tableName, wktColumns.fields);
        break;
      case 'update':
        await update(result, tableName, wktColumns.fields);
        break;
      case 'publish':
        await publish(result, tableName, wktColumns.fields);
        break;
      case 'findOne':
        await findOne(result, tableName, wktColumns.fields);
        break;
      case 'findMany':
        await findMany(result, tableName, wktColumns.fields);
        break;
    }

    return result;
  };
};

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

  for (const { column, format } of wktColumns) {
    const geometry = result[column];

    await updateGeometryColumn({
      knex,
      tableName,
      idField: 'document_id',
      idValue: result.documentId,
      column,
      format,
      geometry,
    });
  }
}

// Copies the custom field data to the geometry column on update
// with timeout to avoid lock from Strapi query
async function update(result: any, tableName: string, wktColumns: WktColumn[]) {
  const knex = strapi.db.connection;

  for (const { column, format } of wktColumns) {
    const geometry = result[column];

    setTimeout(() => {
      updateGeometryColumn({
        knex,
        tableName,
        idField: 'id',
        idValue: result.id,
        column,
        format,
        geometry,
      });
    }, 0);
  }
}

// Copies the custom field data to the geometry column on publish
// (with timeout to avoid lock from Strapi query) (both draft and publish are updated)
async function publish(result: any, tableName: string, wktColumns: WktColumn[]) {
  const knex = strapi.db.connection;
  const entry = result.entries[0];

  for (const { column, format } of wktColumns) {
    const geometry = entry[column];

    setTimeout(() => {
      updateGeometryColumn({
        knex,
        tableName,
        idField: 'document_id',
        idValue: entry.documentId,
        column,
        format,
        geometry,
      });
    }, 0);
  }
}
