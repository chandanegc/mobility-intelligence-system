import ngeohash from "ngeohash";
import GpsRaw from "../models/gpsRaw.model.js";
import UserLogin from "../models/userLogin.model.js";

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getISTParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    hour: "2-digit",
    hour12: false
  }).formatToParts(date);

  const weekday = parts.find((part) => part.type === "weekday")?.value;
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);

  return { weekday, hour };
}

function getTimeOfDay(date) {
  const { hour } = getISTParts(date);

  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";

  return "night";
}

function toPublicGpsPoint(point) {
  return {
    user_id: point.user_id,
    device_id: point.device_id,
    vin: point.vin,
    device_type: point.device_type,
    lat: point.lat,
    lng: point.lng,
    accuracy: point.accuracy,
    altitude: point.altitude,
    speed: point.speed,
    heading: point.heading,
    gps_timestamp: point.gps_TimeStamp,
    createdOn: point.createdOn
  };
}

export const loginUser = async (req, res) => {
  try {
    const { user_id, device_id, vin = null, device_type = "mobile" } = req.body;

    if (!user_id || !device_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and device_id are required"
      });
    }

    const now = Math.floor(Date.now() / 1000);
    const user = await UserLogin.findOneAndUpdate(
      { user_id, device_id },
      {
        $set: {
          vin,
          device_type,
          last_login_at: now,
          updatedOn: now
        },
        $setOnInsert: {
          createdOn: now
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: user
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Login failed",
      error: err.message
    });
  }
};

export const createUserGpsData = async (req, res) => {
  try {
    const {
      user_id,
      device_id,
      vin = null,
      device_type = "mobile",
      lat,
      lng,
      accuracy = null,
      altitude = null,
      speed = 0,
      heading = 0,
      gps_timestamp
    } = req.body;

    if (!user_id || !device_id) {
      return res.status(400).json({
        success: false,
        message: "user_id and device_id are required"
      });
    }

    if (!isNumber(lat) || !isNumber(lng)) {
      return res.status(400).json({
        success: false,
        message: "lat and lng must be valid numbers"
      });
    }

    const gpsTime = isNumber(gps_timestamp)
      ? gps_timestamp
      : Math.floor(Date.now() / 1000);
    const now = Math.floor(Date.now() / 1000);
    const gpsDate = new Date(gpsTime * 1000);
    const { weekday } = getISTParts(gpsDate);

    const point = await GpsRaw.create({
      user_id,
      device_id,
      vin,
      device_type,
      gps_TimeStamp: gpsTime,
      createdOn: now,
      updatedOn: now,
      lat,
      lng,
      location: {
        type: "Point",
        coordinates: [lng, lat]
      },
      geoHash: ngeohash.encode(lat, lng, 8),
      accuracy,
      altitude,
      speed,
      heading,
      day_of_week: weekday,
      is_weekend: weekday === "Saturday" || weekday === "Sunday",
      time_of_day: getTimeOfDay(gpsDate)
    });

    return res.status(201).json({
      success: true,
      message: "GPS data saved",
      data: toPublicGpsPoint(point)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to save GPS data",
      error: err.message
    });
  }
};

export const getUserGpsData = async (req, res) => {
  try {
    const { user_id, device_id, limit = 100 } = req.query;

    if (!user_id && !device_id) {
      return res.status(400).json({
        success: false,
        message: "Provide user_id or device_id"
      });
    }

    const query = {};
    if (user_id) query.user_id = user_id;
    if (device_id) query.device_id = device_id;

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 1000);
    const points = await GpsRaw.find(query)
      .sort({ gps_TimeStamp: -1 })
      .limit(safeLimit)
      .lean();

    return res.status(200).json({
      success: true,
      count: points.length,
      data: points.map(toPublicGpsPoint)
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to get GPS data",
      error: err.message
    });
  }
};
