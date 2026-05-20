# GPS Movement Intelligence Pipeline: Project Overview

This document outlines the architecture, data flow, and current progress of the GPS Movement Intelligence system.

## 🏗 System Architecture

The project is split into two primary components:
1.  **Node.js Backend (`gps-generator-export/`)**: Handles data generation, high-volume GPS preprocessing, and ML feature engineering.
2.  **AI Service (`ai-service/`)**: A Python-based service focused on spatial clustering (DBSCAN), visit detection, and deep ML model training.

---

## 📈 System Enhancements (from Roadmap)

### Adaptive GPS Collection
To optimize battery and data quality, the system follows adaptive rules:
- **Stationary**: Send every 30s - 2m.
- **Walking**: Send every 5 - 10s.
- **Driving**: Send every 3 - 5s.
- **Trigger**: Send immediately on heading change > 30° or significant speed change.

### Activity Classification
Rules for classifying user movement based on speed:
- **Stationary**: < 0.5 m/s
- **Walking**: 0.5 - 2.0 m/s
- **Slow Vehicle**: 2.0 - 6.0 m/s
- **Driving**: > 6.0 m/s

---

## 🔄 End-to-End Data Flow

The pipeline follows a sequential flow from raw coordinates to predictive ML models:

### 1. Synthetic Data Generation
- **Source**: `POST /api/generate` or `data.js`
- **Output**: `gps_raw` collection.
- **Details**: Generates realistic GPS points including speed, heading, and noise for multiple users across several months.

### 2. GPS Preprocessing (Node.js)
- **Source**: `gps.processor.js`
- **Logic**: `gps_raw` → `gps_processed`.
- **Details**: 
    - Filters outliers and anomalies.
    - Detects **Stays** (where the user is stationary for > 5 min).
    - Classifies **Activities** (Walking vs. Driving).
    - Flags stay points for the clustering algorithm.

### 3. Spatial Clustering (Python)
- **Source**: `ai-service/jobs/run_clustering_optimized.py`
- **Logic**: `gps_processed` → `user_clusters` & `cluster_cells`.
- **Details**: Uses a weighted **DBSCAN** algorithm on stay points to identify meaningful locations (Home, Office, Gym, etc.). It uses a grid-cell optimization to handle millions of points efficiently.

### 4. Visit Detection (Python)
- **Source**: `ai-service/clustering/visit_detection.py`
- **Logic**: `gps_processed` + `user_clusters` → `cluster_visits`.
- **Details**: Converts raw stay points into discrete "visit" records with arrival/departure times, duration, and transition pointers (prev/next cluster).

### 5. Trip Segmentation (Node.js)
- **Source**: `tripSegments.service.js`
- **Logic**: `cluster_visits` → `trip_segments`.
- **Details**: Defines a "trip" as the movement between two consecutive visits. Calculates distance, average speed, and travel mode for each segment.

### 6. Behavioral Pattern Analysis (Node.js)
- **Source**: `userMovementPatterns.service.js`
- **Logic**: `trip_segments` → `user_movement_patterns`.
- **Details**: Calculates transition probabilities between clusters (e.g., "70% probability of going from Office to Gym on Mondays at 6 PM").

### 7. ML Feature Engineering (Node.js)
- **Source**: `mlTraining.service.js`
- **Logic**: `trip_segments` + `cluster_visits` → `ml_training_samples`.
- **Details**: Creates high-dimensional training vectors including:
    - Current stay duration and time context.
    - Previous cluster history.
    - Cluster-specific statistics (visit frequency, time-of-day ratios).

### 8. Model Training (Python)
- **Source**: `ai-service/ml_next_place_model.py`
- **Logic**: Training samples → Random Forest Model.
- **Details**: Trains baseline models for **Next Place Prediction**, **Trip Duration Estimation**, and **Place Type Classification**.

---

## 📍 Current Progress & Status

| Step | Status | Progress |
| :--- | :--- | :--- |
| **Data Generation** | ✅ Completed | 4.4M raw records generated (5 users, 30 days). |
| **GPS Processing** | 🟡 In Progress | Currently at User U005 (~4.2M / 4.4M processed). |
| **Clustering** | ⏳ Next | Ready to run Python optimization job. |
| **Trip Segments** | ⏳ Next | Ready to run for all users. |
| **ML Engineering** | ✅ Implemented | Services and API endpoints ready. |
| **Baseline Model** | 🛠 Drafted | Python training script created in `ai-service/`. |

---

## 🚀 Execution Commands

1. **Process GPS**: `node src/app.js` (Run Step 1)
2. **Run Clustering**: `python3 ai-service/jobs/run_clustering_optimized.py`
3. **Generate Trips**: `node testTripSegments.js --all 2026-05-01` (Repeat for dates)
4. **Build ML Features**: 
   - `curl -X POST http://localhost:3001/api/ml/movement-patterns`
   - `curl -X POST http://localhost:3001/api/ml/training-samples`
5. **Train Model**:
   - `curl "http://localhost:3001/api/ml/export?format=csv"`
   - `python3 ai-service/ml_next_place_model.py`
