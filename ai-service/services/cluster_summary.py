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
        total_points = sum(int(c["count"]) for c in cells)

        center_lat = (
            sum(c["center"]["lat"] * int(c["count"]) for c in cells)
            / total_points
        )

        center_lng = (
            sum(c["center"]["lng"] * int(c["count"]) for c in cells)
            / total_points
        )

        center = {
            "lat": round(center_lat, 7),
            "lng": round(center_lng, 7)
        }

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

        updated += 1

    return updated