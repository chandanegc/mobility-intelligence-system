from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import joblib
import pandas as pd
import numpy as np
from datetime import datetime
import os
import sys

# Add root ai-service to path to import config
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../../ai-service')))
from config.db import user_clusters_col

app = FastAPI(title="GPS Movement Intelligence Prediction API")

# Load models and encoders
MODELS_DIR = os.path.join(os.path.dirname(__file__), 'models')
NEXT_PLACE_MODEL = joblib.load(os.path.join(MODELS_DIR, 'next_place_model.pkl'))
NEXT_PLACE_ENCODERS = joblib.load(os.path.join(MODELS_DIR, 'next_place_encoders.pkl'))

TRIP_DURATION_MODEL = joblib.load(os.path.join(MODELS_DIR, 'trip_duration_model.pkl'))
TRIP_DURATION_ENCODERS = joblib.load(os.path.join(MODELS_DIR, 'trip_duration_encoders.pkl'))

class PredictionRequest(BaseModel):
    user_id: str
    current_cluster_id: str
    previous_cluster_id: str = "START"
    current_stay_duration_sec: int = 0

def get_time_context():
    now = datetime.now()
    hour = now.hour
    day_of_week = now.strftime('%A')
    is_weekend = day_of_week in ['Saturday', 'Sunday']
    
    if 5 <= hour < 12:
        time_of_day = "morning"
    elif 12 <= hour < 17:
        time_of_day = "afternoon"
    elif 17 <= hour < 21:
        time_of_day = "evening"
    else:
        time_of_day = "night"
        
    return {
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,
        "time_of_day": time_of_day,
        "departure_hour": hour
    }

@app.post("/predict-next-place")
async def predict_next_place(req: PredictionRequest):
    # 1. Fetch current cluster info from MongoDB
    cluster = user_clusters_col.find_one({"user_id": req.user_id, "cluster_id": req.current_cluster_id})
    if not cluster:
        raise HTTPException(status_code=404, detail="Current cluster not found for user")

    # 2. Prepare features for Next Place Model
    time_ctx = get_time_context()
    
    features = {
        'from_cluster_id': req.current_cluster_id,
        'from_place_type': cluster.get('place_type', 'UNKNOWN'),
        'previous_cluster_id': req.previous_cluster_id,
        'day_of_week': time_ctx['day_of_week'],
        'is_weekend': time_ctx['is_weekend'],
        'time_of_day': time_ctx['time_of_day'],
        'departure_hour': time_ctx['departure_hour'],
        'current_stay_duration_sec': req.current_stay_duration_sec,
        'from_cluster_visit_count': cluster.get('visit_count', 0),
        'from_cluster_avg_duration_sec': cluster.get('avg_duration_sec', 0),
        'from_cluster_night_visit_ratio': cluster.get('night_visit_ratio', 0),
        'from_cluster_day_visit_ratio': cluster.get('day_visit_ratio', 0),
        'from_cluster_place_type_confidence': cluster.get('place_type_confidence', 0)
    }

    df_features = pd.DataFrame([features])
    
    # Encode features
    for col, le in NEXT_PLACE_ENCODERS.items():
        if col == 'target': continue
        if col in df_features.columns:
            # Handle unseen categories by using a fallback if necessary
            # For simplicity, we'll try to transform and catch errors
            try:
                df_features[col] = le.transform(df_features[col].astype(str))
            except ValueError:
                # If unseen, use the first class as fallback or handle as needed
                df_features[col] = 0 

    # 3. Predict Next Place (Top 3)
    probs = NEXT_PLACE_MODEL.predict_proba(df_features)[0]
    top_indices = np.argsort(probs)[-3:][::-1]
    
    target_le = NEXT_PLACE_ENCODERS['target']
    top_clusters = target_le.inverse_transform(top_indices)
    top_probs = probs[top_indices]

    predictions = []
    for i in range(len(top_clusters)):
        predicted_cluster_id = top_clusters[i]
        confidence = float(top_probs[i])
        
        if confidence < 0.01: continue
        
        # 4. Fetch Predicted Cluster Details
        pred_cluster = user_clusters_col.find_one({"user_id": req.user_id, "cluster_id": predicted_cluster_id})
        if not pred_cluster: continue

        # 5. Predict Trip Duration
        # Calculate distance (approximate or fetch from historical)
        # For now, we'll use a fixed distance or fetch from history if we had it
        # Real implementation would use Google Matrix API or historical avg
        
        # We'll use a simple fallback: historical avg speed * straight line distance
        # Or just use the model with an assumed distance for now
        assumed_distance = 5000 # 5km
        
        duration_features = {
            'user_id': req.user_id,
            'from_cluster_id': req.current_cluster_id,
            'to_cluster_id': predicted_cluster_id,
            'day_of_week': time_ctx['day_of_week'],
            'departure_hour': time_ctx['departure_hour'],
            'distance_meters': assumed_distance,
            'travel_mode': 'DRIVE'
        }
        
        df_duration = pd.DataFrame([duration_features])
        for col, le in TRIP_DURATION_ENCODERS.items():
            if col in df_duration.columns:
                try:
                    df_duration[col] = le.transform(df_duration[col].astype(str))
                except ValueError:
                    df_duration[col] = 0
        
        pred_duration_sec = TRIP_DURATION_MODEL.predict(df_duration)[0]

        predictions.append({
            "rank": i + 1,
            "next_cluster_id": predicted_cluster_id,
            "next_place_type": pred_cluster.get('place_type', 'UNKNOWN'),
            "lat": pred_cluster['center']['lat'],
            "lng": pred_cluster['center']['lng'],
            "confidence": confidence,
            "expected_trip_duration_min": round(pred_duration_sec / 60, 1),
            "source": "ml_model"
        })

    return {
        "user_id": req.user_id,
        "current": {
            "cluster_id": req.current_cluster_id,
            "place_type": cluster.get('place_type', 'UNKNOWN')
        },
        "predictions": predictions
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
