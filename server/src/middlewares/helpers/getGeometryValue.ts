import { wktToGeoJSON } from '@terraformer/wkt';

import type { Geometry } from 'geojson';

// Util function reads data from the geometry (PostGIS) column for findOne and findAll
export async function getGeometryValue(
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
      const geom =
        format === 'wkt' ? rows[0][geometryColumn] : wktToGeoJSON(rows[0][geometryColumn]);

      return geom;
    }
  } catch (err) {
    strapi.log.error('[Geometry Fields] Failed to fetch geometry from PostGIS:', err);
  }

  return null;
}
