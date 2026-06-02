const KNOWN_PLACES = [
  { label: "home", placeType: "HOME", lat: 28.6477, lng: 77.33436 },
  { label: "morning_walk_loop", placeType: "PARK", lat: 28.65015, lng: 77.3372 },
  { label: "office", placeType: "OFFICE", lat: 28.5823, lng: 77.3218 },
  { label: "lunch", placeType: "LUNCH", lat: 28.5799, lng: 77.3187 },
  { label: "coffee_shop", placeType: "COFFEE_SHOP", lat: 28.58465, lng: 77.3169 },
  { label: "gym", placeType: "GYM", lat: 28.64115, lng: 77.326 },
  { label: "market", placeType: "MARKET", lat: 28.6362, lng: 77.3621 },
  { label: "evening_park", placeType: "PARK", lat: 28.6528, lng: 77.3439 },
  { label: "nightout", placeType: "NIGHTOUT", lat: 28.5672, lng: 77.3211 },
  { label: "temple", placeType: "TEMPLE", lat: 28.6555, lng: 77.3403 },
  { label: "pharmacy", placeType: "PHARMACY", lat: 28.6421, lng: 77.3311 },
  { label: "doctor", placeType: "DOCTOR", lat: 28.6253, lng: 77.3851 },
  { label: "petrol_pump", placeType: "PETROL_PUMP", lat: 28.6312, lng: 77.3387 },
  { label: "friend_home", placeType: "FRIEND_HOME", lat: 28.6738, lng: 77.3555 },
  { label: "cinema", placeType: "CINEMA", lat: 28.5679, lng: 77.3261 },
  { label: "mall", placeType: "MALL", lat: 28.5677, lng: 77.353 },
  { label: "airport", placeType: "AIRPORT", lat: 28.5562, lng: 77.1001 },
  { label: "metro_station", placeType: "METRO", lat: 28.5743, lng: 77.356 },
  { label: "bank", placeType: "BANK", lat: 28.6461, lng: 77.3158 },
  { label: "salon", placeType: "SALON", lat: 28.6451, lng: 77.3373 },
  { label: "parents_home", placeType: "FAMILY_HOME", lat: 28.7041, lng: 77.3105 },
  { label: "sanjay_lake", placeType: "LAKE", lat: 28.6134, lng: 77.303 },
  { label: "book_store", placeType: "BOOK_STORE", lat: 28.6287, lng: 77.3714 },
  { label: "coworking", placeType: "COWORKING", lat: 28.6291, lng: 77.3775 },
  { label: "street_food", placeType: "STREET_FOOD", lat: 28.6508, lng: 77.3028 },
  { label: "grocery", placeType: "GROCERY", lat: 28.6442, lng: 77.3456 },
  { label: "cricket_ground", placeType: "SPORTS", lat: 28.6389, lng: 77.301 },
  { label: "library", placeType: "LIBRARY", lat: 28.6171, lng: 77.3585 },
  { label: "repair_shop", placeType: "REPAIR_SHOP", lat: 28.6334, lng: 77.3282 }
];

function getDistanceMeter(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function resolveKnownPlaceByLocation(lat, lng, maxDistanceMeter = 180) {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  let bestPlace = null;
  let bestDistance = Infinity;

  KNOWN_PLACES.forEach((place) => {
    const distance = getDistanceMeter(lat, lng, place.lat, place.lng);

    if (distance < bestDistance) {
      bestPlace = place;
      bestDistance = distance;
    }
  });

  if (!bestPlace || bestDistance > maxDistanceMeter) {
    return null;
  }

  return {
    place_name: bestPlace.label,
    place_type: bestPlace.placeType,
    place_type_confidence: 1,
    place_type_source: "known_generated_location",
    known_place_distance_meters: Number(bestDistance.toFixed(2))
  };
}

export function applyResolvedPlace(point) {
  const resolved = resolveKnownPlaceByLocation(point.lat, point.lng);

  if (!resolved) {
    return point;
  }

  return {
    ...point,
    ...resolved,
    cluster_name: resolved.place_type
  };
}

