# Introduction

**Store and edit geospatial data with PostGIS in a Strapi 5 custom field.**

The plugin accepts WKT (Well-known text) or GeoJSON from the API and stores it as binary (WKB).
It needs PostgreSQL as database and PostGIS installed.
You can use multiple geometry fields in multiple content types. All features are editable and draggable using the built-in Leaflet.Editable and Leaflet.Drag.

This example is a multipolygon with the boundaries of France as WKT. 

![Geometry Field example](https://raw.githubusercontent.com/MarkovMedia/strapi-plugin-geometry-fields/main/assets/geometry-fields.jpg)

## Installation

<pre> # with yarn
yarn add @gismark/strapi-geometry-fields </pre>

<pre> # with npm
npm install @gismark/strapi-geometry-fields </pre>

## Configuration

This plugin only runs with PostgreSQL and needs PostGIS to be installed. If you haven't already done so run this query in Postgres:

<pre>CREATE EXTENSION postgis;</pre>

For the Leaflet map and the markers to display you must allow Openstreetmap in your middlewares.js like so:

<pre>
  {
    name: "strapi::security",
    config: {
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "img-src": ["'self'", "data:", "*.tile.openstreetmap.org"],
          upgradeInsecureRequests: null,
        },
      },
    },
  },
</pre>

## Usage

### In the Content Type Builder

- Create a new collection type
- In the field selection, choose CUSTOM, select the Geometry field and give it a name
- Finish & Save

### In the code

Add this field to the schema.json of your content type ('geometry' can be any unique field name)

<pre>    "geometry": {
      "type": "customField",
      "customField": "plugin::geometry-fields.geometry"
    },</pre>

## Tested with

- Strapi 5.15.1
- PostgreSQL 12.4
- PostGIS 3.0.2

## License

MIT

## Todo

- Choose CRS (Coordinate Reference System) from settings 
- Create & delete features in custom field
- Click feature shows popup with geo info
- Validate WKT / GeoJSON option




