import math
import numpy as np


def haversine_meters(lat1, lng1, lat2, lng2):
    radius = 6371000

    lat1 = math.radians(lat1)
    lng1 = math.radians(lng1)
    lat2 = math.radians(lat2)
    lng2 = math.radians(lng2)

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return radius * c


def calculate_radius(points_df, center_lat, center_lng):
    max_radius = 0

    for _, row in points_df.iterrows():
        distance = haversine_meters(
            center_lat,
            center_lng,
            row["lat"],
            row["lng"]
        )

        max_radius = max(max_radius, distance)

    return round(max_radius, 2)


def calculate_cluster_features(cluster_id, points_df, visits):
    """
    One cluster ke liye final user_clusters document ka stats calculate karega.
    """

    center_lat = float(points_df["lat"].mean())
    center_lng = float(points_df["lng"].mean())

    total_points = int(len(points_df))

    first_seen = int(points_df["gps_TimeStamp"].min())
    last_seen = int(points_df["gps_TimeStamp"].max())

    cluster_visits = [
        v for v in visits if v["cluster_id"] == cluster_id
    ]

    visit_count = len(cluster_visits)

    durations = [
        v["duration_sec"]
        for v in cluster_visits
        if v.get("duration_sec") is not None
    ]

    total_duration_sec = int(sum(durations)) if durations else 0
    avg_duration_sec = float(np.mean(durations)) if durations else 0

    if visit_count > 0:
        night_visits = [
            v for v in cluster_visits
            if v["arrival_hour"] >= 22 or v["arrival_hour"] < 6
        ]

        day_visits = [
            v for v in cluster_visits
            if 9 <= v["arrival_hour"] <= 18
        ]

        weekday_visits = [
            v for v in cluster_visits
            if not v["is_weekend"]
        ]

        night_visit_ratio = len(night_visits) / visit_count
        day_visit_ratio = len(day_visits) / visit_count
        weekday_ratio = len(weekday_visits) / visit_count

        avg_arrival_hour = float(
            np.mean([v["arrival_hour"] for v in cluster_visits])
        )

        departure_hours = [
            v["departure_hour"]
            for v in cluster_visits
            if v.get("departure_hour") is not None
        ]

        avg_departure_hour = (
            float(np.mean(departure_hours)) if departure_hours else 0
        )

    else:
        night_visit_ratio = 0
        day_visit_ratio = 0
        weekday_ratio = 0
        avg_arrival_hour = 0
        avg_departure_hour = 0

    radius_meters = calculate_radius(
        points_df,
        center_lat,
        center_lng
    )

    return {
        "cluster_id": cluster_id,

        "center": {
            "lat": round(center_lat, 7),
            "lng": round(center_lng, 7)
        },

        "center_location": {
            "type": "Point",
            "coordinates": [
                round(center_lng, 7),
                round(center_lat, 7)
            ]
        },

        "total_points": total_points,

        "visit_count": visit_count,
        "avg_duration_sec": round(avg_duration_sec, 2),
        "total_duration_sec": total_duration_sec,

        "first_seen": first_seen,
        "last_seen": last_seen,

        "night_visit_ratio": round(night_visit_ratio, 3),
        "day_visit_ratio": round(day_visit_ratio, 3),
        "weekday_ratio": round(weekday_ratio, 3),

        "avg_arrival_hour": round(avg_arrival_hour, 2),
        "avg_departure_hour": round(avg_departure_hour, 2),

        "radius_meters": radius_meters
    }