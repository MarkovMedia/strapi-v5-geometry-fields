const geometryField = {
  name: 'geometry',
  pluginId: 'geometry-fields',
  type: 'json',
  intlLabel: {
    id: 'geometry.label',
    defaultMessage: 'Geometry',
  },
  intlDescription: {
    id: 'geometry.description',
    defaultMessage: 'Stores spatial data using PostGIS',
  },
  components: {
    Input: async () => import('./components/GeometryInput'),
  },
  options: {
    base: [
      {
        sectionTitle: {
          id: 'geometry.format.section.format',
          defaultMessage: ' ',
        },
        items: [
          {
            intlLabel: {
              id: 'geometry.format.label',
              defaultMessage: 'Geometry format',
            },
            name: 'options.format',
            type: 'select',
            defaultValue: 'wkt',
            value: 'wkt',
            options: [
              {
                key: 'wkt',
                defaultValue: 'wkt',
                value: 'wkt',
                metadatas: {
                  intlLabel: {
                    id: 'geometry.format.wkt',
                    defaultMessage: 'Well-known text (WKT)',
                  },
                },
              },
              {
                key: 'geojson',
                value: 'geojson',
                metadatas: {
                  intlLabel: {
                    id: 'geometry.format.geojson',
                    defaultMessage: 'GeoJSON',
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  },
};

export default {
  register(app: any) {
    app.customFields.register(geometryField);
  },
};
