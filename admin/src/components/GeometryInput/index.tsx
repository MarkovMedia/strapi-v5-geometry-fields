import React, { useState, useEffect, useRef } from 'react';
import { Field } from '@strapi/design-system';
import { parse as parseWkt, stringify } from 'wkt';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../../lib/Leaflet.Editable';
import '../../lib/Path.Drag';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Types
import type {
  Geometry,
  GeometryCollection,
  Point,
  LineString,
  Polygon,
  MultiPoint,
  MultiLineString,
  MultiPolygon,
  Position,
} from 'geojson';

interface GeometryInputProps {
  name: string;
  value: any;
  onChange: (event: { target: { name: string; value: any } }) => void;
  attribute: {
    options?: {
      format?: 'wkt' | 'geojson';
    };
  };
  intlLabel?: {
    id: string;
    defaultMessage: string;
  };
  required?: boolean;
  error?: string;
  description?: {
    id?: string;
    defaultMessage?: string;
  };
}

function closeRing(coords: Position[]): Position[] {
  const first = coords[0];
  const last = coords[coords.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return [...coords, [...first] as Position];
  }
  return coords;
}

// function closePolygonRing(coords: Position[][]): Position[][] {
//   return coords.map((ring) => closeRing(ring));
// }

function normalizePolygonLatLngs(latlngs: any): Position[][][] {
  function toClosedRing(latlngArr: { lat: number; lng: number }[]): Position[] {
    const ring = latlngArr.map(({ lat, lng }) => [lng, lat] as Position);
    return closeRing(ring);
  }

  if (Array.isArray(latlngs[0]) && Array.isArray(latlngs[0][0])) {
    return latlngs.map((polygon: any) => polygon.map(toClosedRing));
  }
  if (Array.isArray(latlngs[0])) {
    return [[...latlngs.map(toClosedRing)]];
  }
  return [[toClosedRing(latlngs)]];
}

const GeometryInput: React.FC<GeometryInputProps> = ({
  name,
  value,
  onChange,
  attribute,
  intlLabel,
  required,
  error,
  description,
}) => {
  const mapRef = useRef<L.Map | null>(null);
  const boundsFitted = useRef<boolean>(false);
  const mapId = `map-${name}`;
  const format = attribute.options?.format || 'wkt';
  const [center, setCenter] = useState<[number, number]>([40, 0]);
  const [zoom, setZoom] = useState<number>(2);

  const parseGeometry = (value: any): Geometry | GeometryCollection | null | undefined => {
    if (!value || value === 'null' || Object.keys(value).length === 0) return null;
    try {
      if (format === 'geojson') {
        return value;
      } else if (format === 'wkt') {
        const wkt = parseWkt(value.wkt);
        return wkt;
      }
    } catch (error) {
      console.error('Failed to parse WKT:', value, error);
      return null;
    }
  };

  useEffect(() => {
    const container = L.DomUtil.get(mapId);

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    if (container && (container as any)._leaflet_id) {
      (container as any)._leaflet_id = null;
    }

    if (container) {
      const map = L.map(container as HTMLElement, {
        center,
        zoom,
        editable: true,
      });

      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18,
      }).addTo(map);

      let updatedGeometries: Geometry[] = [];
      const allBounds: L.LatLngBounds[] = [];
      const geojson = parseGeometry(value);

      if (geojson) {
        if (geojson.type === 'GeometryCollection') {
          geojson.geometries.forEach((geometry, index) => {
            let layer: L.Layer;
            updatedGeometries[index] = geometry; // keep original shape unless updated below

            if (geometry.type === 'Point') {
              const latlng: [number, number] = geometry.coordinates.slice().reverse() as [
                number,
                number,
              ];
              const marker = L.marker(latlng, { draggable: true }).addTo(map);
              layer = marker;

              marker.on('dragend', () => {
                const pos = marker.getLatLng();
                updatedGeometries[index] = {
                  type: 'Point',
                  coordinates: [pos.lng, pos.lat],
                } as Point;

                triggerUpdate(
                  { type: 'GeometryCollection', geometries: updatedGeometries },
                  'GeometryCollection'
                );
              });

              allBounds.push(L.latLngBounds(latlng, latlng));
            } else if (geometry.type === 'LineString') {
              const latlngs: L.LatLngTuple[] = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
              const polyline = L.polyline(latlngs).addTo(map);
              (polyline as any).enableEdit();
              layer = polyline;

              polyline.on('dragend', () => {
                const updatedGeoJSON = polyline.toGeoJSON();
                updatedGeometries[index] = {
                  type: 'LineString',
                  coordinates: (updatedGeoJSON.geometry as LineString).coordinates,
                };

                triggerUpdate(
                  { type: 'GeometryCollection', geometries: updatedGeometries },
                  'GeometryCollection'
                );
              });

              polyline.on('editable:vertex:dragend', () => {
                const coords: Position[] = (polyline.getLatLngs() as L.LatLng[]).map(
                  ({ lat, lng }) => [lng, lat]
                );
                updatedGeometries[index] = {
                  type: 'LineString',
                  coordinates: coords,
                };

                triggerUpdate(
                  { type: 'GeometryCollection', geometries: updatedGeometries },
                  'GeometryCollection'
                );
              });

              allBounds.push(polyline.getBounds());
            } else if (geometry.type === 'Polygon') {
              const latlngs: L.LatLngTuple[] = geometry.coordinates[0].map(([lng, lat]) => [
                lat,
                lng,
              ]);
              const polygon = L.polygon(latlngs).addTo(map);
              (polygon as any).enableEdit();
              layer = polygon;

              polygon.on('dragend', () => {
                const updatedGeoJSON = polygon.toGeoJSON();
                updatedGeometries[index] = {
                  type: 'Polygon',
                  coordinates: (updatedGeoJSON.geometry as Polygon).coordinates,
                };

                triggerUpdate(
                  { type: 'GeometryCollection', geometries: updatedGeometries },
                  'GeometryCollection'
                );
              });

              polygon.on('editable:vertex:dragend', () => {
                const rawCoords = polygon.getLatLngs()[0] as L.LatLng[];
                const coords: Position[] = rawCoords.map(({ lat, lng }) => [lng, lat]);
                const fixedCoords = closeRing(coords);

                updatedGeometries[index] = {
                  type: 'Polygon',
                  coordinates: [fixedCoords],
                };

                triggerUpdate(
                  { type: 'GeometryCollection', geometries: updatedGeometries },
                  'GeometryCollection'
                );
              });

              allBounds.push(polygon.getBounds());
            }
          });
        } else if (geojson?.type === 'Point') {
          const latlng: [number, number] = geojson.coordinates.slice().reverse() as [
            number,
            number,
          ];
          const layer = L.marker(latlng, { draggable: true }).addTo(map);

          layer.on('dragend', () => {
            const pos = layer.getLatLng();
            const updatedGeoJSON: Point = {
              type: 'Point',
              coordinates: [pos.lng, pos.lat],
            };
            triggerUpdate(updatedGeoJSON, 'Point');
          });

          allBounds.push(L.latLngBounds([latlng, latlng]));
        } else if (geojson.type === 'MultiPoint') {
          const coordinates = geojson.coordinates as Position[];
          geojson.coordinates.forEach((point: Position, idx: number) => {
            const latlng: [number, number] = [point[1], point[0]];
            const marker = L.marker(latlng, { draggable: true }).addTo(map);

            marker.on('dragend', () => {
              const pos = marker.getLatLng();
              coordinates[idx] = [pos.lng, pos.lat];
              const updated: MultiPoint = {
                type: 'MultiPoint',
                coordinates: coordinates,
              };
              triggerUpdate(updated, 'MultiPoint');
            });

            allBounds.push(L.latLngBounds([latlng, latlng]));
          });
        } else if (geojson?.type === 'LineString') {
          console.log('geojson: ', geojson);
          const latlngs: [number, number][] = geojson.coordinates.map(([lng, lat]) => [lat, lng]);

          const layer = L.polyline(latlngs as L.LatLngExpression[]).addTo(map);
          (layer as any).enableEdit();

          layer.on('dragend', () => {
            const updatedGeoJSON = layer.toGeoJSON();
            triggerUpdate(updatedGeoJSON.geometry as LineString, 'LineString');
          });

          layer.on('editable:vertex:dragend', () => {
            const coords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
              latlng.lng,
              latlng.lat,
            ]);
            const updatedGeoJSON: LineString = {
              type: 'LineString',
              coordinates: coords,
            };
            triggerUpdate(updatedGeoJSON, 'LineString');
          });

          allBounds.push(layer.getBounds());
        } else if (geojson.type === 'MultiLineString') {
          const coordinates = geojson.coordinates as Position[][];
          coordinates.forEach((lineCoords: Position[], idx: number) => {
            const latlngs: [number, number][] = (lineCoords as [number, number][]).map(
              ([lng, lat]) => [lat, lng]
            );

            const layer = L.polyline(latlngs as L.LatLngExpression[]).addTo(map);
            (layer as any).enableEdit();

            layer.on('editable:dragend', () => {
              const updatedCoords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
                latlng.lng,
                latlng.lat,
              ]);
              coordinates[idx] = updatedCoords;
              const updated: MultiLineString = {
                type: 'MultiLineString',
                coordinates: coordinates,
              };
              triggerUpdate(updated, 'MultiLineString');
            });

            layer.on('editable:vertex:dragend', () => {
              const updatedCoords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
                latlng.lng,
                latlng.lat,
              ]);
              coordinates[idx] = updatedCoords;
              const updated: MultiLineString = {
                type: 'MultiLineString',
                coordinates: coordinates,
              };
              triggerUpdate(updated, 'MultiLineString');
            });

            allBounds.push(layer.getBounds());
          });
        } else if (geojson?.type === 'Polygon') {
          const coordinates = geojson.coordinates as Position[][];
          const latlngs: [number, number][] = coordinates[0].map(([lng, lat]) => [lat, lng]);

          const layer = L.polygon(latlngs as L.LatLngExpression[]).addTo(map);
          (layer as any).enableEdit();

          layer.on('dragend', () => {
            const updatedGeoJSON = layer.toGeoJSON();
            triggerUpdate(updatedGeoJSON.geometry as Polygon, 'Polygon');
          });

          layer.on('editable:vertex:dragend', () => {
            const latLngs = layer.getLatLngs() as L.LatLng[][];
            const coords: Position[] = latLngs[0].map((latlng) => [latlng.lng, latlng.lat]);
            const fixedCoords = closeRing(coords);

            const updatedGeoJSON: Polygon = {
              type: 'Polygon',
              coordinates: [fixedCoords],
            };

            triggerUpdate(updatedGeoJSON, 'Polygon');
          });

          allBounds.push(layer.getBounds());
        } else if (geojson.type === 'MultiPolygon') {
          const coordinates = geojson.coordinates as Position[][][];
          const layers = coordinates.map((polygonCoords, idx) => {
            const latlngs: L.LatLngTuple[][] = polygonCoords.map((ring) =>
              ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)
            );

            const layer = L.polygon(latlngs).addTo(map);
            (layer as any).enableEdit();

            const updateCoords = () => {
              const latlngs = layer.getLatLngs();
              geojson.coordinates[idx] = normalizePolygonLatLngs(latlngs)[0];
              triggerUpdate(geojson as MultiPolygon, 'MultiPolygon');
            };

            layer.on('editable:dragend', updateCoords);
            layer.on('editable:vertex:dragend', updateCoords);

            allBounds.push(layer.getBounds());
            return layer;
          });
        }

        if (!boundsFitted.current && allBounds.length) {
          const combinedBounds = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
          map.fitBounds(combinedBounds, { padding: [20, 20] });
          boundsFitted.current = true;
        }
      }

      const triggerUpdate = (geom: Geometry | GeometryCollection, type: string) => {
        const center = map.getCenter();
        setCenter([center.lat, center.lng]);
        setZoom(map.getZoom());

        const toWkt = stringify(
          type === 'GeometryCollection'
            ? { type: 'GeometryCollection', geometries: updatedGeometries }
            : geom
        );
        const newGeometry = format === 'wkt' ? { wkt: toWkt } : geom;
        onChange({ target: { name, value: newGeometry } });
      };
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <Field.Root hint={description?.defaultMessage}>
      <Field.Label>{name}</Field.Label>
      <div
        id={mapId}
        style={{
          height: '700px',
          borderRadius: '4px',
          overflow: 'hidden',
          zIndex: 1,
        }}
      />
      <Field.Hint />
    </Field.Root>
  );
};

export default GeometryInput;
