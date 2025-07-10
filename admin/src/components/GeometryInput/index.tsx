import React, { useState, useEffect, useRef } from 'react';
import { Field } from '@strapi/design-system';
import { wktToGeoJSON, geojsonToWKT } from '@terraformer/wkt';
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
  const updatedGeometriesRef = useRef([]);
  const format = attribute.options?.format || 'wkt';
  const [center, setCenter] = useState<[number, number]>([40, 0]);
  const [zoom, setZoom] = useState<number>(2);

  const parseGeometry = (value: any): Geometry | GeometryCollection | null | undefined => {
    if (!value || value === 'null' || Object.keys(value).length === 0) return null;
    try {
      if (format === 'geojson') {
        const cloned = JSON.parse(JSON.stringify(value));
        return cloned;
      } else if (format === 'wkt') {
        const parsed = wktToGeoJSON(value.wkt);
        if (parsed?.type === 'Feature') {
          return parsed.geometry;
        }
        return parsed as Geometry;
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
          updatedGeometriesRef.current = JSON.parse(JSON.stringify(geojson.geometries));

          geojson.geometries.forEach((geometry, index) => {
            let layer: L.Layer;         

            if (geometry.type === 'Point') {
              const latlng: [number, number] = geometry.coordinates.slice().reverse() as [
                number,
                number,
              ];

              const marker = L.marker(latlng, { draggable: true }).addTo(map);
              layer = marker;

              marker.on('dragend', () => {
                const pos = marker.getLatLng();

                const newGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                newGeometries[index] = {
                  type: 'Point',
                  coordinates: [pos.lng, pos.lat],
                } as Point;

                updatedGeometriesRef.current = newGeometries;

                triggerUpdate({
                  type: 'GeometryCollection',
                  geometries: newGeometries,
                });
              });

              allBounds.push(L.latLngBounds(latlng, latlng));
            } else if (geometry.type === 'MultiPoint') {
              const latlngs: L.LatLngTuple[] = geometry.coordinates.map(([lng, lat]) => [lat, lng]);

              latlngs.forEach((latlng, i) => {
                const marker = L.marker(latlng, { draggable: true }).addTo(map);

                marker.on('dragend', () => {
                  const pos = marker.getLatLng();

                  geometry.coordinates[i] = [pos.lng, pos.lat];

                  const newGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                  newGeometries[index] = {
                    type: 'MultiPoint',
                    coordinates: geometry.coordinates,
                  };

                  updatedGeometriesRef.current = newGeometries;

                  triggerUpdate({
                    type: 'GeometryCollection',
                    geometries: newGeometries,
                  });
                });
              });
              const bounds = L.latLngBounds(latlngs);
              allBounds.push(bounds);
            } else if (geometry.type === 'LineString') {
              const latlngs: L.LatLngTuple[] = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
              const polyline = L.polyline(latlngs).addTo(map);

              (polyline as any).enableEdit();
              layer = polyline;

              const updateLine = () => {
                const latlngs = polyline.getLatLngs() as L.LatLng[];
                const coords = latlngs.map(({ lat, lng }) => [lng, lat]);

                const newGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                newGeometries[index] = {
                  type: 'LineString',
                  coordinates: coords,
                };

                updatedGeometriesRef.current = newGeometries;

                triggerUpdate({
                  type: 'GeometryCollection',
                  geometries: newGeometries,
                });
              };

              polyline.on('editable:vertex:dragend', updateLine);
              polyline.on('dragend', updateLine);

              allBounds.push(polyline.getBounds());
            } else if (geometry.type === 'MultiLineString') {
              const coordinates = geometry.coordinates as Position[][];

              coordinates.forEach((lineCoords: Position[], lineIndex: number) => {
                const latlngs: [number, number][] = (lineCoords as [number, number][]).map(
                  ([lng, lat]) => [lat, lng]
                );

                const lineLayer = L.polyline(latlngs as L.LatLngExpression[]).addTo(map);
                (lineLayer as any).enableEdit();

                const updateLine = () => {
                  const latlngs = lineLayer.getLatLngs() as L.LatLng[];
                  const updatedCoords = latlngs.map(({ lat, lng }) => [lng, lat]);

                  const clonedGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                  const updatedGeometry = clonedGeometries[index];               
                  clonedGeometries[index] = {
                    type: 'MultiLineString',
                    coordinates: [...updatedGeometry.coordinates],
                  };
                  clonedGeometries[index].coordinates[lineIndex] = updatedCoords;

                  updatedGeometriesRef.current = clonedGeometries;

                  triggerUpdate({
                    type: 'GeometryCollection',
                    geometries: clonedGeometries,
                  });
                };

                lineLayer.on('editable:dragend', updateLine);
                lineLayer.on('editable:vertex:dragend', updateLine);
                allBounds.push(lineLayer.getBounds());
              });
            } else if (geometry.type === 'Polygon') {
              const coordinates = geometry.coordinates as Position[][];
              const latlngs: [number, number][] = coordinates[0].map(([lng, lat]) => [lat, lng]);

              const layer = L.polygon(latlngs as L.LatLngExpression[]).addTo(map);
              (layer as any).enableEdit();
              const updatePolygon = () => {
                const ring = layer.getLatLngs()[0] as L.LatLng[];
                const coords = [ring.map(({ lat, lng }) => [lng, lat])];               
                const fixedCoords = closeRing(coords[0]);

                const newGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                newGeometries[index] = {
                  type: 'Polygon',
                  coordinates: [fixedCoords],
                };

                updatedGeometriesRef.current = newGeometries;

                triggerUpdate({
                  type: 'GeometryCollection',
                  geometries: newGeometries,
                });
              };

              layer.on('editable:vertex:dragend', updatePolygon);
              layer.on('dragend', updatePolygon);

              allBounds.push(layer.getBounds());
            } else if (geometry.type === 'MultiPolygon') {
              const coordinates = geometry.coordinates as Position[][][];

              const layers = coordinates.map((polygonCoords, idx) => {
                const latlngs: L.LatLngTuple[][] = polygonCoords.map((ring) =>
                  ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)
                );

                const polyLayer = L.polygon(latlngs).addTo(map);
                (polyLayer as any).enableEdit();

                const updatePolygon = () => {
                  const latlngs = polyLayer.getLatLngs();
                  const newCoords = (latlngs as L.LatLng[][]).map((ring) =>
                    ring.map(({ lat, lng }: L.LatLng) => [lng, lat] as [number, number])
                  );

                  const fixedCoords = newCoords.map(closeRing);

                  const clonedGeometries = JSON.parse(JSON.stringify(updatedGeometriesRef.current));
                  const updatedGeometry = clonedGeometries[index];            
                  clonedGeometries[index] = {
                    type: 'MultiPolygon',
                    coordinates: [...updatedGeometry.coordinates],
                  };

                  clonedGeometries[index].coordinates[idx] = fixedCoords;

                  updatedGeometriesRef.current = clonedGeometries;

                  triggerUpdate({
                    type: 'GeometryCollection',
                    geometries: clonedGeometries,
                  });
                };

                polyLayer.on('editable:vertex:dragend', updatePolygon);
                polyLayer.on('editable:dragend', updatePolygon);

                allBounds.push(polyLayer.getBounds());
              });
            }

            updatedGeometries[index] = geometry;
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
            triggerUpdate(updatedGeoJSON);
          });
          allBounds.push(L.latLngBounds(latlng, latlng));
        } else if (geojson.type === 'MultiPoint') {

          const updatedCoordinates = [...geojson.coordinates.map((c) => [...c])];

          const layers = updatedCoordinates.map((point, idx) => {
            const latlng = point.slice().reverse() as [number, number];
            const marker = L.marker(latlng, { draggable: true }).addTo(map);

            marker.on('dragend', () => {
              const pos = marker.getLatLng();
              updatedCoordinates[idx] = [pos.lng, pos.lat];

              const updatedGeoJSON: MultiPoint = {
                type: 'MultiPoint',
                coordinates: updatedCoordinates,
              };

              triggerUpdate(updatedGeoJSON);
            });

            allBounds.push(L.latLngBounds(latlng, latlng));
            return marker;
          });
        } else if (geojson?.type === 'LineString') {
          const latlngs: [number, number][] = geojson.coordinates.map(([lng, lat]) => [lat, lng]);
          const layer = L.polyline(latlngs as L.LatLngExpression[]).addTo(map);
          (layer as any).enableEdit();

          layer.on('dragend', () => {
            const updatedGeoJSON = layer.toGeoJSON().geometry;
            triggerUpdate(updatedGeoJSON as LineString);
          });

          layer.on('editable:vertex:dragend', () => {
            const coords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
              latlng.lng,
              latlng.lat,
            ]);
            const updatedGeoJSON = {
              type: 'LineString',
              coordinates: coords,
            };

            triggerUpdate(updatedGeoJSON as LineString);
          });

          allBounds.push(layer.getBounds());
        } else if (geojson.type === 'MultiLineString') {
          const coordinates = geojson.coordinates as Position[][];

          const layers = coordinates.map((lineCoords, idx) => {
            const latlngs = lineCoords.map(([lng, lat]) => [lat, lng]);

            const layer = L.polyline(latlngs as L.LatLngExpression[]).addTo(map);
            (layer as any).enableEdit();

            layer.on('editable:dragend', () => {
              const updatedCoords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
                latlng.lng,
                latlng.lat,
              ]);
              geojson.coordinates[idx] = updatedCoords;
              triggerUpdate(geojson);
            });

            layer.on('editable:vertex:dragend', () => {
              const updatedCoords: Position[] = (layer.getLatLngs() as L.LatLng[]).map((latlng) => [
                latlng.lng,
                latlng.lat,
              ]);
              geojson.coordinates[idx] = updatedCoords;
              triggerUpdate(geojson);
            });

            allBounds.push(layer.getBounds());
            return layer;
          });
        } else if (geojson?.type === 'Polygon') {
          const latlngs: [number, number][] = geojson.coordinates[0].map(([lng, lat]) => [
            lat,
            lng,
          ]);
          const layer = L.polygon(latlngs as L.LatLngExpression[]).addTo(map);
          (layer as any).enableEdit();

          layer.on('dragend', () => {
            const updatedGeoJSON = layer.toGeoJSON().geometry;
            triggerUpdate(updatedGeoJSON);
          });

          layer.on('editable:vertex:dragend', () => {
            const latlngs = layer.getLatLngs() as L.LatLng[][];
            const ring = latlngs[0];
            const coords = [ring.map(({ lat, lng }) => [lng, lat] as [number, number])];
            const fixedCoords = closeRing(coords[0]);

            const updatedGeoJSON: Polygon = {
              type: 'Polygon',
              coordinates: [fixedCoords],
            };

            triggerUpdate(updatedGeoJSON);
          });

          allBounds.push(layer.getBounds());
        } else if (geojson.type === 'MultiPolygon') {
          const layers = geojson.coordinates.map((polygonCoords, idx) => {
            const latlngs: L.LatLngTuple[][] = polygonCoords.map((ring) =>
              ring.map(([lng, lat]) => [lat, lng] as L.LatLngTuple)
            );

            const layer = L.polygon(latlngs).addTo(map);
            (layer as any).enableEdit();

            layer.on('editable:dragend', () => {
              const latlngs = layer.getLatLngs();
              geojson.coordinates[idx] = normalizePolygonLatLngs(latlngs)[0]; // just one polygon
              triggerUpdate(geojson);
            });

            layer.on('editable:vertex:dragend', () => {
              const latlngs = layer.getLatLngs();
              geojson.coordinates[idx] = normalizePolygonLatLngs(latlngs)[0];
              triggerUpdate(geojson);
            });

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

      const triggerUpdate = (geom: Geometry | GeometryCollection) => {
        const center = map.getCenter();
        setCenter([center.lat, center.lng]);
        setZoom(map.getZoom());

        let newGeometry;

        if (format === 'wkt') {        
          if (Array.isArray(geom)) {
            const wktParts = geom.map((g) => geojsonToWKT(g));
            const newWkt = `GEOMETRYCOLLECTION(${wktParts.join(',')})`;
            newGeometry = { wkt: newWkt };
          } else {
            const newWkt = geojsonToWKT(geom);
            newGeometry = { wkt: newWkt };
          }
        } else {
        
          if (Array.isArray(geom)) {
           
            newGeometry = {
              type: 'GeometryCollection',
              geometries: geom,
            };
          } else {
            newGeometry = geom;
          }        
          newGeometry = JSON.parse(JSON.stringify(newGeometry));
        }
        onChange({
          target: {
            name,
            value: newGeometry,
          },
        });
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
