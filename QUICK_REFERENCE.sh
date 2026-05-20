#!/bin/bash
# GPS Movement Intelligence Project — Quick Execution Cheatsheet

# ============================================================================
# SETUP (one time only)
# ============================================================================
echo "=== SETUP ==="
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
npm install

cd /home/sumeet/Downloads/gps-generator/ai-service  
pip install -r requirements.txt

# ============================================================================
# PHASE 1 & 2: DATA PROCESSING
# ============================================================================
echo "=== PROCESS RAW GPS DATA ==="
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node src/app.js
# Outputs to: gps_processed collection

echo "=== GENERATE SYNTHETIC DATA (if needed) ==="
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node src/index.js
# Outputs to: gps_raw collection

# ============================================================================
# PHASE 3: CLUSTERING & VISITS
# ============================================================================
echo "=== RUN SPATIAL CLUSTERING ==="
cd /home/sumeet/Downloads/gps-generator/ai-service
python3 jobs/run_clustering_optimized.py
# Outputs to: user_clusters, cluster_cells, clustering_runs collections

# ============================================================================
# PHASE 4: TRIP SEGMENTS ⭐ (YOUR CURRENT STEP)
# ============================================================================
echo "=== GENERATE TRIP SEGMENTS ==="

# Option A: Single user, specific date (default: U123, 2026-05-05)
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node testTripSegments.js

# Option B: Custom user and date
node testTripSegments.js U456 2026-05-06

# Option C: All users for a date
node testTripSegments.js --all 2026-05-05

# Option D: Verify results
node checkTripSegments.js

# ============================================================================
# DEBUGGING & INSPECTION
# ============================================================================
echo "=== INSPECT CLUSTER VISITS ==="
cd /home/sumeet/Downloads/gps-generator/gps-generator-export
node inspectClusterVisits.js

echo "=== QUERY TRIP SEGMENTS ==="
node -e "
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect('mongodb://10.10.21.44:27017/gps_tracking_ai');
  const Trip = mongoose.model('Trip', {}, 'trip_segments');
  const trips = await Trip.find({ user_id: 'U123', date: '2026-05-05' }).lean();
  console.log('Total trips:', trips.length);
  trips.forEach(t => console.log(t.from_cluster_id + '->' + t.to_cluster_id));
  await mongoose.disconnect();
})();
" --input-type=module

echo "=== CLEAR TRIP SEGMENTS (RESET) ==="
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

# ============================================================================
# FULL PIPELINE (END-TO-END)
# ============================================================================
echo "=== FULL PIPELINE (all phases) ==="
# Phase 1: Generate data
node src/index.js
# Phase 2: Process GPS
node src/app.js
# Phase 3: Cluster
cd /home/sumeet/Downloads/gps-generator/ai-service && python3 jobs/run_clustering_optimized.py
# Phase 4: Trip Segments
cd /home/sumeet/Downloads/gps-generator/gps-generator-export && node testTripSegments.js --all 2026-05-05
echo "✓ All phases complete!"

# ============================================================================
# COMMON TASKS
# ============================================================================

# Generate trips for all dates in May 2026
for date in {01..31}; do
  echo "Processing 2026-05-$date"
  node testTripSegments.js --all "2026-05-$(printf '%02d' $date)"
done

# Count total trips
node -e "
import mongoose from 'mongoose';
(async () => {
  await mongoose.connect('mongodb://10.10.21.44:27017/gps_tracking_ai');
  const Trip = mongoose.model('Trip', {}, 'trip_segments');
  const count = await Trip.countDocuments();
  console.log('Total trip segments in DB:', count);
  await mongoose.disconnect();
})();
" --input-type=module

# ============================================================================
# NEXT PHASES (coming soon)
# ============================================================================
# Phase 5: Generate user movement patterns
# Phase 6: Create ML training samples
# Phase 7: Train ML models
# Phase 8: Deploy prediction API
