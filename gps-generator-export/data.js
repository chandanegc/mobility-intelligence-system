import ngeohash from "ngeohash";
import GpsRaw from "./src/models/gpsRaw.model.js";
import connectDB from "./config/db.js";
import "dotenv/config";
import {homeTooffice,
  officeToLunch,
  homeToeyeCare,
  homeToGym,
  gymToFoodBazar,
  foodBaazarToNoidaCityCenter,
  noidaCityCenterToHome,} from './src/utils/data.js'

const userId = "U123";
const gapSeconds = 5;
const stayGapSeconds = 30;

let currentStartTime = new Date("2026-05-04T09:15:00+05:30").getTime();
let globalPointIndex = 0;

function getTimeOfDay(date) {
  const hour = date.getHours();
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

  lat1 = (lat1 * Math.PI) / 180;
  lat2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function randomNoiseMeter(lat, lng, maxMeter = 20) {
  const r = maxMeter / 111320;

  const newLat = lat + (Math.random() * 2 - 1) * r;
  const newLng =
    lng + ((Math.random() * 2 - 1) * r) / Math.cos((lat * Math.PI) / 180);

  return [Number(newLat.toFixed(7)), Number(newLng.toFixed(7))];
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
    heading,
    accuracy: Math.floor(Math.random() * 8) + 5,
    altitude: null,
    hdop: Number((Math.random() * 0.8 + 0.8).toFixed(2)),
    soc: 85,
    igs: 1,

    day_of_week: date.toLocaleDateString("en-US", { weekday: "long" }),
    is_weekend: [0, 6].includes(date.getDay()),
    time_of_day: getTimeOfDay(date),

    processed: false,

    route_type: routeType,
    movement_type: movementType,
    place_type: placeType,
    point_index: pointIndex
  };
}

function generateTripWithStay(
  polyline,
  stayHours = 0,
  stayMinutes = 0,
  options = {}
) {
  const {
    vin = "TRIP_001",
    routeType = "home_to_office",
    placeType = "OFFICE"
  } = options;

  const movingData = polyline.map(([lat, lng], index) => {
    const date = new Date(currentStartTime + index * gapSeconds * 1000);

    let speed = 0;
    let heading = 0;

    if (index > 0) {
      const [prevLat, prevLng] = polyline[index - 1];
      const distance = getDistanceMeter(prevLat, prevLng, lat, lng);

      speed = Number((distance / gapSeconds).toFixed(2));
      heading = getHeading(prevLat, prevLng, lat, lng);
    }

    return createBaseDoc({
      lat,
      lng,
      date,
      speed,
      heading,
      vin,
      routeType,
      movementType: "moving",
      pointIndex: globalPointIndex++
    });
  });

 const movingEndTime =
  currentStartTime + (polyline.length - 1) * gapSeconds * 1000 + gapSeconds * 1000;

  const stayTotalMinutes = stayHours * 60 + stayMinutes;
  const stayTotalPoints = Math.floor(
    (stayTotalMinutes * 60) / stayGapSeconds
  );

  const [baseLat, baseLng] = polyline[polyline.length - 1];

  const stayData = Array.from({ length: stayTotalPoints }, (_, index) => {
    const [lat, lng] = randomNoiseMeter(baseLat, baseLng, 20);
    const date = new Date(movingEndTime + index * stayGapSeconds * 1000);

    return createBaseDoc({
      lat,
      lng,
      date,
      speed: Number((Math.random() * 0.4).toFixed(2)),
      heading: Math.floor(Math.random() * 360),
      vin,
      routeType,
      movementType: "stay",
      placeType,
      pointIndex: globalPointIndex++
    });
  });

  const stayEndTime =
    movingEndTime + stayTotalPoints * stayGapSeconds * 1000;

  currentStartTime = stayEndTime;

  return [...movingData, ...stayData];
}

/////////////////////////$$$$$$$$$$$$$$$$$$$$$$$$$$$$444444444  $$$$$$$$$$$$$$$$$$$$$$$$$$$$/////////////////////////


/////
const homeTohomeData = generateTripWithStay(
 [ [28.6477, 77.33436]],
  0,
  30,
  {
    vin: "HOME_HOME_001",
    routeType: "home_to_home",
    placeType: "HOME"
  }
);

const homeToOfficeData = generateTripWithStay(
  homeTooffice,
  4,
  30,
  {
    vin: "HOME_OFFICE_001",
    routeType: "home_to_office",
    placeType: "OFFICE"
  }
);

const officeToLunchData = generateTripWithStay(
  officeToLunch,
  1,
  10,
  {
    vin: "OFFICE_LUNCH_001",
    routeType: "office_to_lunch",
    placeType: "LUNCH"
  }
);

const lunchToOfficeData = generateTripWithStay(
 [...officeToLunch].reverse()  ,
  5,
  32,
  {
    vin: "LUNCH_OFFICE_001",
    routeType: "lunch_to_office",
    placeType: "OFFICE"
  }
);


const officeToHomeData = generateTripWithStay(
  [...homeTooffice].reverse(),
  0,
  46,
  {
    vin: "OFFICE_HOME_001",
    routeType: "office_to_home",
    placeType: "HOME"
  }
);

const homeToEyeCenter = generateTripWithStay(
  homeToeyeCare,
  1,
  10,
  {
    vin: "HOME_EYE_CENTER_001",
    routeType: "home_to_eye_center",
    placeType: "EYE_CENTER"
  }
);

const EyeCenterToHome = generateTripWithStay(
  [...homeToeyeCare].reverse(),
  1,
  10,
  {
    vin: "EYE_CENTER_HOME_001",
    routeType: "eye_center_to_home",
    placeType: "EYE_CENTER"
  }
);

const homeToGymData = generateTripWithStay(
  homeToGym,
  1,
  10,
  {
    vin: "HOME_GYM_001",
    routeType: "home_to_gym",
    placeType: "GYM"
  }
);

const gymToHomeFoodBazar = generateTripWithStay(
  gymToFoodBazar,
  1,
  20,
  {
    vin: "GYM_FOOD_BAZAR_001",
    routeType: "gym_to_food_bazar",
    placeType: "FOOD_BAZAR"
  }
);

const foodBazarToNoidaCityCenterData = generateTripWithStay(
  foodBaazarToNoidaCityCenter,
  1,
  10,
  {
    vin: "FOOD_BAZAR_NOIDA_CITY_CENTER_001",
    routeType: "food_bazar_to_noida_city_center",
    placeType: "NOIDA_CITY_CENTER"
  }
);

const NoidaCityCentertoHomeData = generateTripWithStay(
  noidaCityCenterToHome,
  8,
  20,
  {
    vin: "NOIDA_CITY_CENTER_HOME_001",
    routeType: "noida_city_center_to_home",
    placeType: "HOME"
  }
);


await connectDB();

await GpsRaw.insertMany([
    ...homeTohomeData,
    ...homeToOfficeData,
    ...officeToLunchData,
    ...lunchToOfficeData,
    ...officeToHomeData,
    ...homeToEyeCenter,
    ...EyeCenterToHome,
    ...homeToGymData,
    ...gymToHomeFoodBazar,
    ...foodBazarToNoidaCityCenterData,
    ...NoidaCityCentertoHomeData
]);

console.log("Data inserted successfully");