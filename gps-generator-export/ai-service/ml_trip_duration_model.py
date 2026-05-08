import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mean_absolute_error, r2_score
import joblib
import os

def train_model():
    csv_path = 'exports/trip_duration_samples.csv'
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found. Please export data first.")
        return

    # Load data
    df = pd.read_csv(csv_path)
    
    if len(df) < 10:
        print(f"Error: Not enough samples ({len(df)}). Need more data.")
        return

    print(f"Loaded {len(df)} samples.")

    # Features and Label
    feature_cols = [
        'user_id', 'from_cluster_id', 'to_cluster_id',
        'day_of_week', 'departure_hour', 'distance_meters', 'travel_mode'
    ]
    target_col = 'duration_sec'

    # Preprocessing
    encoders = {}
    X = df[feature_cols].copy()
    y = df[target_col].copy()

    for col in X.columns:
        if X[col].dtype == 'object':
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            encoders[col] = le

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train model
    print("Training Random Forest Regressor model...")
    model = RandomForestRegressor(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    print(f"\nMean Absolute Error: {mae:.2f} seconds ({mae/60:.2f} minutes)")
    print(f"R2 Score: {r2:.4f}")
    
    # Save model and encoders
    if not os.path.exists('models'):
        os.mkdir('models')
    
    joblib.dump(model, 'models/trip_duration_model.pkl')
    joblib.dump(encoders, 'models/trip_duration_encoders.pkl')
    print("\nModel and encoders saved to 'models/' directory.")

if __name__ == "__main__":
    train_model()
