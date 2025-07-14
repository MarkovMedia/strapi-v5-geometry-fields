export function validateGeometry(geometry: any, format: 'wkt' | 'geojson', geometryColumn: string, tableName: string): boolean {
  if (format === 'wkt') {
    if (
      !geometry ||
      typeof geometry !== 'object' ||
      typeof geometry.wkt !== 'string'
    ) {
      strapi.log.error(`[Geometry Fields] Invalid WKT! ${geometryColumn} for ${tableName} not updated.`);
      return false;
    }
  } else if (format === 'geojson') {
    if (
      !geometry ||
      typeof geometry !== 'object' ||
      typeof geometry.type !== 'string'
     
    ) {
      strapi.log.error(`[Geometry Fields] Invalid GeoJSON! ${geometryColumn} for ${tableName} not updated.`);
      return false;
    }
  }

  return true;
}