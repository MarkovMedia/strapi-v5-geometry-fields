import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    editable?: boolean;
  }

  interface Map {
    editTools?: any;
  }
}