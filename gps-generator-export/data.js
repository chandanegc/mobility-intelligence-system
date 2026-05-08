import ngeohash from "ngeohash";
import GpsRaw from "./src/models/gpsRaw.model.js";
import connectDB from "./config/db.js";
import "dotenv/config";

import {
  homeTooffice,
  officeToLunch,
  homeToeyeCare,
  homeToGym,
  gymToFoodBazar,
  foodBaazarToNoidaCityCenter,
  noidaCityCenterToHome
} from "./src/utils/data.js";

const userId = "U123";

const GPS_INTERVAL_SEC = 3;
const BATCH_SIZE = 5000;

// Increase this to generate large data.
// 1 full day approx = 28,800 records if whole day covered every 3 sec.
// 18 cycles approx can cross 5 lakh depending on your route/stay durations.
// 35 cycles approx can cross 10 lakh.
const CYCLES_TO_GENERATE = 1;

let currentStartTime = new Date("2026-05-04T09:15:00+05:30").getTime();
let globalPointIndex = 0;

let batch = [];
let totalInserted = 0;

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

    // speed is stored in KM/H as per your requirement: 10–40 during movement
    speed,
    speed_unit: "kmph",

    heading,

    accuracy: Math.floor(Math.random() * 8) + 5,
    altitude: null,
    hdop: Number((Math.random() * 0.8 + 0.8).toFixed(2)),
    soc: 85,
    igs: 1,

    // day_of_week: weekday,
    // is_weekend: ["Saturday", "Sunday"].includes(weekday),
    // time_of_day: getTimeOfDay(date),

    processed: false,

    // route_type: routeType,
    // movement_type: movementType,
    // place_type: placeType,

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

  // Ensure exact destination point is stored
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

    // Set 0 if you want exactly same lat/lng every 3 sec.
    // Set 5/10 for realistic GPS noise.
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

async function generateTripWithStayToDB(
  polyline,
  stayHours = 0,
  stayMinutes = 0,
  options = {}
) {
  const {
    vin = "TRIP_001",
    routeType = "unknown_route",
    placeType = "OTHER",
    minSpeedKmph = 10,
    maxSpeedKmph = 40,
    noiseMeter = 5
  } = options;

  validatePolyline(polyline, routeType);

  if (polyline.length > 1) {
    await generateMovingRouteToDB(polyline, {
      vin,
      routeType,
      minSpeedKmph,
      maxSpeedKmph
    });
  }

  const lastPoint = polyline[polyline.length - 1];

  if (stayHours > 0 || stayMinutes > 0) {
    await generateStayToDB(lastPoint, stayHours, stayMinutes, {
      vin,
      routeType,
      placeType,
      noiseMeter
    });
  }
}

async function generateOneDailyCycle(cycleNo) {
  console.log(`\nStarting cycle ${cycleNo}\n`);

  await generateTripWithStayToDB(
    [[28.6477, 77.33436]],
    0,
    30,
    {
      vin: `HOME_HOME_${cycleNo}`,
      routeType: "home_stay_morning",
      placeType: "HOME",
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    homeTooffice,
    4,
    30,
    {
      vin: `HOME_OFFICE_${cycleNo}`,
      routeType: "home_to_office",
      placeType: "OFFICE",
      minSpeedKmph: 10,
      maxSpeedKmph: 40,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    officeToLunch,
    1,
    10,
    {
      vin: `OFFICE_LUNCH_${cycleNo}`,
      routeType: "office_to_lunch",
      placeType: "LUNCH",
      minSpeedKmph: 10,
      maxSpeedKmph: 25,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    [...officeToLunch].reverse(),
    5,
    32,
    {
      vin: `LUNCH_OFFICE_${cycleNo}`,
      routeType: "lunch_to_office",
      placeType: "OFFICE",
      minSpeedKmph: 10,
      maxSpeedKmph: 25,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    [...homeTooffice].reverse(),
    0,
    46,
    {
      vin: `OFFICE_HOME_${cycleNo}`,
      routeType: "office_to_home",
      placeType: "HOME",
      minSpeedKmph: 10,
      maxSpeedKmph: 40,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    homeToeyeCare,
    1,
    10,
    {
      vin: `HOME_EYE_CENTER_${cycleNo}`,
      routeType: "home_to_eye_center",
      placeType: "EYE_CENTER",
      minSpeedKmph: 10,
      maxSpeedKmph: 35,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    [...homeToeyeCare].reverse(),
    1,
    10,
    {
      vin: `EYE_CENTER_HOME_${cycleNo}`,
      routeType: "eye_center_to_home",
      placeType: "HOME",
      minSpeedKmph: 10,
      maxSpeedKmph: 35,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    homeToGym,
    1,
    10,
    {
      vin: `HOME_GYM_${cycleNo}`,
      routeType: "home_to_gym",
      placeType: "GYM",
      minSpeedKmph: 10,
      maxSpeedKmph: 25,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    gymToFoodBazar,
    1,
    20,
    {
      vin: `GYM_FOOD_BAZAR_${cycleNo}`,
      routeType: "gym_to_food_bazar",
      placeType: "FOOD_BAZAR",
      minSpeedKmph: 10,
      maxSpeedKmph: 25,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    foodBaazarToNoidaCityCenter,
    1,
    10,
    {
      vin: `FOOD_BAZAR_NOIDA_CITY_CENTER_${cycleNo}`,
      routeType: "food_bazar_to_noida_city_center",
      placeType: "NOIDA_CITY_CENTER",
      minSpeedKmph: 10,
      maxSpeedKmph: 35,
      noiseMeter: 5
    }
  );

  await generateTripWithStayToDB(
    noidaCityCenterToHome,
    8,
    20,
    {
      vin: `NOIDA_CITY_CENTER_HOME_${cycleNo}`,
      routeType: "noida_city_center_to_home",
      placeType: "HOME",
      minSpeedKmph: 10,
      maxSpeedKmph: 40,
      noiseMeter: 5
    }
  );
}

async function main() {
  await connectDB();

  // Fresh data chahiye to uncomment karo
  await GpsRaw.deleteMany({ user_id: userId });

  for (let cycle = 1; cycle <= CYCLES_TO_GENERATE; cycle++) {
    await generateOneDailyCycle(cycle);
  }

  await flushBatch();

  console.log(`\nData inserted successfully.`);
  console.log(`Total records inserted: ${totalInserted}`);

  process.exit(0);
}

main().catch(async (error) => {
  console.error("Data generation failed:", error);

  await flushBatch();

  process.exit(1);
});