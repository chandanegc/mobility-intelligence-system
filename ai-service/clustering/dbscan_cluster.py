import numpy as np
from sklearn.cluster import DBSCAN


EARTH_RADIUS_KM = 6371.0088


def run_dbscan(df, eps_meters=80, min_samples=5):
    """
    Input:
        df columns: lat, lng

    Output:
        labels array
        0,1,2... = cluster labels
        -1 = noise
    """

    if df.empty:
        return []

    coords = df[["lat", "lng"]].to_numpy()

    # DBSCAN haversine metric expects radians
    coords_rad = np.radians(coords)

    eps_km = eps_meters / 1000
    eps_rad = eps_km / EARTH_RADIUS_KM

    model = DBSCAN(
        eps=eps_rad,
        min_samples=min_samples,
        metric="haversine",
        algorithm="ball_tree"
    )

    labels = model.fit_predict(coords_rad)

    return labels