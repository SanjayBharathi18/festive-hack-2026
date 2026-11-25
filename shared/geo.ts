export type Point = { lat: number; lng: number };

const earthKm = 6371;

// The great-circle distance between two places.
export function distanceKm(from: Point, to: Point): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(to.lat - from.lat);
  const dLng = radians(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}
