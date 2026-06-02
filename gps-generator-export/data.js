import ngeohash from "ngeohash";
import GpsRaw from "./src/models/gpsRaw.model.js";
import connectDB from "./config/db.js";
import "dotenv/config";

const userId = "U123";

const GPS_INTERVAL_SEC = 3;
const BATCH_SIZE = 5000;
const DAYS_TO_GENERATE = 30;
const START_DATE_IST = "2026-05-04"; // Monday, gives clean weekday/weekend training labels.
const TIME_ZONE_OFFSET = "+05:30";

let currentStartTime = new Date(`${START_DATE_IST}T00:00:00${TIME_ZONE_OFFSET}`).getTime();
let globalPointIndex = 0;

let batch = [];
let totalInserted = 0;

const places = {
  home: { label: "home", placeType: "HOME", lat: 28.6477, lng: 77.33436 },
  morningWalkLoop: { label: "morning_walk_loop", placeType: "PARK", lat: 28.65015, lng: 77.3372 },
  office: { label: "office", placeType: "OFFICE", lat: 28.5823, lng: 77.3218 },
  lunch: { label: "lunch", placeType: "LUNCH", lat: 28.5799, lng: 77.3187 },
  coffee: { label: "coffee_shop", placeType: "COFFEE_SHOP", lat: 28.58465, lng: 77.3169 },
  gym: { label: "gym", placeType: "GYM", lat: 28.64115, lng: 77.326 },
  market: { label: "market", placeType: "MARKET", lat: 28.6362, lng: 77.3621 },
  park: { label: "evening_park", placeType: "PARK", lat: 28.6528, lng: 77.3439 },
  nightout: { label: "nightout", placeType: "NIGHTOUT", lat: 28.5672, lng: 77.3211 },
  temple: { label: "temple", placeType: "TEMPLE", lat: 28.6555, lng: 77.3403 },
  pharmacy: { label: "pharmacy", placeType: "PHARMACY", lat: 28.6421, lng: 77.3311 },
  doctor: { label: "doctor", placeType: "DOCTOR", lat: 28.6253, lng: 77.3851 },
  petrolPump: { label: "petrol_pump", placeType: "PETROL_PUMP", lat: 28.6312, lng: 77.3387 },
  friendHome: { label: "friend_home", placeType: "FRIEND_HOME", lat: 28.6738, lng: 77.3555 },
  cinema: { label: "cinema", placeType: "CINEMA", lat: 28.5679, lng: 77.3261 },
  mall: { label: "mall", placeType: "MALL", lat: 28.5677, lng: 77.353 },
  airport: { label: "airport", placeType: "AIRPORT", lat: 28.5562, lng: 77.1001 },
  metro: { label: "metro_station", placeType: "METRO", lat: 28.5743, lng: 77.356 },
  bank: { label: "bank", placeType: "BANK", lat: 28.6461, lng: 77.3158 },
  salon: { label: "salon", placeType: "SALON", lat: 28.6451, lng: 77.3373 },
  parentsHome: { label: "parents_home", placeType: "FAMILY_HOME", lat: 28.7041, lng: 77.3105 },
  lake: { label: "sanjay_lake", placeType: "LAKE", lat: 28.6134, lng: 77.303 },
  bookStore: { label: "book_store", placeType: "BOOK_STORE", lat: 28.6287, lng: 77.3714 },
  coworking: { label: "coworking", placeType: "COWORKING", lat: 28.6291, lng: 77.3775 },
  streetFood: { label: "street_food", placeType: "STREET_FOOD", lat: 28.6508, lng: 77.3028 },
  grocery: { label: "grocery", placeType: "GROCERY", lat: 28.6442, lng: 77.3456 },
  cricket: { label: "cricket_ground", placeType: "SPORTS", lat: 28.6389, lng: 77.301 },
  library: { label: "library", placeType: "LIBRARY", lat: 28.6171, lng: 77.3585 },
  repairShop: { label: "repair_shop", placeType: "REPAIR_SHOP", lat: 28.6334, lng: 77.3282 }
};

function getISTParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);

  return { weekday, hour };
}

function getTimeOfDay(date) {
  const { hour } = getISTParts(date);

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";

  return "night";
}

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

function getHeading(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);

  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function getRandomSpeedKmph(min = 10, max = 40) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function randomNoiseMeter(lat, lng, maxMeter = 5) {
  if (!maxMeter || maxMeter <= 0) {
    return [Number(lat.toFixed(7)), Number(lng.toFixed(7))];
  }

  const r = maxMeter / 111320;

  const newLat = lat + (Math.random() * 2 - 1) * r;
  const newLng =
    lng + ((Math.random() * 2 - 1) * r) / Math.cos((lat * Math.PI) / 180);

  return [Number(newLat.toFixed(7)), Number(newLng.toFixed(7))];
}

function validatePolyline(polyline, routeType) {
  if (!Array.isArray(polyline) || polyline.length === 0) {
    throw new Error(`Polyline cannot be empty: ${routeType}`);
  }

  polyline.forEach((point, index) => {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      typeof point[1] !== "number"
    ) {
      console.log("Invalid point found:");
      console.log("Route:", routeType);
      console.log("Index:", index);
      console.log("Point:", point);

      throw new Error("Invalid point format. Use [[lat, lng]]");
    }
  });
}

function buildRouteSegments(polyline) {
  const segments = [];
  let totalDistance = 0;

  for (let i = 0; i < polyline.length - 1; i++) {
    const [lat1, lng1] = polyline[i];
    const [lat2, lng2] = polyline[i + 1];

    const distance = getDistanceMeter(lat1, lng1, lat2, lng2);

    if (distance < 0.5) continue;

    segments.push({
      lat1,
      lng1,
      lat2,
      lng2,
      distance,
      startDistance: totalDistance,
      endDistance: totalDistance + distance
    });

    totalDistance += distance;
  }

  return { segments, totalDistance };
}

function getPointAtDistanceWithCursor(segments, targetDistance, cursor) {
  if (segments.length === 0) return null;

  while (
    cursor.index < segments.length - 1 &&
    targetDistance > segments[cursor.index].endDistance
  ) {
    cursor.index++;
  }

  const segment = segments[cursor.index];

  if (
    targetDistance >= segment.endDistance &&
    cursor.index === segments.length - 1
  ) {
    return [segment.lat2, segment.lng2];
  }

  const ratio = Math.max(
    0,
    Math.min(
      1,
      (targetDistance - segment.startDistance) / segment.distance
    )
  );

  const lat = segment.lat1 + (segment.lat2 - segment.lat1) * ratio;
  const lng = segment.lng1 + (segment.lng2 - segment.lng1) * ratio;

  return [Number(lat.toFixed(7)), Number(lng.toFixed(7))];
}

function createBaseDoc({
  lat,
  lng,
  date,
  speed = 0,
  heading = 0,
  vin,
  routeType,
  movementType,
  pointIndex,
  placeType = null
}) {
  const timestamp = Math.floor(date.getTime() / 1000);
  const { weekday } = getISTParts(date);

  return {
    user_id: userId,
    vin,
    device_type: "mobile",

    gps_TimeStamp: timestamp,
    createdOn: timestamp,
    updatedOn: timestamp,

    lat,
    lng,

    location: {
      type: "Point",
      coordinates: [lng, lat]
    },

    geoHash: ngeohash.encode(lat, lng, 8),

    speed,
    speed_unit: "kmph",

    heading,

    accuracy: Math.floor(Math.random() * 8) + 5,
    altitude: null,
    hdop: Number((Math.random() * 0.8 + 0.8).toFixed(2)),
    soc: 85,
    igs: 1,

    day_of_week: weekday,
    is_weekend: ["Saturday", "Sunday"].includes(weekday),
    time_of_day: getTimeOfDay(date),

    processed: false,

    route_type: routeType,
    movement_type: movementType,
    place_type: placeType,

    point_index: pointIndex
  };
}

async function addToBatch(doc) {
  batch.push(doc);

  if (batch.length >= BATCH_SIZE) {
    await flushBatch();
  }
}

async function flushBatch() {
  if (batch.length === 0) return;

  const docs = batch;
  batch = [];

  await GpsRaw.collection.insertMany(docs, {
    ordered: false
  });

  totalInserted += docs.length;
  console.log(`Inserted ${totalInserted} records...`);
}

function toPoint(place) {
  return [place.lat, place.lng];
}

function minutesFromMidnight(time) {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

function dayStartMs(dayIndex) {
  const start = new Date(`${START_DATE_IST}T00:00:00${TIME_ZONE_OFFSET}`).getTime();
  return start + dayIndex * 24 * 60 * 60 * 1000;
}

function setClock(dayIndex, time) {
  currentStartTime = dayStartMs(dayIndex) + minutesFromMidnight(time) * 60 * 1000;
}

function placeAt(place, time, options = {}) {
  return {
    place,
    time,
    minSpeedKmph: options.minSpeedKmph ?? 14,
    maxSpeedKmph: options.maxSpeedKmph ?? 42,
    routeHint: options.routeHint ?? null
  };
}

function createRoute(from, to, routeHint = 0) {
  const start = toPoint(from);
  const end = toPoint(to);
  const distance = getDistanceMeter(start[0], start[1], end[0], end[1]);

  if (distance < 80) return [start, end];

  const pointCount = Math.max(4, Math.min(14, Math.ceil(distance / 2600)));
  const points = [start];
  const latSpan = end[0] - start[0];
  const lngSpan = end[1] - start[1];
  const bend = ((routeHint % 7) - 3) * 0.0014;
  const wave = routeHint % 2 === 0 ? 1 : -1;

  for (let i = 1; i < pointCount; i++) {
    const ratio = i / pointCount;
    const curve = Math.sin(Math.PI * ratio);
    const lat =
      start[0] +
      latSpan * ratio +
      curve * bend +
      (Math.random() - 0.5) * 0.0012;
    const lng =
      start[1] +
      lngSpan * ratio -
      curve * bend * wave +
      (Math.random() - 0.5) * 0.0012;

    points.push([Number(lat.toFixed(7)), Number(lng.toFixed(7))]);
  }

  points.push(end);
  return points;
}

async function generateMovingRouteToDB(polyline, options = {}) {
  const {
    vin = "TRIP_001",
    routeType = "unknown_route",
    minSpeedKmph = 10,
    maxSpeedKmph = 40
  } = options;

  validatePolyline(polyline, routeType);

  if (polyline.length < 2) return;

  const { segments, totalDistance } = buildRouteSegments(polyline);

  if (segments.length === 0 || totalDistance <= 0) return;

  let traveledDistance = 0;
  let pointCount = 0;
  let prevPoint = null;

  const cursor = { index: 0 };

  while (traveledDistance <= totalDistance) {
    const speedKmph = getRandomSpeedKmph(minSpeedKmph, maxSpeedKmph);
    const speedMps = (speedKmph * 1000) / 3600;

    const point = getPointAtDistanceWithCursor(
      segments,
      traveledDistance,
      cursor
    );

    if (!point) break;

    const [lat, lng] = point;

    const date = new Date(
      currentStartTime + pointCount * GPS_INTERVAL_SEC * 1000
    );

    let heading = 0;

    if (prevPoint) {
      const [prevLat, prevLng] = prevPoint;
      heading = getHeading(prevLat, prevLng, lat, lng);
    }

    await addToBatch(
      createBaseDoc({
        lat,
        lng,
        date,
        speed: pointCount === 0 ? 0 : speedKmph,
        heading,
        vin,
        routeType,
        movementType: "moving",
        placeType: null,
        pointIndex: globalPointIndex++
      })
    );

    prevPoint = [lat, lng];
    traveledDistance += speedMps * GPS_INTERVAL_SEC;
    pointCount++;
  }

  const lastSegment = segments[segments.length - 1];
  const finalPoint = [
    Number(lastSegment.lat2.toFixed(7)),
    Number(lastSegment.lng2.toFixed(7))
  ];

  const shouldAddFinalPoint =
    !prevPoint ||
    getDistanceMeter(prevPoint[0], prevPoint[1], finalPoint[0], finalPoint[1]) > 1;

  if (shouldAddFinalPoint) {
    const date = new Date(
      currentStartTime + pointCount * GPS_INTERVAL_SEC * 1000
    );

    const heading = prevPoint
      ? getHeading(prevPoint[0], prevPoint[1], finalPoint[0], finalPoint[1])
      : 0;

    await addToBatch(
      createBaseDoc({
        lat: finalPoint[0],
        lng: finalPoint[1],
        date,
        speed: getRandomSpeedKmph(minSpeedKmph, maxSpeedKmph),
        heading,
        vin,
        routeType,
        movementType: "moving",
        placeType: null,
        pointIndex: globalPointIndex++
      })
    );

    pointCount++;
  }

  currentStartTime += pointCount * GPS_INTERVAL_SEC * 1000;

  console.log({
    routeType,
    type: "moving",
    totalDistanceMeter: Number(totalDistance.toFixed(2)),
    minSpeedKmph,
    maxSpeedKmph,
    totalPoints: pointCount,
    nextStartTime: new Date(currentStartTime).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    })
  });
}

async function generateStayToDB(
  basePoint,
  stayHours = 0,
  stayMinutes = 0,
  options = {}
) {
  const {
    vin = "STAY_001",
    routeType = "stay",
    placeType = "OTHER",
    noiseMeter = 5
  } = options;

  if (
    !Array.isArray(basePoint) ||
    basePoint.length !== 2 ||
    typeof basePoint[0] !== "number" ||
    typeof basePoint[1] !== "number"
  ) {
    throw new Error("Invalid stay base point. Use [lat, lng]");
  }

  const [baseLat, baseLng] = basePoint;

  const stayTotalSeconds = stayHours * 3600 + stayMinutes * 60;
  const totalPoints = Math.floor(stayTotalSeconds / GPS_INTERVAL_SEC);

  for (let index = 0; index < totalPoints; index++) {
    const [lat, lng] = randomNoiseMeter(baseLat, baseLng, noiseMeter);

    const date = new Date(
      currentStartTime + index * GPS_INTERVAL_SEC * 1000
    );

    await addToBatch(
      createBaseDoc({
        lat,
        lng,
        date,
        speed: Number((Math.random() * 0.08).toFixed(2)),
        heading: Math.floor(Math.random() * 360),
        vin,
        routeType,
        movementType: "stay",
        placeType,
        pointIndex: globalPointIndex++
      })
    );
  }

  currentStartTime += stayTotalSeconds * 1000;

  console.log({
    routeType,
    type: "stay",
    placeType,
    stayTotalSeconds,
    totalPoints,
    nextStartTime: new Date(currentStartTime).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata"
    })
  });
}

async function stayUntil(place, targetTimeMs, dayNo) {
  const staySeconds = Math.max(0, Math.floor((targetTimeMs - currentStartTime) / 1000));
  if (staySeconds <= 0) return;

  await generateStayToDB(toPoint(place), 0, staySeconds / 60, {
    vin: `D${dayNo}_${place.label}_STAY`,
    routeType: `${place.label}_stay`,
    placeType: place.placeType,
    noiseMeter: place.placeType === "HOME" ? 6 : 9
  });
}

async function generateDayFromStops(dayIndex, title, stops) {
  const dayNo = dayIndex + 1;
  const dayDate = new Date(dayStartMs(dayIndex));
  const weekday = getISTParts(dayDate).weekday;
  console.log(`\nDay ${String(dayNo).padStart(2, "0")} ${weekday}: ${title}\n`);

  setClock(dayIndex, "00:00");

  let currentPlace = places.home;

  for (let index = 0; index < stops.length; index++) {
    const stop = stops[index];
    const departTime = dayStartMs(dayIndex) + minutesFromMidnight(stop.time) * 60 * 1000;

    await stayUntil(currentPlace, departTime, dayNo);

    const route = createRoute(currentPlace, stop.place, stop.routeHint ?? dayNo + index);
    await generateMovingRouteToDB(route, {
      vin: `D${dayNo}_${currentPlace.label}_TO_${stop.place.label}`,
      routeType: `${currentPlace.label}_to_${stop.place.label}`,
      minSpeedKmph: stop.minSpeedKmph,
      maxSpeedKmph: stop.maxSpeedKmph
    });

    currentPlace = stop.place;
  }

  await stayUntil(currentPlace, dayStartMs(dayIndex + 1), dayNo);
}

function regularOfficeStops(options = {}) {
  const lunchPlace = options.lunchPlace ?? places.lunch;
  const coffeePlace = options.coffeePlace ?? places.coffee;
  const afterOffice = options.afterOffice ?? [];
  const preOffice = options.preOffice ?? [];
  const officeIn = options.officeIn ?? "08:48";
  const officeOut = options.officeOut ?? "17:55";
  const nightoutTime = options.nightoutTime ?? "22:10";
  const homeFromNight = options.homeFromNight ?? "23:20";

  return [
    placeAt(places.morningWalkLoop, options.walkTime ?? "06:00", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    placeAt(places.home, options.walkReturn ?? "06:38", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    ...preOffice,
    placeAt(places.office, officeIn, { minSpeedKmph: 22, maxSpeedKmph: 48 }),
    placeAt(lunchPlace, options.lunchTime ?? "12:45", { minSpeedKmph: 10, maxSpeedKmph: 24 }),
    placeAt(coffeePlace, options.coffeeTime ?? "14:08", { minSpeedKmph: 9, maxSpeedKmph: 22 }),
    placeAt(places.office, options.officeReturn ?? "14:38", { minSpeedKmph: 9, maxSpeedKmph: 22 }),
    placeAt(places.home, officeOut, { minSpeedKmph: 18, maxSpeedKmph: 45 }),
    placeAt(places.gym, options.gymTime ?? "18:55", { minSpeedKmph: 10, maxSpeedKmph: 24 }),
    placeAt(places.home, options.gymReturn ?? "20:05", { minSpeedKmph: 10, maxSpeedKmph: 24 }),
    placeAt(options.marketPlace ?? places.market, options.marketTime ?? "20:32", { minSpeedKmph: 12, maxSpeedKmph: 28 }),
    placeAt(places.home, options.marketReturn ?? "21:05", { minSpeedKmph: 12, maxSpeedKmph: 28 }),
    placeAt(options.parkPlace ?? places.park, options.parkTime ?? "21:28", { minSpeedKmph: 5, maxSpeedKmph: 12 }),
    placeAt(places.home, options.parkReturn ?? "21:55", { minSpeedKmph: 5, maxSpeedKmph: 12 }),
    placeAt(options.nightoutPlace ?? places.nightout, nightoutTime, { minSpeedKmph: 18, maxSpeedKmph: 42 }),
    ...afterOffice,
    placeAt(places.home, homeFromNight, { minSpeedKmph: 18, maxSpeedKmph: 42 })
  ];
}

function weekendStops(options = {}) {
  return [
    placeAt(places.morningWalkLoop, options.walkTime ?? "07:05", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    placeAt(places.home, options.walkReturn ?? "07:52", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    placeAt(options.firstPlace ?? places.market, options.firstTime ?? "10:35", { minSpeedKmph: 12, maxSpeedKmph: 30 }),
    placeAt(places.home, options.firstReturn ?? "12:10", { minSpeedKmph: 12, maxSpeedKmph: 30 }),
    placeAt(options.secondPlace ?? places.mall, options.secondTime ?? "15:45", { minSpeedKmph: 16, maxSpeedKmph: 40 }),
    placeAt(options.thirdPlace ?? places.cinema, options.thirdTime ?? "18:55", { minSpeedKmph: 12, maxSpeedKmph: 30 }),
    placeAt(options.foodPlace ?? places.streetFood, options.foodTime ?? "21:05", { minSpeedKmph: 12, maxSpeedKmph: 30 }),
    placeAt(places.home, options.homeTime ?? "23:35", { minSpeedKmph: 16, maxSpeedKmph: 40 })
  ];
}

function leaveDayStops() {
  return [
    placeAt(places.morningWalkLoop, "06:15", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    placeAt(places.home, "07:05", { minSpeedKmph: 4, maxSpeedKmph: 7 }),
    placeAt(places.doctor, "10:20", { minSpeedKmph: 16, maxSpeedKmph: 34 }),
    placeAt(places.pharmacy, "12:15", { minSpeedKmph: 10, maxSpeedKmph: 22 }),
    placeAt(places.home, "13:05", { minSpeedKmph: 10, maxSpeedKmph: 22 }),
    placeAt(places.park, "18:10", { minSpeedKmph: 5, maxSpeedKmph: 12 }),
    placeAt(places.home, "19:15", { minSpeedKmph: 5, maxSpeedKmph: 12 }),
    placeAt(places.market, "20:20", { minSpeedKmph: 12, maxSpeedKmph: 28 }),
    placeAt(places.home, "21:05", { minSpeedKmph: 12, maxSpeedKmph: 28 })
  ];
}

async function day01Routine(dayIndex) {
  await generateDayFromStops(dayIndex, "regular office routine", regularOfficeStops());
}

async function day02RoutineEarlyCoffee(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with early coffee", regularOfficeStops({
    coffeeTime: "13:52",
    gymTime: "19:05",
    nightoutTime: "22:20"
  }));
}

async function day03RoutinePharmacyAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine plus pharmacy anomaly", regularOfficeStops({
    preOffice: [placeAt(places.pharmacy, "08:12", { minSpeedKmph: 12, maxSpeedKmph: 24 })],
    officeIn: "09:05",
    officeOut: "18:08"
  }));
}

async function day04RoutineLateOffice(dayIndex) {
  await generateDayFromStops(dayIndex, "late office and shorter nightout", regularOfficeStops({
    officeIn: "09:18",
    lunchTime: "13:10",
    officeOut: "18:42",
    marketTime: "20:48",
    homeFromNight: "23:48"
  }));
}

async function day05RoutineBankAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office day with bank errand", regularOfficeStops({
    preOffice: [placeAt(places.bank, "08:05", { minSpeedKmph: 12, maxSpeedKmph: 28 })],
    officeIn: "09:10",
    nightoutPlace: places.cinema,
    homeFromNight: "23:30"
  }));
}

async function day06SaturdayFamily(dayIndex) {
  await generateDayFromStops(dayIndex, "saturday family and cinema", weekendStops({
    firstPlace: places.grocery,
    secondPlace: places.parentsHome,
    thirdPlace: places.cinema,
    foodPlace: places.nightout,
    homeTime: "23:55"
  }));
}

async function day07SundaySlow(dayIndex) {
  await generateDayFromStops(dayIndex, "sunday slow market park", weekendStops({
    walkTime: "07:45",
    firstPlace: places.temple,
    firstTime: "09:20",
    secondPlace: places.lake,
    secondTime: "16:30",
    thirdPlace: places.market,
    foodPlace: places.streetFood,
    homeTime: "22:50"
  }));
}

async function day08RoutineRepairAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with repair shop anomaly", regularOfficeStops({
    afterOffice: [placeAt(places.repairShop, "22:55", { minSpeedKmph: 12, maxSpeedKmph: 24 })],
    homeFromNight: "23:42"
  }));
}

async function day09RoutineCoworking(dayIndex) {
  await generateDayFromStops(dayIndex, "half day coworking then office", regularOfficeStops({
    preOffice: [placeAt(places.coworking, "08:40", { minSpeedKmph: 20, maxSpeedKmph: 42 })],
    officeIn: "11:20",
    lunchTime: "13:25",
    officeOut: "18:15"
  }));
}

async function day10RoutineNoGym(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine without gym", regularOfficeStops({
    gymTime: "18:40",
    gymReturn: "18:55",
    marketTime: "19:45",
    parkTime: "21:10",
    nightoutTime: "22:00",
    homeFromNight: "23:05"
  }));
}

async function day11OfficeLeave(dayIndex) {
  await generateDayFromStops(dayIndex, "weekday office leave", leaveDayStops());
}

async function day12RoutineAirportAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office day with airport pickup anomaly", regularOfficeStops({
    officeOut: "17:20",
    nightoutTime: "20:35",
    afterOffice: [placeAt(places.airport, "21:55", { minSpeedKmph: 25, maxSpeedKmph: 58 })],
    homeFromNight: "23:58"
  }));
}

async function day13SaturdaySports(dayIndex) {
  await generateDayFromStops(dayIndex, "saturday cricket and friends", weekendStops({
    firstPlace: places.cricket,
    firstTime: "08:45",
    firstReturn: "11:50",
    secondPlace: places.friendHome,
    secondTime: "16:10",
    thirdPlace: places.streetFood,
    foodPlace: places.nightout,
    homeTime: "23:45"
  }));
}

async function day14SundayParents(dayIndex) {
  await generateDayFromStops(dayIndex, "sunday parents home", weekendStops({
    firstPlace: places.temple,
    secondPlace: places.parentsHome,
    secondTime: "13:35",
    thirdPlace: places.market,
    thirdTime: "19:30",
    foodPlace: places.park,
    foodTime: "21:15",
    homeTime: "22:25"
  }));
}

async function day15RoutineMetroAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with metro detour", regularOfficeStops({
    preOffice: [placeAt(places.metro, "08:35", { minSpeedKmph: 16, maxSpeedKmph: 34 })],
    officeIn: "09:22",
    marketPlace: places.grocery
  }));
}

async function day16RoutineLongLunch(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine long lunch", regularOfficeStops({
    lunchTime: "12:20",
    coffeeTime: "14:35",
    officeReturn: "15:05",
    officeOut: "18:05",
    nightoutPlace: places.streetFood
  }));
}

async function day17RoutineBookStore(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with bookstore anomaly", regularOfficeStops({
    afterOffice: [placeAt(places.bookStore, "22:42", { minSpeedKmph: 12, maxSpeedKmph: 28 })],
    homeFromNight: "23:36"
  }));
}

async function day18RoutineEarlyHome(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine early home", regularOfficeStops({
    officeIn: "08:30",
    officeOut: "16:50",
    gymTime: "18:15",
    marketTime: "19:50",
    nightoutTime: "21:45",
    homeFromNight: "22:50"
  }));
}

async function day19RoutineDoctorAfterOffice(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with doctor visit", regularOfficeStops({
    officeOut: "17:10",
    afterOffice: [placeAt(places.doctor, "22:48", { minSpeedKmph: 16, maxSpeedKmph: 34 })],
    homeFromNight: "23:40"
  }));
}

async function day20SaturdayMall(dayIndex) {
  await generateDayFromStops(dayIndex, "saturday mall cinema nightout", weekendStops({
    firstPlace: places.salon,
    firstTime: "10:05",
    secondPlace: places.mall,
    secondTime: "14:20",
    thirdPlace: places.cinema,
    thirdTime: "18:20",
    foodPlace: places.nightout,
    homeTime: "23:50"
  }));
}

async function day21SundayLibrary(dayIndex) {
  await generateDayFromStops(dayIndex, "sunday library lake", weekendStops({
    walkTime: "07:25",
    firstPlace: places.library,
    firstTime: "11:00",
    firstReturn: "13:15",
    secondPlace: places.lake,
    secondTime: "16:05",
    thirdPlace: places.streetFood,
    foodPlace: places.park,
    homeTime: "22:10"
  }));
}

async function day22RoutinePetrolAnomaly(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with petrol pump", regularOfficeStops({
    preOffice: [placeAt(places.petrolPump, "08:20", { minSpeedKmph: 10, maxSpeedKmph: 24 })],
    officeIn: "09:02",
    officeOut: "18:12"
  }));
}

async function day23RoutineFriendNight(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine friend home night", regularOfficeStops({
    nightoutPlace: places.friendHome,
    nightoutTime: "22:05",
    homeFromNight: "23:45"
  }));
}

async function day24RoutineSkippedMarket(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine short market", regularOfficeStops({
    marketPlace: places.grocery,
    marketTime: "20:18",
    marketReturn: "20:38",
    parkTime: "21:12",
    homeFromNight: "23:10"
  }));
}

async function day25RoutineCoworkingEvening(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine with evening coworking", regularOfficeStops({
    officeOut: "17:40",
    afterOffice: [placeAt(places.coworking, "22:45", { minSpeedKmph: 16, maxSpeedKmph: 34 })],
    homeFromNight: "23:50"
  }));
}

async function day26RoutineLateNight(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine late nightout", regularOfficeStops({
    officeOut: "18:25",
    gymTime: "19:20",
    nightoutPlace: places.cinema,
    nightoutTime: "22:40",
    homeFromNight: "23:58"
  }));
}

async function day27SaturdayOuting(dayIndex) {
  await generateDayFromStops(dayIndex, "saturday outing airport side", weekendStops({
    firstPlace: places.grocery,
    secondPlace: places.airport,
    secondTime: "13:05",
    thirdPlace: places.mall,
    thirdTime: "19:05",
    foodPlace: places.streetFood,
    homeTime: "23:42"
  }));
}

async function day28SundayHomeHeavy(dayIndex) {
  await generateDayFromStops(dayIndex, "sunday mostly home", weekendStops({
    walkTime: "08:05",
    firstPlace: places.market,
    firstTime: "11:50",
    firstReturn: "12:45",
    secondPlace: places.park,
    secondTime: "18:30",
    thirdPlace: places.streetFood,
    thirdTime: "20:30",
    foodPlace: places.home,
    foodTime: "22:00",
    homeTime: "22:01"
  }));
}

async function day29RoutineClinicMorning(dayIndex) {
  await generateDayFromStops(dayIndex, "office routine clinic morning", regularOfficeStops({
    preOffice: [placeAt(places.doctor, "07:55", { minSpeedKmph: 16, maxSpeedKmph: 34 })],
    officeIn: "10:15",
    lunchTime: "13:40",
    officeOut: "18:30"
  }));
}

async function day30RoutineClosingMonth(dayIndex) {
  await generateDayFromStops(dayIndex, "regular office routine closing month", regularOfficeStops({
    walkTime: "05:55",
    officeIn: "08:42",
    lunchPlace: places.streetFood,
    coffeePlace: places.coffee,
    marketPlace: places.grocery,
    nightoutPlace: places.friendHome,
    homeFromNight: "23:38"
  }));
}

const dayAlgorithms = [
  day01Routine,
  day02RoutineEarlyCoffee,
  day03RoutinePharmacyAnomaly,
  day04RoutineLateOffice,
  day05RoutineBankAnomaly,
  day06SaturdayFamily,
  day07SundaySlow,
  day08RoutineRepairAnomaly,
  day09RoutineCoworking,
  day10RoutineNoGym,
  day11OfficeLeave,
  day12RoutineAirportAnomaly,
  day13SaturdaySports,
  day14SundayParents,
  day15RoutineMetroAnomaly,
  day16RoutineLongLunch,
  day17RoutineBookStore,
  day18RoutineEarlyHome,
  day19RoutineDoctorAfterOffice,
  day20SaturdayMall,
  day21SundayLibrary,
  day22RoutinePetrolAnomaly,
  day23RoutineFriendNight,
  day24RoutineSkippedMarket,
  day25RoutineCoworkingEvening,
  day26RoutineLateNight,
  day27SaturdayOuting,
  day28SundayHomeHeavy,
  day29RoutineClinicMorning,
  day30RoutineClosingMonth
];

function validatePlacesWithinRange() {
  Object.values(places).forEach((place) => {
    const distanceKm = getDistanceMeter(places.home.lat, places.home.lng, place.lat, place.lng) / 1000;
    if (distanceKm > 40) {
      throw new Error(`${place.label} is ${distanceKm.toFixed(2)} km from home. Keep it within 40 km.`);
    }
  });
}

async function main() {
  await connectDB();

  validatePlacesWithinRange();

  await GpsRaw.deleteMany({ user_id: userId });

  for (let dayIndex = 0; dayIndex < DAYS_TO_GENERATE; dayIndex++) {
    await dayAlgorithms[dayIndex](dayIndex);
  }

  await flushBatch();

  console.log("\nData inserted successfully.");
  console.log(`Generated days: ${DAYS_TO_GENERATE}`);
  console.log(`Total records inserted: ${totalInserted}`);

  process.exit(0);
}

main().catch(async (error) => {
  console.error("Data generation failed:", error);

  await flushBatch();

  process.exit(1);
});
