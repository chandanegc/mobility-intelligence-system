from collections import defaultdict
from datetime import datetime

from config.db import cluster_cells_col, cluster_visits_col, user_clusters_col
from utils.geo import haversine_meters
from services.place_classifier import classify_place


def calculate_radius(center, points):
    max_radius = 0

    for point in points:
        distance = haversine_meters(
            center["lat"],
            center["lng"],
            point["lat"],
            point["lng"]
        )

        max_radius = max(max_radius, distance)

    return round(max_radius, 2)

def _weighted_center_from_cells(cells):
    """
    Robust-ish weighted center.

    Problem:
    A simple weighted mean over all cells can drift if a cluster accidentally
    includes a few far-but-non-noise cells (e.g. due to sparse sampling).

    Strategy:
    - Anchor on the densest cell (max count)
    - Keep only cells within a tight radius of the anchor (default 120m)
    - If that filtered set covers enough points, compute weighted mean on it,
      else fall back to weighted mean on all cells.
    """
    if not cells:
        return {"lat": None, "lng": None}, 0, "empty"

    # ensure numeric counts
    for c in cells:
        c["__count"] = int(c.get("count") or 0)

    total_points = sum(c["__count"] for c in cells)
    if total_points <= 0:
        return {"lat": None, "lng": None}, 0, "no_points"

    anchor = max(cells, key=lambda c: c["__count"])
    anchor_center = anchor.get("center") or {}
    a_lat = anchor_center.get("lat")
    a_lng = anchor_center.get("lng")

    # If anchor is missing for some reason, fall back to mean over all cells
    if a_lat is None or a_lng is None:
        center_lat = sum(c["center"]["lat"] * c["__count"] for c in cells) / total_points
        center_lng = sum(c["center"]["lng"] * c["__count"] for c in cells) / total_points
        return {"lat": round(center_lat, 7), "lng": round(center_lng, 7)}, total_points, "weighted_mean_all"

    # Tight radius: align with trip service "same place" tolerance-ish.
    # This is intentionally > EPS (50m) to allow realistic GPS drift, but << 200m.
    KEEP_WITHIN_METERS = 120

    kept = []
    kept_points = 0
    for c in cells:
        cc = c.get("center") or {}
        lat = cc.get("lat")
        lng = cc.get("lng")
        if lat is None or lng is None or c["__count"] <= 0:
            continue
        if haversine_meters(a_lat, a_lng, lat, lng) <= KEEP_WITHIN_METERS:
            kept.append(c)
            kept_points += c["__count"]

    # If the dense core represents a meaningful portion of the cluster, use it.
    # Otherwise, fall back to the full weighted mean.
    if kept and kept_points >= max(int(0.5 * total_points), 1):
        center_lat = sum(c["center"]["lat"] * c["__count"] for c in kept) / kept_points
        center_lng = sum(c["center"]["lng"] * c["__count"] for c in kept) / kept_points
        return {"lat": round(center_lat, 7), "lng": round(center_lng, 7)}, total_points, "weighted_mean_core_120m"

    center_lat = sum(c["center"]["lat"] * c["__count"] for c in cells) / total_points
    center_lng = sum(c["center"]["lng"] * c["__count"] for c in cells) / total_points
    return {"lat": round(center_lat, 7), "lng": round(center_lng, 7)}, total_points, "weighted_mean_all"


def rebuild_user_clusters(user_id, run_id):
    """
    user_clusters summary banata hai.
    Input:
      - cluster_cells
      - cluster_visits
    """

    now_ms = int(datetime.now().timestamp() * 1000)

    cursor = cluster_cells_col.find(
        {
            "user_id": user_id,
            "run_id": run_id,
            "cluster_id": {
                "$nin": [None, "-1"]
            },
            "center": {"$exists": True}
        },
        {
            "cluster_id": 1,
            "center": 1,
            "count": 1,
            "first_seen": 1,
            "last_seen": 1
        }
    )

    grouped = defaultdict(list)

    for cell in cursor:
        grouped[cell["cluster_id"]].append(cell)

    updated = 0

    for cluster_id, cells in grouped.items():
        center, total_points, center_method = _weighted_center_from_cells(cells)
        if center["lat"] is None or center["lng"] is None:
            # nothing useful to write
            continue

        visits = list(
            cluster_visits_col.find(
                {
                    "user_id": user_id,
                    "cluster_id": cluster_id
                },
                {
                    "_id": 0,
                    "duration_sec": 1,
                    "arrival_hour": 1,
                    "departure_hour": 1,
                    "is_weekend": 1
                }
            )
        )

        visit_count = len(visits)

        durations = [
            v["duration_sec"]
            for v in visits
            if isinstance(v.get("duration_sec"), (int, float))
        ]

        total_duration = sum(durations)
        avg_duration = total_duration / len(durations) if durations else 0

        if visit_count:
            night_count = sum(
                1
                for v in visits
                if v.get("arrival_hour", 0) >= 22
                or v.get("arrival_hour", 0) < 6
            )

            day_count = sum(
                1
                for v in visits
                if 9 <= v.get("arrival_hour", 0) <= 18
            )

            weekday_count = sum(
                1
                for v in visits
                if not v.get("is_weekend", False)
            )

            arrival_hours = [
                v["arrival_hour"]
                for v in visits
                if v.get("arrival_hour") is not None
            ]

            departure_hours = [
                v["departure_hour"]
                for v in visits
                if v.get("departure_hour") is not None
            ]

            night_ratio = night_count / visit_count
            day_ratio = day_count / visit_count
            weekday_ratio = weekday_count / visit_count

            avg_arrival = (
                sum(arrival_hours) / len(arrival_hours)
                if arrival_hours else 0
            )

            avg_departure = (
                sum(departure_hours) / len(departure_hours)
                if departure_hours else 0
            )
        else:
            night_ratio = 0
            day_ratio = 0
            weekday_ratio = 0
            avg_arrival = 0
            avg_departure = 0

        points_for_radius = [
            {
                "lat": c["center"]["lat"],
                "lng": c["center"]["lng"]
            }
            for c in cells
        ]

        stats = {
            "user_id": user_id,
            "cluster_id": cluster_id,

            "center": center,
            "center_location": {
                "type": "Point",
                "coordinates": [center["lng"], center["lat"]]
            },
            "center_method": center_method,

            "total_points": int(total_points),

            "visit_count": int(visit_count),
            "avg_duration_sec": round(avg_duration, 2),
            "total_duration_sec": int(total_duration),

            "first_seen": min(c["first_seen"] for c in cells),
            "last_seen": max(c["last_seen"] for c in cells),

            "night_visit_ratio": round(night_ratio, 3),
            "day_visit_ratio": round(day_ratio, 3),
            "weekday_ratio": round(weekday_ratio, 3),

            "avg_arrival_hour": round(avg_arrival, 2),
            "avg_departure_hour": round(avg_departure, 2),

            "radius_meters": calculate_radius(center, points_for_radius),

            "updated_at": now_ms,
            "clustering_version": run_id
        }

        place = classify_place(stats)

        user_clusters_col.update_one(
            {
                "user_id": user_id,
                "cluster_id": cluster_id
            },
            {
                "$set": {
                    **stats,
                    **place
                },
                "$setOnInsert": {
                    "created_at": now_ms,
                    "place_name": None,
                    "place_api_types": []
                }
            },
            upsert=True
        )

        cluster_visits_col.update_many(
            {
                "user_id": user_id,
                "cluster_id": cluster_id
            },
            {
                "$set": {
                    "center": center,
                    "center_location": {
                        "type": "Point",
                        "coordinates": [center["lng"], center["lat"]]
                    }
                }
            }
        )

        updated += 1

    return updated
