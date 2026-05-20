# GPS Movement Intelligence Project — Complete TODO Roadmap

This document is a complete execution checklist for building a production-ready **GPS Movement Intelligence System** that can detect user visits, understand movement patterns, predict the next place, and estimate next location/time.

The main goal is:

```txt
Raw GPS data → Processed GPS → Stay points → Clusters → Visits → Trips → Patterns → ML samples → Prediction API
```

The system should predict:

```txt
Where will the user go next?
When may the user reach there?
What type of place is it?
How confident is the system?
```

---

## 1. Existing Collections

You already have these collections:

```txt
cluster_cells
cluster_visits
clustering_runs
gps_processed
gps_raw
locationpoints
ml_next_place_training_samples
ml_place_type_training_samples
ml_trip_duration_training_samples
trip_segments
user_clusters
user_movement_patterns
```

---

## 2. Collection Role Mapping

| Collection | Main Purpose | Used For ML? |
|---|---|---|
| `gps_raw` | Stores original GPS pings from frontend/device | No direct model training |
| `locationpoints` | Old/raw location data, if used separately | No direct model training |
| `gps_processed` | Cleaned GPS points with speed, distance, stay/move flags, anomaly flags | Indirectly |
| `cluster_cells` | Grid/cell level grouping for scalable clustering | No direct model training |
| `clustering_runs` | Stores clustering job metadata/version | No direct model training |
| `user_clusters` | Final meaningful places like HOME/OFFICE/GYM/OTHER with center lat/lng | Yes, for lookup and place features |
| `cluster_visits` | User visit records: arrival, departure, duration, cluster_id | Very important |
| `trip_segments` | Movement between two consecutive visits | Very important |
| `user_movement_patterns` | Rule-based transition probabilities | Very important fallback |
| `ml_next_place_training_samples` | Training rows for next place prediction | Yes |
| `ml_trip_duration_training_samples` | Training rows for trip duration prediction | Yes |
| `ml_place_type_training_samples` | Training rows for place type classification | Optional/advanced |

---

## 3. Correct End-to-End Pipeline

```txt
gps_raw / locationpoints
        ↓
gps_processed
        ↓
cluster_cells + user_clusters + clustering_runs
        ↓
cluster_visits
        ↓
trip_segments
        ↓
user_movement_patterns
        ↓
ml_next_place_training_samples
ml_trip_duration_training_samples
ml_place_type_training_samples
        ↓
ML model training
        ↓
Prediction API
        ↓
Frontend/map visualization
```

---

## 4. Main Rule of This Project

Do **not** train the model directly on raw lat/lng points.

Instead:

```txt
Predict next_cluster_id first.
Then fetch lat/lng from user_clusters.
```

Reason:

- Raw GPS is noisy.
- User does not go to exact same coordinate every time.
- Meaningful locations are clusters, not single GPS points.
- Cluster prediction is more stable and scalable.

Example:

```txt
Model output: C1
Lookup user_clusters where cluster_id = C1
Return center.lat, center.lng, place_type, place_name
```

---

# PART A — DATA COLLECTION AND FRONTEND GPS OPTIMIZATION

---

## 5. Frontend GPS Collection Checklist

### 5.1 Collect These Fields

Each GPS point should ideally include:

```json
{
  "user_id": "U001",
  "vin": "optional_vehicle_id",
  "lat": 28.5511,
  "lng": 77.2692,
  "accuracy": 10,
  "speed": 12.5,
  "heading": 180,
  "altitude": 210,
  "gps_TimeStamp": 1777887087,
  "device_type": "android",
  "activity_type": "moving",
  "battery": 82,
  "source": "gps"
}
```

### 5.2 Do Not Send Every 3 Seconds Always

Use adaptive GPS collection.

| User State | Collection Frequency |
|---|---|
| Stationary | 30 sec to 2 min |
| Walking | 5–10 sec |
| Driving | 3–5 sec |
| Heading changed sharply | Send immediately |
| Distance changed significantly | Send immediately |
| Low battery | Reduce frequency |

### 5.3 Frontend Should Send GPS When

```txt
1. Distance moved > 20–50 meters
2. Heading changed > 25–35 degrees
3. Speed changed significantly
4. Activity changed: stay → walk → drive
5. Time threshold reached
6. User enters/exits known geofence
```

### 5.4 Heading Change Logic

```txt
heading_diff = abs(current_heading - previous_heading)
if heading_diff > 180:
    heading_diff = 360 - heading_diff

if heading_diff >= 30:
    send_location()
```

### 5.5 Avoid Bad GPS Points

Reject or mark as low confidence if:

```txt
accuracy > 50 meters
lat/lng missing
speed impossible
sudden jump > 500m in few seconds
GPS timestamp older than last point
duplicate point repeated too many times
```

---

# PART B — GPS RAW TO GPS PROCESSED

---

## 6. GPS Preprocessing TODO

Source:

```txt
gps_raw → gps_processed
```

### 6.1 Add Derived Fields

For each point, calculate:

```txt
distance_from_prev_m
time_gap_sec
calculated_speed_mps
is_anomaly
is_stay_candidate
activity_type
geohash
grid_key
day_of_week
time_of_day
hour
is_weekend
processed_at
```

### 6.2 Activity Classification Rules

Basic speed-based rules:

```txt
speed < 0.5 m/s        → stationary
0.5 to 2.0 m/s         → walking
2.0 to 6.0 m/s         → cycling/slow vehicle
> 6.0 m/s              → driving
```

Use both device speed and calculated speed.

Best approach:

```txt
if device_speed exists and accuracy is good:
    use device speed
else:
    calculate speed from distance/time
```

### 6.3 Stay Candidate Detection

A point is a stay candidate when:

```txt
speed is low
location is near previous points
user remains in same radius for minimum time
accuracy is acceptable
```

Recommended starting values:

```txt
stay_radius_m = 50
min_stay_duration_sec = 300
min_points = 3 to 5
```

### 6.4 Validation Queries

Count raw and processed:

```js
db.gps_raw.countDocuments()
db.gps_processed.countDocuments()
```

User-wise processed count:

```js
db.gps_processed.aggregate([
  {
    $group: {
      _id: "$user_id",
      total: { $sum: 1 },
      stay_points: {
        $sum: { $cond: [{ $eq: ["$is_stay_point", true] }, 1, 0] }
      },
      anomalies: {
        $sum: { $cond: [{ $eq: ["$is_anomaly", true] }, 1, 0] }
      }
    }
  }
])
```

---

# PART C — CLUSTERING

---

## 7. Clustering TODO

Source:

```txt
gps_processed stay points → user_clusters + cluster_cells + clustering_runs
```

### 7.1 Use Only Stay Points for Clustering

Do not cluster all GPS points.

Use:

```txt
is_stay_point = true
is_anomaly != true
accuracy <= acceptable threshold
```

### 7.2 DBSCAN Parameters

Starting values:

```txt
eps_meters = 50
min_samples = 5 to 10
```

Adjust based on data:

| Problem | Meaning | Fix |
|---|---|---|
| Too many clusters | eps too small or min_samples too low | Increase eps or min_samples |
| Too few clusters | eps too large or min_samples too high | Decrease eps or min_samples |
| HOME split into many clusters | GPS noise or eps too small | Increase eps to 75m |
| Office and nearby cafe merge | eps too large | Decrease eps to 30–40m |

### 7.3 Store in user_clusters

Each cluster should have:

```json
{
  "user_id": "U001",
  "cluster_id": "C1",
  "center": {
    "lat": 28.5511,
    "lng": 77.2692
  },
  "center_location": {
    "type": "Point",
    "coordinates": [77.2692, 28.5511]
  },
  "place_type": "HOME",
  "place_name": null,
  "visit_count": 20,
  "avg_duration_sec": 18000,
  "avg_arrival_hour": 19.2,
  "avg_departure_hour": 8.5,
  "day_visit_ratio": 0.35,
  "night_visit_ratio": 0.65,
  "weekday_visit_ratio": 0.75,
  "weekend_visit_ratio": 0.25,
  "place_type_confidence": 0.92,
  "clustering_version": "RUN_U001_xxx"
}
```

### 7.4 Place Type Rule Classification

Basic rules:

#### HOME

```txt
High night stay ratio
Long duration
Frequent daily visits
Usually first/last place of day
```

#### OFFICE

```txt
High weekday ratio
Mostly daytime visits
Long duration between 9 AM and 7 PM
Low weekend ratio
```

#### GYM

```txt
Short-medium duration
Morning/evening pattern
Repeated few days a week
```

#### CAFE/OTHER

```txt
Shorter duration
Irregular visits
May require Place API later
```

### 7.5 Validation Queries

```js
db.user_clusters.countDocuments()
db.cluster_cells.countDocuments()
db.clustering_runs.find().sort({ created_at: -1 }).limit(5)
```

User-wise clusters:

```js
db.user_clusters.aggregate([
  {
    $group: {
      _id: "$user_id",
      clusters: { $sum: 1 },
      home: { $sum: { $cond: [{ $eq: ["$place_type", "HOME"] }, 1, 0] } },
      office: { $sum: { $cond: [{ $eq: ["$place_type", "OFFICE"] }, 1, 0] } },
      gym: { $sum: { $cond: [{ $eq: ["$place_type", "GYM"] }, 1, 0] } }
    }
  }
])
```

---

# PART D — VISIT DETECTION

---

## 8. Visit Detection TODO

Source:

```txt
gps_processed + user_clusters → cluster_visits
```

### 8.1 What Is a Visit?

A visit means:

```txt
User entered a known cluster area
Stayed for meaningful duration
Then left that cluster
```

### 8.2 cluster_visits Required Fields

```json
{
  "user_id": "U001",
  "cluster_id": "C1",
  "place_type": "HOME",
  "visit_start_time": 1777887087,
  "visit_end_time": 1777900000,
  "duration_sec": 12913,
  "date": "2026-05-01",
  "day_of_week": "Monday",
  "arrival_hour": 18,
  "departure_hour": 8,
  "time_of_day": "evening",
  "prev_cluster_id": "C0",
  "next_cluster_id": "C2",
  "source": "cluster_detection"
}
```

### 8.3 Visit Merge Rules

Merge visits when:

```txt
same user
same cluster
small gap between visits, e.g. < 10–15 min
user did not meaningfully leave area
```

### 8.4 Ignore Weak Visits

Ignore/mark low confidence if:

```txt
duration < 5 min
GPS accuracy bad
only 1 point available
cluster distance too far
```

### 8.5 Validation Queries

```js
db.cluster_visits.countDocuments()
```

User-wise visits:

```js
db.cluster_visits.aggregate([
  {
    $group: {
      _id: "$user_id",
      total_visits: { $sum: 1 },
      avg_duration_sec: { $avg: "$duration_sec" },
      min_start: { $min: "$visit_start_time" },
      max_start: { $max: "$visit_start_time" }
    }
  }
])
```

Check visit sequence:

```js
db.cluster_visits.find({ user_id: "U001" })
  .sort({ visit_start_time: 1 })
  .limit(20)
```

---

# PART E — TRIP SEGMENTATION

---

## 9. Trip Segments TODO

Source:

```txt
cluster_visits → trip_segments
```

### 9.1 What Is a Trip Segment?

A trip is movement between two consecutive visits.

Example:

```txt
HOME visit ends at 09:00
OFFICE visit starts at 10:00
Trip: HOME → OFFICE
Trip duration: 60 min
```

### 9.2 trip_segments Required Fields

```json
{
  "user_id": "U001",
  "from_cluster_id": "C0",
  "to_cluster_id": "C1",
  "from_place_type": "HOME",
  "to_place_type": "OFFICE",
  "trip_start_time": 1777887087,
  "trip_end_time": 1777890687,
  "trip_duration_min": 60,
  "distance_km": 14.2,
  "avg_speed_kmph": 22,
  "travel_mode": "DRIVING",
  "day_of_week": "Monday",
  "departure_hour": 9,
  "time_of_day": "morning",
  "date": "2026-05-01"
}
```

### 9.3 Avoid Bad Trips

Do not create trip if:

```txt
from_cluster_id == to_cluster_id and gap is very small
trip duration <= 0
distance is impossible
trip duration too large due to missing visit
```

### 9.4 Validation Queries

```js
db.trip_segments.countDocuments()
```

User-wise trip count:

```js
db.trip_segments.aggregate([
  {
    $group: {
      _id: "$user_id",
      trips: { $sum: 1 },
      avg_duration_min: { $avg: "$trip_duration_min" },
      avg_distance_km: { $avg: "$distance_km" }
    }
  }
])
```

Check bad trips:

```js
db.trip_segments.find({ trip_duration_min: { $lte: 0 } })
```

---

# PART F — USER MOVEMENT PATTERNS

---

## 10. Movement Pattern Analysis TODO

Source:

```txt
trip_segments → user_movement_patterns
```

### 10.1 Purpose

This is your rule-based prediction engine.

It answers:

```txt
When user is at OFFICE on Monday evening, where does he usually go next?
```

### 10.2 Store Patterns Like This

```json
{
  "user_id": "U001",
  "from_cluster_id": "C1",
  "from_place_type": "OFFICE",
  "day_of_week": "Monday",
  "time_of_day": "evening",
  "departure_hour_bucket": "18-19",
  "next_places": [
    {
      "to_cluster_id": "C0",
      "to_place_type": "HOME",
      "count": 24,
      "probability": 0.80,
      "avg_trip_duration_min": 42
    },
    {
      "to_cluster_id": "C2",
      "to_place_type": "GYM",
      "count": 5,
      "probability": 0.17,
      "avg_trip_duration_min": 28
    }
  ],
  "total_transitions": 30,
  "updated_at": 1777887087
}
```

### 10.3 Pattern Levels

Create multiple fallback levels:

```txt
Level 1: user + from_cluster + day_of_week + time_of_day
Level 2: user + from_cluster + time_of_day
Level 3: user + from_cluster
Level 4: user most frequent next place
Level 5: global pattern for all users
```

### 10.4 Validation Query

```js
db.user_movement_patterns.countDocuments()
```

Check strong patterns:

```js
db.user_movement_patterns.find({
  "next_places.0.probability": { $gte: 0.7 }
})
```

---

# PART G — ML TRAINING SAMPLES

---

## 11. Next Place Training Samples

Source:

```txt
trip_segments + cluster_visits + user_clusters → ml_next_place_training_samples
```

### 11.1 Target

```txt
to_cluster_id
```

### 11.2 Input Features

```txt
user_id
from_cluster_id
from_place_type
prev_cluster_id
prev_place_type
day_of_week
departure_hour
time_of_day
is_weekend
current_stay_duration_min
visit_count_from_cluster
historical_transition_count
historical_transition_probability
```

### 11.3 Do Not Use Leakage Features

Do not use these as input features:

```txt
to_cluster_id
to_place_type
arrival_hour
trip_end_time
next_lat
next_lng
future duration
```

These are future values.

### 11.4 Example Row

```json
{
  "user_id": "U001",
  "from_cluster_id": "C1",
  "from_place_type": "OFFICE",
  "prev_cluster_id": "C2",
  "prev_place_type": "GYM",
  "day_of_week": "Monday",
  "departure_hour": 18,
  "time_of_day": "evening",
  "is_weekend": false,
  "current_stay_duration_min": 480,
  "historical_transition_probability": 0.80,
  "to_cluster_id": "C0",
  "to_place_type": "HOME"
}
```

---

## 12. Trip Duration Training Samples

Source:

```txt
trip_segments → ml_trip_duration_training_samples
```

### 12.1 Target

```txt
trip_duration_min
```

### 12.2 Input Features

```txt
user_id
from_cluster_id
to_cluster_id
from_place_type
to_place_type
day_of_week
departure_hour
time_of_day
is_weekend
distance_km
historical_avg_duration_min
travel_mode
```

### 12.3 Example Row

```json
{
  "user_id": "U001",
  "from_cluster_id": "C1",
  "to_cluster_id": "C0",
  "from_place_type": "OFFICE",
  "to_place_type": "HOME",
  "day_of_week": "Monday",
  "departure_hour": 18,
  "time_of_day": "evening",
  "distance_km": 12.5,
  "historical_avg_duration_min": 42,
  "trip_duration_min": 45
}
```

---

## 13. Place Type Training Samples

Source:

```txt
user_clusters → ml_place_type_training_samples
```

### 13.1 Target

```txt
place_type
```

### 13.2 Input Features

```txt
avg_arrival_hour
avg_departure_hour
avg_duration_sec
visit_count
day_visit_ratio
night_visit_ratio
weekday_visit_ratio
weekend_visit_ratio
first_seen_hour
last_seen_hour
unique_days_visited
```

### 13.3 Note

This model is optional in the beginning.

If your rule-based place type classification is working well, first focus on:

```txt
1. next place prediction
2. trip duration prediction
```

---

# PART H — MODEL TRAINING

---

## 14. Models to Train

### 14.1 Model 1 — Next Place Model

```txt
Input collection: ml_next_place_training_samples
Target: to_cluster_id
Model type: XGBoostClassifier / RandomForestClassifier
Output: top 3 next_cluster_id with confidence
```

### 14.2 Model 2 — Trip Duration Model

```txt
Input collection: ml_trip_duration_training_samples
Target: trip_duration_min
Model type: XGBoostRegressor / RandomForestRegressor
Output: expected_trip_duration_min
```

### 14.3 Model 3 — Place Type Model

```txt
Input collection: ml_place_type_training_samples
Target: place_type
Model type: XGBoostClassifier / RandomForestClassifier
Output: HOME/OFFICE/GYM/OTHER
```

---

## 15. Model Training Steps

```txt
1. Load data from MongoDB
2. Drop invalid rows
3. Check class distribution
4. Split train/test by time, not random only
5. Encode categorical features
6. Train baseline model first
7. Train ML model
8. Evaluate accuracy/top-3 accuracy/MAE
9. Save model with joblib
10. Save feature metadata
11. Create prediction API
```

---

## 16. Evaluation Metrics

### 16.1 Next Place Model

Use:

```txt
Accuracy
Top-3 Accuracy
Per-user Accuracy
Confusion Matrix
Precision/Recall per cluster
```

Top-3 accuracy is very important.

Example:

```txt
Prediction:
1. HOME 0.55
2. GYM 0.30
3. CAFE 0.10

Actual: GYM

Normal accuracy: wrong
Top-3 accuracy: correct
```

### 16.2 Trip Duration Model

Use:

```txt
MAE - Mean Absolute Error
RMSE - Root Mean Squared Error
Median Absolute Error
```

Good starting goal:

```txt
MAE < 10–15 minutes
```

### 16.3 Place Type Model

Use:

```txt
Accuracy
F1-score
Confusion matrix
```

---

## 17. Avoid Overfitting and Data Leakage

### 17.1 Do Not Random Split Only

For movement prediction, time matters.

Better:

```txt
Train on first 70–80% days
Test on last 20–30% days
```

### 17.2 Do Not Use Future Data

Wrong:

```txt
Using to_cluster_id as input
Using arrival time to predict destination
Using trip end time to predict destination
```

Correct:

```txt
Use only data available before departure
```

### 17.3 Check Class Imbalance

```js
db.ml_next_place_training_samples.aggregate([
  {
    $group: {
      _id: "$to_cluster_id",
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } }
])
```

If one destination dominates, model may always predict that cluster.

---

# PART I — PREDICTION API

---

## 18. Prediction API Flow

Input:

```json
{
  "user_id": "U001",
  "current_cluster_id": "C1",
  "current_place_type": "OFFICE",
  "prev_cluster_id": "C2",
  "prev_place_type": "GYM",
  "current_stay_duration_min": 480
}
```

Process:

```txt
1. Get current date/time context
2. Create feature row
3. Call next place ML model
4. Get top 3 next_cluster_id
5. Fetch lat/lng from user_clusters
6. Call trip duration model for each predicted cluster
7. If ML confidence is low, use user_movement_patterns fallback
8. Return final response
```

Output:

```json
{
  "user_id": "U001",
  "current": {
    "cluster_id": "C1",
    "place_type": "OFFICE"
  },
  "predictions": [
    {
      "rank": 1,
      "next_cluster_id": "C0",
      "next_place_type": "HOME",
      "place_name": null,
      "lat": 28.5511,
      "lng": 77.2692,
      "confidence": 0.86,
      "expected_trip_duration_min": 42,
      "source": "ml_model"
    }
  ]
}
```

---

## 19. Fallback Logic

Use this:

```txt
If ML confidence >= 0.70:
    use ML prediction

If ML confidence < 0.70:
    use user_movement_patterns

If no exact movement pattern:
    use relaxed pattern

If no relaxed pattern:
    use most frequent next place for user

If no user history:
    return not_enough_history
```

Fallback priority:

```txt
1. user + from_cluster + day_of_week + time_of_day
2. user + from_cluster + time_of_day
3. user + from_cluster
4. user most frequent destination
5. global common transition
```

---

# PART J — ACCURACY IMPROVEMENTS

---

## 20. Data Quality Improvements

### 20.1 Improve GPS Quality

```txt
Reject low accuracy points
Use speed sanity checks
Remove impossible jumps
Smooth noisy movement
Use map matching if possible
```

### 20.2 Improve Stay Detection

```txt
Use radius + duration window
Merge short interruptions
Ignore temporary GPS drift
Use speed + distance + heading together
```

### 20.3 Improve Clustering

```txt
Cluster only stay points
Tune eps per city/context
Use geohash/grid pre-filter
Store cluster confidence
Re-run clustering periodically
```

### 20.4 Improve Visit Detection

```txt
Merge nearby same-cluster visits
Add enter/exit time confidence
Ignore too-short visits
Add prev/next cluster pointers
```

### 20.5 Improve Trip Segments

```txt
Calculate actual route distance if available
Compare straight-line distance vs route distance
Detect travel mode
Handle missing gaps
```

---

## 21. Feature Improvements for ML

Add these features later:

```txt
last_2_clusters
last_3_clusters
last_place_type_sequence
days_since_last_visit_to_target
visit_frequency_of_from_cluster
visit_frequency_of_to_cluster
historical_transition_probability
historical_avg_trip_duration
hour_bucket
month
is_holiday
weather_condition
traffic_level
battery_low_flag
device_type
```

---

## 22. Accuracy Boosting Strategy

Use ensemble logic:

```txt
Final score =
    0.60 * ML probability
  + 0.30 * rule-based transition probability
  + 0.10 * recency score
```

Example:

```txt
ML says HOME = 0.65
Pattern says HOME = 0.85
Recent history supports HOME
Final confidence becomes stronger
```

---

## 23. Personalization Strategy

For production:

```txt
Start with global model
Use user_id as feature
Use user_movement_patterns for personalization
Later create user-level fine tuning only for users with enough history
```

Do not train one model per user initially.

---

## 24. Cold Start Handling

When new user has no history:

```txt
1. Collect at least 3–7 days of data
2. Detect HOME first
3. Detect OFFICE/regular places
4. Use rule-based patterns first
5. Enable ML prediction after enough trips
```

Minimum recommended history:

```txt
30+ visits
20+ trip segments
7+ days data
```

---

# PART K — SCALABILITY

---

## 25. MongoDB Indexes

Create indexes:

```js
db.gps_raw.createIndex({ user_id: 1, gps_TimeStamp: 1 })
db.gps_processed.createIndex({ user_id: 1, gps_TimeStamp: 1 })
db.gps_processed.createIndex({ location: "2dsphere" })
db.user_clusters.createIndex({ user_id: 1, cluster_id: 1 }, { unique: true })
db.user_clusters.createIndex({ center_location: "2dsphere" })
db.cluster_visits.createIndex({ user_id: 1, visit_start_time: 1 })
db.trip_segments.createIndex({ user_id: 1, trip_start_time: 1 })
db.user_movement_patterns.createIndex({ user_id: 1, from_cluster_id: 1, day_of_week: 1, time_of_day: 1 })
db.ml_next_place_training_samples.createIndex({ user_id: 1, from_cluster_id: 1 })
db.ml_trip_duration_training_samples.createIndex({ user_id: 1, from_cluster_id: 1, to_cluster_id: 1 })
```

---

## 26. Batch Processing Strategy

For large data:

```txt
Process user-wise
Process day-wise
Use pagination/cursor
Avoid loading millions of rows into memory
Save progress checkpoint
Use clustering_run_id/version
```

### 26.1 Recommended Batch Flow

```txt
For each user:
    Process raw GPS in chunks
    Save gps_processed
    Run clustering on stay points
    Detect visits
    Generate trips
    Generate ML samples
```

---

## 27. Reprocessing Strategy

Use versioning:

```txt
clustering_version
processing_version
model_version
training_run_id
```

Never overwrite blindly.

Store:

```txt
model_version
trained_at
training_data_count
accuracy
top3_accuracy
MAE
features_used
```

---

# PART L — MONITORING AND DEBUGGING

---

## 28. Dashboard Metrics

Track:

```txt
raw points count
processed points count
stay points count
clusters per user
visits per user
trips per user
ML samples count
prediction confidence
fallback usage percentage
model accuracy
trip duration error
```

---

## 29. Debug Visualizations

Create map views for:

```txt
raw GPS polyline
processed points
stay points
cluster centers
cluster boundary/circle
visit sequence
trip segments
predicted next place
actual next place
```

---

## 30. Common Problems and Fixes

| Problem | Possible Cause | Fix |
|---|---|---|
| No clusters created | Stay detection too strict | Lower min stay duration or min_samples |
| Too many clusters | GPS noise or eps too small | Increase eps and merge nearby clusters |
| HOME not detected | Night ratio logic wrong | Check visit times and timezone |
| Trip count low | cluster_visits missing/incorrect | Validate visit sequence |
| Model accuracy 1.0 | Data leakage or synthetic data too simple | Check features and test split |
| Model always predicts HOME | Class imbalance | Use top-3, add features, balance data |
| Duration prediction poor | Distance/travel mode missing | Add route distance, traffic/time features |
| API returns null lat/lng | user_clusters lookup issue | Check user_id + cluster_id index |

---

# PART M — SECURITY AND PRIVACY

---

## 31. Privacy Checklist

GPS data is sensitive. Add:

```txt
User consent
Data retention policy
Access control
Encryption at rest if possible
Encryption in transit
Delete user data API
Anonymized analytics
Role-based dashboard access
```

---

## 32. Data Retention Strategy

Recommended:

```txt
Raw GPS: keep limited period, e.g. 30–90 days
Processed GPS: keep longer if needed
Clusters/visits/trips: keep for intelligence layer
Aggregated patterns: keep long-term
```

---

# PART N — PRODUCTION FEATURES

---

## 33. Features to Add Later

### 33.1 Real-Time Features

```txt
Live current cluster detection
Live trip detection
ETA prediction
Deviation from normal route
Anomaly movement detection
```

### 33.2 Intelligence Features

```txt
Daily movement summary
Weekly routine report
Most visited places
Time spent at home/office
Unusual visit alert
Late arrival prediction
Frequent route detection
Travel mode statistics
```

### 33.3 Map Features

```txt
Daily polyline
Stay markers
Visit timeline
Cluster labels
Prediction marker
Actual vs predicted route
```

### 33.4 Business/Product Features

```txt
User routine intelligence
Vehicle usage pattern
Office commute analytics
Delivery behavior pattern
Smart reminders based on movement
Personalized location suggestions
```

---

# PART O — EXECUTION COMMANDS

---

## 34. Recommended Execution Order

```bash
# 1. Generate synthetic data
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{"users": 5, "days": 30, "clearExisting": true}'

# 2. Process GPS
node src/app.js

# 3. Run clustering
python3 ai-service/jobs/run_clustering_optimized.py

# 4. Run visit detection if not included in clustering job
python3 ai-service/clustering/visit_detection.py

# 5. Generate trip segments
node testTripSegments.js --all

# 6. Generate movement patterns
curl -X POST http://localhost:3001/api/ml/movement-patterns

# 7. Generate ML training samples
curl -X POST http://localhost:3001/api/ml/training-samples

# 8. Export training data if needed
curl "http://localhost:3001/api/ml/export?format=csv"

# 9. Train ML model
python3 ai-service/ml_next_place_model.py

# 10. Run prediction API
uvicorn ai-service.app:app --reload --host 0.0.0.0 --port 8000
```

---

# PART P — FINAL CHECKLIST

---

## 35. Must-Complete Checklist

### Data Layer

- [ ] `gps_raw` generated correctly
- [ ] `gps_processed` count close to raw count
- [ ] Bad GPS/anomaly detection working
- [ ] Stay points detected correctly
- [ ] Timezone handled correctly

### Clustering Layer

- [ ] DBSCAN running user-wise
- [ ] `user_clusters` generated
- [ ] HOME/OFFICE/GYM/OTHER labeling working
- [ ] Cluster centers stored with lat/lng
- [ ] `center_location` stored as GeoJSON Point
- [ ] `clustering_runs` storing metadata

### Visit Layer

- [ ] `cluster_visits` generated
- [ ] Visit start/end times correct
- [ ] Duration calculation correct
- [ ] Same-cluster small gaps merged
- [ ] prev/next cluster pointers added

### Trip Layer

- [ ] `trip_segments` generated
- [ ] from/to cluster correct
- [ ] duration and distance correct
- [ ] travel mode calculated
- [ ] invalid trips removed

### Pattern Layer

- [ ] `user_movement_patterns` generated
- [ ] Transition probabilities correct
- [ ] Multi-level fallback implemented
- [ ] Average trip duration stored

### ML Layer

- [ ] `ml_next_place_training_samples` generated
- [ ] `ml_trip_duration_training_samples` generated
- [ ] `ml_place_type_training_samples` generated if needed
- [ ] Leakage features removed
- [ ] Time-based train/test split used
- [ ] Top-3 accuracy calculated
- [ ] Model files saved

### Prediction Layer

- [ ] `/predict-next-place` API created
- [ ] Top 3 predictions returned
- [ ] Lat/lng fetched from `user_clusters`
- [ ] Duration prediction added
- [ ] Fallback to `user_movement_patterns` added
- [ ] Low-confidence handling added

### Production Layer

- [ ] MongoDB indexes created
- [ ] Batch processing implemented
- [ ] Model versioning added
- [ ] Monitoring metrics added
- [ ] Privacy/security considered
- [ ] Map debug view added

---

# 36. Final Recommended Priority

Do this in order:

```txt
1. Finish gps_processed for all users
2. Validate stay points
3. Run clustering
4. Validate user_clusters quality
5. Run visit detection
6. Validate cluster_visits sequence
7. Generate trip_segments
8. Generate user_movement_patterns
9. Generate ML training samples
10. Train next place model
11. Train trip duration model
12. Build prediction API
13. Test prediction vs actual next visit
14. Add fallback and confidence logic
15. Add dashboard/map visualization
```

---

# 37. Core Success Definition

Your project is accurate when:

```txt
1. User clusters represent real meaningful places.
2. Visits are correctly detected.
3. Trips are correctly created between visits.
4. Movement patterns show realistic probabilities.
5. ML predicts correct next cluster in top 3.
6. Duration model gives acceptable ETA error.
7. API returns usable lat/lng and confidence.
```

---

# 38. Most Important Technical Decision

The most important design decision is:

```txt
Predict cluster_id, not raw lat/lng.
```

This makes the system:

```txt
more accurate
more scalable
less noisy
easier to explain
better for map visualization
better for production use
```

---

# 39. Immediate Next Action

Your next action should be:

```txt
Complete gps_processed → run clustering → validate user_clusters → generate cluster_visits.
```

Do not train the model before validating:

```txt
cluster_visits
trip_segments
ml_next_place_training_samples
```

Without clean visits and trips, the ML model will learn wrong patterns.