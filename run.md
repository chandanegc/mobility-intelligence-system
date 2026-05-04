Program run karne ke baad step-by-step:

1. Install & Start
bashnpm install
npm start
Server http://localhost:3000 pe start hoga, MongoDB connect hoga.

2. Pehle Data Generate Karo
Postman mein:
POST http://localhost:3000/api/generate
Content-Type: application/json

{
  "users": 5,
  "days": 30,
  "clearExisting": true
}
Terminal mein progress live dikhega — har user, har din ka count. ~4-5 min lagenge 5 users × 30 days ke liye.

3. Verify Karo Ki Data Gaya
GET http://localhost:3000/api/stats
Response mein milega:

totalRecords → kitne records insert hue
byUser → har user ka count
byActivity → STAY / WALK / DRIVE ka breakdown
byTimeOfDay → morning/afternoon/evening/night


4. MongoDB Compass Se Directly Dekho
Compass open karo → mongodb://localhost:27017 → database gps_tracking → collection gps_data
Wahan har record mein ye sab fields honge — geoHash, activity_type, trip_id, time_of_day sab auto-filled.

5. Agar Journey Simulation Bhi Test Karni Ho
POST http://localhost:3000/api/journey/simulate
Content-Type: application/json

{
  "current": {
    "latC": 28.6139, "langC": 77.2090,
    "createdAt": "2024-01-01T10:00:00",
    "startedAt": "2024-01-01T10:15:00",
    "speedC": 40,
    "user_id": "U001", "vin": "VIN123",
    "accuracy": 7, "soc": 85, "igs": 1,
    "activity_type": "trip-start",
    "gps_TimeStamp": 1704067200,
    "createdOn": 1704067200, "updatedOn": 1704067200
  },
  "last": {
    "latL": 19.0760, "langL": 72.8777,
    "reachedAt": "2024-01-02T14:45:00",
    "returnedAt": "2024-01-02T15:00:00",
    "speedL": 35,
    "accuracy": 5, "soc": 42, "igs": 0,
    "activity_type": "trip-stop",
    "gps_TimeStamp": 1704199500,
    "createdOn": 1704199500, "updatedOn": 1704199500
  }
}
Ye location_points collection mein store hoga.

6. Data Reset Karna Ho
DELETE http://localhost:3000/api/clear

Normal flow: npm start → generate karo → stats check karo → ML pipeline ko gps_data collection feed karo. Koi issue aaye toh batao.