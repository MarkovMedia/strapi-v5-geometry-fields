import fs from "fs";
import path from "path";

import { isPostgres, hasPostgis } from "./utils/dbChecks";
import { getGeomFieldsFromContentType } from "./utils/getGeomFieldsFromContentType";

import type { Core } from "@strapi/strapi";
import type { Knex } from "knex";

// Type for result of EXISTS query
type ExistsResult = {
  rows: Array<{ exists: boolean }>;
};

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  if (!isPostgres({ strapi })) {
    strapi.log.warn("[PostGIS] Skipping migration: not using PostgreSQL");
    return;
  }

  if (!(await hasPostgis({ strapi }))) {
    strapi.log.warn("[PostGIS] Skipping migration: PostGIS extension not found");
    return;
  }

  const appRoot = strapi.dirs.app.root;

  const contentTypesDir = fs.existsSync(path.join(appRoot, "src", "api"))
    ? path.join(appRoot, "src", "api")
    : path.join(appRoot, "api");

  if (!fs.existsSync(contentTypesDir)) return;

  const apiDirs = fs.readdirSync(contentTypesDir);

  for (const apiName of apiDirs) {
    const schemaPath = path.join(
      contentTypesDir,
      apiName,
      "content-types",
      apiName,
      "schema.json"
    );

    if (!fs.existsSync(schemaPath)) continue;

    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
    const contentTypeName: string = schema.info.singularName;
    const tableName: string = schema.info.pluralName;

    const contentTypeInfo = getGeomFieldsFromContentType(
      { strapi },
      `api::${contentTypeName}.${contentTypeName}`
    );

    const knex = strapi.db.connection as Knex;
    const wktColumns = contentTypeInfo.fields;
    const existingGeometryColumns: string[] = [];

    for (const wktColumn of wktColumns) {
      const geometryColumn = `__geom_${wktColumn.column}`;

      const existsQuery = `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = ? AND column_name = ?
        ) AS exists;
      `;

      const result = (await knex.raw(existsQuery, [tableName, geometryColumn])) as ExistsResult;
      const exists = result.rows[0]?.exists ?? false;

      if (!exists) {
        strapi.log.info(
          `Column "${geometryColumn}" does not exist on "${tableName}". Creating it...`
        );
        await knex.raw(`ALTER TABLE ?? ADD COLUMN ?? geometry`, [
          tableName,
          geometryColumn
        ]);
        strapi.log.info(`Column "${geometryColumn}" successfully created! 🎉`);
      } else {
        strapi.log.info(
          `Column "${geometryColumn}" already exists on "${tableName}", no action needed.`
        );
      }

      existingGeometryColumns.push(geometryColumn);
    }

    // Remove stale geometry columns
    try {
      const allColumns = await knex("information_schema.columns")
        .select("column_name")
        .where({ table_name: tableName });

      const foundGeometryColumns = allColumns
        .map((c) => c.column_name)
        .filter((name) => name.startsWith("__geom_"));

      const staleColumns = foundGeometryColumns.filter(
        (col) => !existingGeometryColumns.includes(col)
      );

      for (const staleColumn of staleColumns) {
        strapi.log.info(
          `Found obsolete geometry column "${staleColumn}" on "${tableName}". Dropping it...`
        );
        await knex.raw(`ALTER TABLE ?? DROP COLUMN ??`, [
          tableName,
          staleColumn
        ]);
        strapi.log.info(`Column "${staleColumn}" dropped.`);
      }
    } catch (err) {
      strapi.log.error(
        `Error checking for stale columns in table "${tableName}":`,
        err
      );
    }
  }
};

export default bootstrap;
