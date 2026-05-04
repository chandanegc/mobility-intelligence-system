import numpy as np
from sklearn.cluster import DBSCAN

from utils.geo import EARTH_RADIUS_KM


def run_weighted_dbscan(compressed_cells, eps_meters=80, min_samples=5):
    """
    DBSCAN compressed grid cells par chalega, original 10 lakh points par nahi.

    compressed_cells:
    [
      {
        "center": {"lat": ..., "lng": ...},
        "count": 100
      }
    ]
    """

    if not compressed_cells:
        return np.array([])

    coords = np.array(
        [
            [
                cell["center"]["lat"],
                cell["center"]["lng"]
            ]
            for cell in compressed_cells
        ],
        dtype=np.float64
    )

    coords_rad = np.radians(coords)

    weights = np.array(
        [cell["count"] for cell in compressed_cells],
        dtype=np.float64
    )

    eps_km = eps_meters / 1000
    eps_rad = eps_km / EARTH_RADIUS_KM

    model = DBSCAN(
        eps=eps_rad,
        min_samples=min_samples,
        metric="haversine",
        algorithm="ball_tree",
        n_jobs=-1
    )

    labels = model.fit_predict(coords_rad, sample_weight=weights)

    return labels