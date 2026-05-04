export function isValidLatLng(lat, lng) {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  if (!isValidLatLng(lat1, lng1) || !isValidLatLng(lat2, lng2)) {
    return 0;
  }

  const R = 6371000; // meters

  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function headingDiff(prevHeading = 0, currHeading = 0) {
  const diff = Math.abs(currHeading - prevHeading) % 360;
  return diff > 180 ? 360 - diff : diff;
}

export function getCalculatedSpeedKmph(distanceMeters, timeGapSec) {
  if (!timeGapSec || timeGapSec <= 0) return 0;

  const speedMps = distanceMeters / timeGapSec;
  return speedMps * 3.6;
}