from datetime import datetime

from config.db import gps_processed_col, cluster_visits_col


MONGO_BATCH_SIZE = 5000
MIN_VISIT_DURATION_SEC = 5 * 60
MERGE_GAP_SEC = 5 * 60
SAME_CLUSTER_SPLIT_GAP_SEC = 30 * 60


def get_time_meta(timestamp_sec):
    dt = datetime.fromtimestamp(int(timestamp_sec))

    hour = dt.hour

    if 6 <= hour < 12:
        time_of_day = "morning"
    elif 12 <= hour < 17:
        time_of_day = "afternoon"
    elif 17 <= hour < 21:
        time_of_day = "evening"
    else:
        time_of_day = "night"

    return {
        "hour": hour,
        "day_of_week": dt.strftime("%A"),
        "is_weekend": dt.weekday() >= 5,
        "time_of_day": time_of_day,
        "date": dt.strftime("%Y-%m-%d")
    }


def create_visit(user_id, cluster_id, point, prev_cluster_id=None):
    meta = get_time_meta(point["gps_TimeStamp"])

    return {
        "user_id": user_id,
        "cluster_id": cluster_id,

        "visit_start": int(point["gps_TimeStamp"]),
        "visit_end": None,
        "duration_sec": None,

        "arrival_hour": meta["hour"],
        "departure_hour": None,

        "day_of_week": meta["day_of_week"],
        "is_weekend": meta["is_weekend"],
        "time_of_day": meta["time_of_day"],

        "prev_cluster_id": prev_cluster_id,
        "next_cluster_id": None,

        "point_count": 1,
        "is_merged": False,
        "date": meta["date"],

        "created_at": int(datetime.now().timestamp() * 1000)
    }


def close_visit(visit, end_point, next_cluster_id=None):
    meta = get_time_meta(end_point["gps_TimeStamp"])

    visit["visit_end"] = int(end_point["gps_TimeStamp"])
    visit["duration_sec"] = visit["visit_end"] - visit["visit_start"]
    visit["departure_hour"] = meta["hour"]
    visit["next_cluster_id"] = next_cluster_id

    return visit


def should_keep_visit(visit):
    return (
        visit.get("duration_sec") is not None
        and visit["duration_sec"] >= MIN_VISIT_DURATION_SEC
    )


def merge_close_visits(visits):
    if not visits:
        return []

    merged = [visits[0]]

    for curr in visits[1:]:
        prev = merged[-1]
        gap = curr["visit_start"] - prev["visit_end"]

        if (
            prev["cluster_id"] == curr["cluster_id"]
            and 0 <= gap <= MERGE_GAP_SEC
        ):
            prev["visit_end"] = curr["visit_end"]
            prev["duration_sec"] = prev["visit_end"] - prev["visit_start"]
            prev["departure_hour"] = curr["departure_hour"]
            prev["point_count"] += curr["point_count"]
            prev["is_merged"] = True
            prev["next_cluster_id"] = curr["next_cluster_id"]
        else:
            merged.append(curr)

    return merged


def rebuild_cluster_visits(user_id, run_id):
    """
    Streaming visit detection.
    Saare clustered points memory me load nahi karta.
    """

    cluster_visits_col.delete_many({"user_id": user_id})

    query = {
        "user_id": user_id,
        "clustering_run_id": run_id,
        "is_stay_point": True,
        "is_anomaly": False,
        "cluster_id": {
            "$nin": [None, "-1"]
        }
    }

    projection = {
        "_id": 1,
        "user_id": 1,
        "cluster_id": 1,
        "gps_TimeStamp": 1
    }

    cursor = gps_processed_col.find(
        query,
        projection,
        no_cursor_timeout=True
    ).sort("gps_TimeStamp", 1).batch_size(MONGO_BATCH_SIZE)

    visits = []

    current_visit = None
    prev_point = None
    prev_cluster_id = None

    try:
        for point in cursor:
            cluster_id = point["cluster_id"]

            if current_visit is None:
                current_visit = create_visit(
                    user_id=user_id,
                    cluster_id=cluster_id,
                    point=point,
                    prev_cluster_id=prev_cluster_id
                )
                prev_point = point
                continue

            time_gap = int(point["gps_TimeStamp"]) - int(prev_point["gps_TimeStamp"])

            if (
                cluster_id == current_visit["cluster_id"]
                and time_gap <= SAME_CLUSTER_SPLIT_GAP_SEC
            ):
                current_visit["point_count"] += 1
                prev_point = point
                continue

            close_visit(
                current_visit,
                prev_point,
                next_cluster_id=cluster_id
            )

            if should_keep_visit(current_visit):
                visits.append(current_visit)

            prev_cluster_id = current_visit["cluster_id"]

            current_visit = create_visit(
                user_id=user_id,
                cluster_id=cluster_id,
                point=point,
                prev_cluster_id=prev_cluster_id
            )

            prev_point = point

        if current_visit is not None and prev_point is not None:
            close_visit(
                current_visit,
                prev_point,
                next_cluster_id=None
            )

            if should_keep_visit(current_visit):
                visits.append(current_visit)

    finally:
        cursor.close()

    visits = merge_close_visits(visits)

    if visits:
        cluster_visits_col.insert_many(visits, ordered=False)

    return len(visits)  