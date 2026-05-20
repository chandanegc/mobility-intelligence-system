# 🚀 GPS Movement Intelligence Project — Complete Usage Guide

## Project Overview
A GPS movement intelligence system that processes raw GPS data → clusters user visits → generates trip segments → analyzes behavioral patterns → trains ML models for next-place prediction.

---

## 📋 Prerequisites Setup

### Step 1: Install Node.js Dependencies
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
npm install
```

### Step 2: Install Python Dependencies
```bash
cd /home/sumeet/Downloads/gps-generator/ai-service
pip install -r requirements.txt
```

### Step 3: Verify MongoDB Connection
Ensure MongoDB is running on `mongodb://10.10.21.44:27017/gps_tracking_ai`

```bash
# Test connection (from gps-generator-export directory)
node -e "
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect('mongodb://10.10.21.44:27017/gps_tracking_ai');
  console.log('✓ MongoDB connected');
  await mongoose.disconnect();
})();
" --input-type=module
```

---

## 🔄 Step-by-Step Execution Pipeline

### **Phase 1: Data Preparation**

#### 1A. Generate Synthetic GPS Data (Optional - if needed)
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node src/index.js   # Generates GPS data via REST API
```
Expected output: Creates `gps_raw` collection with synthetic GPS points (5 users, 30+ days)

---

### **Phase 2: GPS Processing**

#### 2A. Process Raw GPS → Cleaned GPS Points
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node src/app.js
```

**What it does:**
- Reads `gps_raw` collection
- Filters anomalies & outliers
- Detects **stay points** (stationary > 5 min)
- Classifies activities (WALK/DRIVE/STAY)
- Outputs to `gps_processed` collection

**Expected output:** 4-5M processed points

---

### **Phase 3: Clustering & Visit Detection**

#### 3A. Run Spatial Clustering (Python)
```bash
cd /home/sumeet/Downloads/gps-generator/ai-service
python3 jobs/run_clustering_optimized.py
```

**What it does:**
- Applies weighted DBSCAN on stay points
- Identifies meaningful locations (Home, Office, etc.)
- Creates `user_clusters` (meaningful places)
- Creates `cluster_cells` (grid-based optimization)

**Output collections:**
- `user_clusters`
- `cluster_cells`
- `clustering_runs` (metadata)

---

### **Phase 4: Trip Segments Generation** ⭐

#### 4A. Generate Trip Segments for a Single User & Date
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node testTripSegments.js
```

**Default:** Generates trips for `U123` on `2026-05-05`

**What it does:**
- Loads cluster visits (stay points)
- Creates trip segments between consecutive visits
- Calculates metrics: distance, speed, travel mode, data quality
- Adds ML training fields: day_of_week, time_of_day, departure_hour
- Upserts into `trip_segments` collection

**Output:**
```
[trip_segments] user=U123 date=2026-05-05 created=X updated=Y skipped=Z
```

---

#### 4B. Generate Trip Segments for Custom User & Date
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node testTripSegments.js U456 2026-05-06
```

---

#### 4C. Generate Trip Segments for ALL Users on a Date
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node testTripSegments.js --all 2026-05-05
```

**What happens:**
- Finds all unique user_ids that have visits on `2026-05-05`
- Processes each user sequentially
- Generates trips for each
- Prints summary

---

#### 4D. Verify Trip Segments Were Created
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node checkTripSegments.js
```

**Output:**
```
Total trip segments for U123 on 2026-05-05: 5
Sample document: { ... }
```

---

### **Phase 5: Movement Pattern Analysis** (Next - Not yet implemented)

#### 5A. Analyze Movement Patterns
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
# Will use: createUserMovementPatterns()
# Calculates: transition probabilities between clusters
# Output: user_movement_patterns collection
```

---

### **Phase 6: ML Training Data** (Next - Not yet implemented)

#### 6A. Generate ML Training Samples
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
# Will use: createMLTrainingSamples()
# Needs: trip_segments + cluster_visits + user_movement_patterns
# Output: ml_next_place_training_samples, ml_trip_duration_training_samples
```

---

### **Phase 7: Model Training** (Python)

#### 7A. Train Next-Place Prediction Model
```bash
cd /home/sumeet/Downloads/gps-generator/ai-service
python3 ml_next_place_model.py
```

---

## 📊 Data Flow Visualization

```
Raw GPS (gps_raw)
    ↓
GPS Processing (gps_processed)
    ↓
Clustering + Visit Detection (cluster_visits)
    ↓
Trip Segments ★ (trip_segments) ← YOU ARE HERE
    ↓
Movement Patterns (user_movement_patterns)
    ↓
ML Training Samples
    ↓
Model Training
    ↓
Prediction API
```

---

## 🗂️ Key Files & Their Roles

| File | Purpose | Command |
|------|---------|---------|
| `src/app.js` | GPS processing | `node src/app.js` |
| `src/services/tripSegments.service.js` | Trip generation logic | N/A (imported) |
| `testTripSegments.js` | Test/run trip generation | `node testTripSegments.js` |
| `checkTripSegments.js` | Verify results | `node checkTripSegments.js` |
| `inspectClusterVisits.js` | Debug cluster visits | `node inspectClusterVisits.js` |
| `ai-service/jobs/run_clustering_optimized.py` | Clustering | `python3 jobs/run_clustering_optimized.py` |

---

## 📈 Database Collections Status

```
✅ gps_raw              → Generated
✅ gps_processed        → Processed
✅ cluster_cells        → Clustered
✅ user_clusters        → Clustered
✅ cluster_visits       → Detected
✅ trip_segments        → Generated (STEP 4)
⏳ user_movement_patterns › Pending (STEP 5)
⏳ ml_*_training_samples  › Pending (STEP 6)
⏳ Models                › Pending (STEP 7)
```

---

## 🔍 Debugging Commands

### Check Cluster Visits for a User/Date
```bash
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node inspectClusterVisits.js
```

### Check Trip Segments Count
```bash
node -e "
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect('mongodb://10.10.21.44:27017/gps_tracking_ai');
  const Trip = mongoose.model('Trip', {}, 'trip_segments');
  const count = await Trip.countDocuments({ user_id: 'U123', date: '2026-05-05' });
  console.log('Trip segments:', count);
  await mongoose.disconnect();
})();
" --input-type=module
```

### Clear Trip Segments (Reset)
```bash
node -e "
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect('mongodb://10.10.21.44:27017/gps_tracking_ai');
  const Trip = mongoose.model('Trip', {}, 'trip_segments');
  const result = await Trip.deleteMany({ user_id: 'U123', date: '2026-05-05' });
  console.log('Deleted:', result.deletedCount);
  await mongoose.disconnect();
})();
" --input-type=module
```

---

## 🎯 Quick Reference: Common Commands

| Task | Command |
|------|---------|
| Process all GPS | `cd gps-generator-export && node src/app.js` |
| Generate trips (one user) | `node testTripSegments.js U123 2026-05-05` |
| Generate trips (all users) | `node testTripSegments.js --all 2026-05-05` |
| Verify trips created | `node checkTripSegments.js` |
| Inspect visits | `node inspectClusterVisits.js` |
| Run clustering | `cd ai-service && python3 jobs/run_clustering_optimized.py` |

---

## ✅ Validation Checklist

After each phase, verify:

- [ ] Phase 1: `gps_raw` has records
- [ ] Phase 2: `gps_processed` has ~4M records
- [ ] Phase 3: `user_clusters` > 0, `cluster_visits` has records
- [ ] Phase 4: `trip_segments` has records with all fields
  - [ ] `from_cluster_id`, `to_cluster_id`
  - [ ] `trip_start`, `trip_end`, `duration_sec`
  - [ ] `distance_meters`, `distance_km`
  - [ ] `avg_speed_kmph`, `max_speed_kmph`, `travel_mode`
  - [ ] `day_of_week`, `time_of_day`, `departure_hour`
  - [ ] `data_quality` (GOOD/NO_POINTS/GPS_JUMP_FILTERED)

---

## 🚨 Troubleshooting

### "Not enough visits to create trip segments"
- **Cause:** No cluster_visits for that user/date
- **Fix:** Run Phase 3 (clustering) first

### "MongoDB connection failed"
- **Cause:** MongoDB not running on :27017
- **Fix:** Verify MongoDB server is running

### "No GPS points found for trip"
- **Cause:** gps_processed points don't exist between visit times
- **Fix:** Check Phase 2 GPS processing completed

### Trip count is lower than expected
- **Cause:** Some trips filtered due to:
  - Duration < 60 sec
  - Same cluster with gap < 120 sec
  - No GPS jump to next date window
- **Fix:** Check logs for "Skipping" messages

---

## 📝 Next Steps

After Phase 4 (Trip Segments) is complete:

1. **Phase 5:** Generate user movement patterns (transition probabilities)
2. **Phase 6:** Create ML training samples
3. **Phase 7:** Train next-place prediction model
4. **Phase 8:** Deploy prediction API

---

## 🎓 Understanding the Data

### Trip Segment Example
```json
{
  "user_id": "U123",
  "date": "2026-05-05",
  "from_cluster_id": "C5",
  "to_cluster_id": "C3",
  "trip_start": 1777926492,
  "trip_end": 1777927041,
  "duration_sec": 549,
  "distance_meters": 2302,
  "distance_km": 2.3,
  "avg_speed_kmph": 15.09,
  "max_speed_kmph": 24.95,
  "travel_mode": "DRIVE",
  "point_count": 184,
  "valid_segment_count": 183,
  "gps_jump_count": 0,
  "data_quality": "GOOD",
  "start_location": { "lat": 28.6476997, "lng": 77.3343599 },
  "end_location": { "lat": 28.6349711, "lng": 77.3332292 },
  "day_of_week": "Tuesday",
  "time_of_day": "night",
  "departure_hour": 1
}
```

### Interpretation
- User traveled from stay point C5 to C3
- Journey lasted ~9 minutes
- Covered 2.3 km
- Average speed 15 km/h (driving)
- Departed on Tuesday at 1 AM
- High data quality (no GPS jumps)

---

**Happy coding! 🎉 For questions, check the PROJECT_OVERVIEW.md**
