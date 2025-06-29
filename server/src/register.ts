import geometryMiddleware from './middlewares';

import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  // Register custom field
  strapi.customFields.register({
    name: 'geometry',
    plugin: 'geometry-fields',
    type: 'json',
  });

  // Register geometry middleware
  strapi.documents.use(geometryMiddleware({ strapi }));
};

export default register;
