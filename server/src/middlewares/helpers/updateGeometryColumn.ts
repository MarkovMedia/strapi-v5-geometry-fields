import { validateGeometry } from "./validateGeometry";

export async function updateGeometryColumn({
  knex,
  tableName,
  idField,
  idValue,
  column,
  format,
  geometry,
}: {
  knex: any;
  tableName: string;
  idField: string;
  idValue: string | number;
  column: string;
  format: 'wkt' | 'geojson';
  geometry: any;
}) {
  const geometryColumn = `__geom_${column}`;

  if (!validateGeometry(geometry, format, geometryColumn, tableName)) {
    return;
  }

  try {
    await knex(tableName)
      .where({ [idField]: idValue })
      .update({
        [geometryColumn]: knex.raw(
          format === 'wkt' ? 'ST_GeomFromText(?, 4326)' : 'ST_GeomFromGeoJSON(?)',
          [format === 'wkt' ? geometry.wkt : geometry]
        ),
      });
  } catch (err) {
    strapi.log.error(`[Geometry Fields] ${geometryColumn} for ${tableName} not updated: `, err);
  }
}