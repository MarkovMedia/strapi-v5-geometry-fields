declare module 'wkt' {
  export function parse(wkt: string): import('geojson').Geometry;
  export function stringify(geometry: import('geojson').Geometry): string;
}