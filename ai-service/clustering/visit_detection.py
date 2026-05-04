import pandas as pd
from datetime import datetime


MIN_VISIT_DURATION_SEC = 5 * 60
MERGE_GAP_SEC = 5 * 60


def get_time_meta(timestamp_sec):
    dt = datetime.fromtimestamp(int(timestamp_sec))

    hour = dt.hour
    day_of_week = dt.strftime("%A")
    is_weekend = dt.weekday() >= 5
    date = dt.strftime("%Y-%m-%d")

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
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,
        "time_of_day": time_of_day,
        "date": date
    }


def close_visit(visit, end_row, next_cluster_id=None):
    end_time = int(end_row["gps_TimeStamp"])
    meta = get_time_meta(end_time)

    visit["visit_end"] = end_time
    visit["duration_sec"] = visit["visit_end"] - visit["visit_start"]
    visit["departure_hour"] = meta["hour"]
    visit["next_cluster_id"] = next_cluster_id

    return visit


def create_visit(user_id, cluster_id, start_row, prev_cluster_id=None):
    start_time = int(start_row["gps_TimeStamp"])
    meta = get_time_meta(start_time)

    return {
        "user_id": user_id,
        "cluster_id": cluster_id,

        "visit_start": start_time,
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


def merge_close_visits(visits):
    """
    Same cluster ke visits agar small gap me split ho gaye,
    to unhe merge kar deta hai.
    """

    if not visits:
        return []

    merged = [visits[0]]

    for curr in visits[1:]:
        prev = merged[-1]

        gap = curr["visit_start"] - prev["visit_end"]

        if (
            prev["cluster_id"] == curr["cluster_id"]
            and gap >= 0
            and gap <= MERGE_GAP_SEC
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


def detect_cluster_visits(df):
    """
    Input:
        df with cluster_id assigned

    Output:
        list of visit documents
    """

    if df.empty:
        return []

    df = df.sort_values("gps_TimeStamp").reset_index(drop=True)

    visits = []

    current_visit = None
    prev_row = None
    prev_cluster_id = None

    for _, row in df.iterrows():
        cluster_id = row.get("cluster_id")

        if cluster_id is None or cluster_id == "-1":
            continue

        user_id = row["user_id"]

        if current_visit is None:
            current_visit = create_visit(
                user_id=user_id,
                cluster_id=cluster_id,
                start_row=row,
                prev_cluster_id=prev_cluster_id
            )
            prev_row = row
            continue

        if cluster_id == current_visit["cluster_id"]:
            current_visit["point_count"] += 1
            prev_row = row
            continue

        current_visit = close_visit(
            current_visit,
            prev_row,
            next_cluster_id=cluster_id
        )

        if (
            current_visit["duration_sec"] is not None
            and current_visit["duration_sec"] >= MIN_VISIT_DURATION_SEC
        ):
            visits.append(current_visit)

        prev_cluster_id = current_visit["cluster_id"]

        current_visit = create_visit(
            user_id=user_id,
            cluster_id=cluster_id,
            start_row=row,
            prev_cluster_id=prev_cluster_id
        )

        prev_row = row

    if current_visit is not None and prev_row is not None:
        current_visit = close_visit(
            current_visit,
            prev_row,
            next_cluster_id=None
        )

        if (
            current_visit["duration_sec"] is not None
            and current_visit["duration_sec"] >= MIN_VISIT_DURATION_SEC
        ):
            visits.append(current_visit)

    return merge_close_visits(visits)