import type { Core } from '@strapi/strapi';

type GeometryFieldFormat = 'wkt' | 'geojson';

interface GeometryFieldAttribute {
  customField?: string;
  options?: {
    format?: GeometryFieldFormat;
  };
  [key: string]: unknown;
}

interface ContentTypeMetadata {
  attributes: Record<string, GeometryFieldAttribute>;
}

interface GetGeomFieldsResult {
  fields: {
    field: string;
    column: string;
    format: GeometryFieldFormat;
  }[];
}

export const getGeomFieldsFromContentType = (
  { strapi }: { strapi: Core.Strapi },
  contentTypeUID: string
): GetGeomFieldsResult | null => {
  const fields: GetGeomFieldsResult['fields'] = [];

  if (!strapi.db) {
    strapi.log.warn('[PostGIS] strapi.db is undefined');
    return null;
  }

  const metadata = strapi.db.metadata.get(contentTypeUID) as ContentTypeMetadata;
  for (const [fieldName, attr] of Object.entries(metadata.attributes)) {
    if (
      typeof attr === 'object' &&
      'customField' in attr &&
      attr.customField === 'plugin::geometry-fields.geometry'
    ) {
      const columnName =
        'columnName' in attr && typeof attr.columnName === 'string' ? attr.columnName : fieldName;

      const format = attr.options?.format === 'geojson' ? 'geojson' : 'wkt';

      fields.push({
        field: fieldName,
        column: columnName,
        format,
      });
    }
  }
  return { fields };
};
