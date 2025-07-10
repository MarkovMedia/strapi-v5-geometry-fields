import type { Core } from "@strapi/strapi";
import type { Knex } from "knex";

export const isPostgres = ({ strapi }: { strapi: Core.Strapi}): boolean => {
  return strapi.db?.config?.connection?.client === "postgres";
};

export const hasPostgis = async ({ strapi } : { strapi: Core.Strapi }) : Promise<boolean | null> => {  
  if (!strapi.db) {
    strapi.log.warn("[Geometry Fields] strapi.db is undefined");
    return null;
  }

  try {
    const knex = strapi.db.connection as Knex;
    const result = await knex.raw(`
        SELECT extname FROM pg_extension WHERE extname = 'postgis';
      `);
    return result.rows.length > 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    strapi.log.warn(
      "[Geometry Fields] Failed to check for PostGIS extension:",
      message
    );
    return false;
  }  
};
