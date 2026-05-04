# GPS Clustering Database Setup & Memory Optimization

## Issue
The original `run_clustering.py` script was being killed due to:
1. **Missing MongoDB collections** - Collections weren't explicitly created with proper indexes
2. **Out-of-memory errors** - Large datasets being loaded entirely into memory
3. **No batch processing** - Bulk write operations not batched, causing memory spikes

## Solution

### 1. Initialize MongoDB Collections
Created `config/init_db.py` to properly set up the database.

**Run this first:**
```bash
cd ai-service
python3 config/init_db.py
```

**What it does:**
- Creates three collections: `gps_processed`, `user_clusters`, `cluster_visits`
- Adds optimized indexes for fast queries:
  - User lookups
  - Stay point filtering
  - Cluster IDs
  - Timestamp sorting
- Verifies MongoDB connection
- Shows collection status

**Expected output:**
```
==================================================
GPS Clustering Database Initialization
==================================================

Verifying MongoDB connection...
✓ Successfully connected to MongoDB

Initializing gps_processed collection...
✓ gps_processed collection indexes created
Initializing user_clusters collection...
✓ user_clusters collection indexes created
Initializing cluster_visits collection...
✓ cluster_visits collection indexes created

✓ All collections initialized successfully

Database collections:
  - gps_processed: XXXX documents
  - user_clusters: XXXX documents
  - cluster_visits: XXXX documents
```

### 2. Run Optimized Clustering (Recommended)
Created `jobs/run_clustering_optimized.py` with memory optimization.

**Run clustering:**
```bash
python3 jobs/run_clustering_optimized.py
```

**Improvements:**
- Batch processing (1000 documents per batch)
- Reduced memory footprint
- Better progress reporting
- Error handling with stack traces
- Format output for readability

### 3. Original Script (If Needed)
Still available as `jobs/run_clustering.py`, but use the optimized version for large datasets.

## Database Schema

### gps_processed
```javascript
{
  _id: ObjectId,
  user_id: String,
  lat: Number,
  lng: Number,
  gps_TimeStamp: Number,
  is_stay_point: Boolean,
  is_anomaly: Boolean,
  cluster_id: String  // "-1" for noise, "C0", "C1", etc. for clusters
}
```
**Indexes:** user_id, stay_point+anomaly filter, timestamp, coordinates

### user_clusters
```javascript
{
  _id: ObjectId,
  user_id: String,
  cluster_id: String,
  created_at: Number,
  updated_at: Number,
  clustering_version: String,
  // ... cluster features (from calculate_cluster_features) ...
  // ... place classification (from classify_place) ...
  place_name: String,
  place_api_types: [String]
}
```
**Indexes:** user_id, (user_id, cluster_id) unique, cluster_id

### cluster_visits
```javascript
{
  _id: ObjectId,
  user_id: String,
  cluster_id: String,
  arrival_time: Number,
  departure_time: Number,
  duration_ms: Number,
  // ... other visit details ...
}
```
**Indexes:** user_id, cluster_id, timestamps

## Troubleshooting

### Still getting "Killed"?
1. Check available memory: `free -h`
2. Monitor during execution: `watch -n 1 'ps aux | grep python'`
3. If system RAM < 4GB, add swap space or use a machine with more resources

### MongoDB connection errors?
- Verify URL: `mongodb://10.10.21.44:27017/`
- Check MongoDB is running: `mongosh mongodb://10.10.21.44:27017/`
- Verify firewall allows connection on port 27017

### Collections show 0 documents?
- The collections are created but empty initially
- First run of clustering will populate them
- Pre-existing data may need to be loaded from `gps_processed` collection

## Performance Tips

1. **Always run init_db.py first** - Indexes significantly speed up queries
2. **Use optimized version** - Batch processing prevents memory issues  
3. **Monitor memory** - Check system resources during execution
4. **Increase batch size** - If memory available, increase BATCH_SIZE in run_clustering_optimized.py
5. **Clear old data** - Remove old clusters before clustering new data if space is limited

## Next Steps

1. Run initialization: `python3 config/init_db.py`
2. Verify collections created successfully
3. Run clustering: `python3 jobs/run_clustering_optimized.py`
4. Check results in database
