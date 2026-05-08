import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score, classification_report
import joblib
import os

def train_model():
    csv_path = 'exports/next_place_samples.csv'
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
        'from_cluster_id', 'from_place_type', 'previous_cluster_id',
        'day_of_week', 'is_weekend', 'time_of_day', 'departure_hour',
        'current_stay_duration_sec', 'from_cluster_visit_count',
        'from_cluster_avg_duration_sec', 'from_cluster_night_visit_ratio',
        'from_cluster_day_visit_ratio', 'from_cluster_place_type_confidence'
    ]
    target_col = 'to_cluster_id'

    # Preprocessing
    encoders = {}
    X = df[feature_cols].copy()
    y = df[target_col].copy()

    # Handle missing values
    X['previous_cluster_id'] = X['previous_cluster_id'].fillna('START')
    
    for col in X.columns:
        if X[col].dtype == 'object':
            le = LabelEncoder()
            X[col] = le.fit_transform(X[col].astype(str))
            encoders[col] = le

    target_le = LabelEncoder()
    y = target_le.fit_transform(y.astype(str))
    encoders['target'] = target_le

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # Train model
    print("Training Random Forest model...")
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"\nModel Accuracy: {acc:.4f}")
    
    # Save model and encoders
    if not os.path.exists('models'):
        os.mkdir('models')
    
    joblib.dump(model, 'models/next_place_model.pkl')
    joblib.dump(encoders, 'models/next_place_encoders.pkl')
    print("\nModel and encoders saved to 'models/' directory.")

if __name__ == "__main__":
    train_model()
