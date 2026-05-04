from pymongo import UpdateOne, UpdateMany

from config.db import gps_processed_col, cluster_cells_col
from utils.geo import make_grid_key


GRID_PRECISION = 4
MONGO_BATCH_SIZE = 5000
BULK_WRITE_SIZE = 2000


def build_grid_cells_for_user(user_id, run_id):
    """
    gps_processed ko stream karta hai.
    Saare points memory me load nahi karta.

    Har point ko grid_key deta hai.
    cluster_cells collection me compressed cells banata hai.
    """

    query = {
        "user_id": user_id,
        "is_stay_point": True,
        "is_anomaly": False,
        "lat": {"$type": "number"},
        "lng": {"$type": "number"}
    }

    projection = {
        "_id": 1,
        "lat": 1,
        "lng": 1,
        "gps_TimeStamp": 1
    }

    cursor = gps_processed_col.find(
        query,
        projection,
        no_cursor_timeout=True
    ).sort("gps_TimeStamp", 1).batch_size(MONGO_BATCH_SIZE)

    cell_ops = []
    point_ops = []

    total_points = 0

    try:
        for doc in cursor:
            lat = float(doc["lat"])
            lng = float(doc["lng"])
            timestamp = int(doc["gps_TimeStamp"])

            grid_key = make_grid_key(lat, lng, GRID_PRECISION)

            cell_ops.append(
                UpdateOne(
                    {
                        "run_id": run_id,
                        "user_id": user_id,
                        "grid_key": grid_key
                    },
                    {
                        "$inc": {
                            "lat_sum": lat,
                            "lng_sum": lng,
                            "count": 1
                        },
                        "$min": {
                            "first_seen": timestamp
                        },
                        "$max": {
                            "last_seen": timestamp
                        },
                        "$setOnInsert": {
                            "run_id": run_id,
                            "user_id": user_id,
                            "grid_key": grid_key,
                            "cluster_id": None
                        }
                    },
                    upsert=True
                )
            )

            point_ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "grid_key": grid_key,
                            "clustering_run_id": run_id
                        }
                    }
                )
            )

            total_points += 1

            if len(cell_ops) >= BULK_WRITE_SIZE:
                cluster_cells_col.bulk_write(cell_ops, ordered=False)
                cell_ops.clear()

            if len(point_ops) >= BULK_WRITE_SIZE:
                gps_processed_col.bulk_write(point_ops, ordered=False)
                point_ops.clear()

    finally:
        cursor.close()

    if cell_ops:
        cluster_cells_col.bulk_write(cell_ops, ordered=False)

    if point_ops:
        gps_processed_col.bulk_write(point_ops, ordered=False)

    return total_points


def finalize_cell_centers(user_id, run_id):
    """
    cluster_cells me center calculate karta hai.
    """

    cursor = cluster_cells_col.find(
        {
            "run_id": run_id,
            "user_id": user_id
        },
        no_cursor_timeout=True
    ).batch_size(MONGO_BATCH_SIZE)

    ops = []
    total_cells = 0

    try:
        for cell in cursor:
            count = int(cell["count"])

            if count <= 0:
                continue

            center_lat = float(cell["lat_sum"]) / count
            center_lng = float(cell["lng_sum"]) / count

            ops.append(
                UpdateOne(
                    {"_id": cell["_id"]},
                    {
                        "$set": {
                            "center": {
                                "lat": round(center_lat, 7),
                                "lng": round(center_lng, 7)
                            }
                        }
                    }
                )
            )

            total_cells += 1

            if len(ops) >= BULK_WRITE_SIZE:
                cluster_cells_col.bulk_write(ops, ordered=False)
                ops.clear()

    finally:
        cursor.close()

    if ops:
        cluster_cells_col.bulk_write(ops, ordered=False)

    return total_cells


def load_compressed_cells(user_id, run_id):
    """
    DBSCAN ke liye compressed cells load karega.
    Ye 10 lakh points nahi, compressed cells hain.
    """

    cursor = cluster_cells_col.find(
        {
            "run_id": run_id,
            "user_id": user_id,
            "center": {"$exists": True}
        },
        {
            "_id": 1,
            "grid_key": 1,
            "center": 1,
            "count": 1,
            "first_seen": 1,
            "last_seen": 1
        }
    )

    return list(cursor)


def update_cells_with_cluster_ids(compressed_cells, labels):
    """
    DBSCAN labels ko cluster_cells collection me update karta hai.
    """

    ops = []

    for cell, label in zip(compressed_cells, labels):
        cluster_id = "-1" if label == -1 else f"C{int(label)}"

        ops.append(
            UpdateOne(
                {"_id": cell["_id"]},
                {
                    "$set": {
                        "cluster_id": cluster_id
                    }
                }
            )
        )

        if len(ops) >= BULK_WRITE_SIZE:
            cluster_cells_col.bulk_write(ops, ordered=False)
            ops.clear()

    if ops:
        cluster_cells_col.bulk_write(ops, ordered=False)


def update_original_points_from_cells(user_id, run_id):
    """
    Original gps_processed points ko cluster_id assign karta hai.

    IMPORTANT:
    Same grid_key ke multiple gps_processed points hote hain.
    Isliye UpdateOne nahi, UpdateMany use karna zaroori hai.

    Example:
    grid_key = "28.6554_77.1788"
    cluster_id = "C11"

    To is grid_key ke saare points ko C11 milna chahiye.
    """

    cursor = cluster_cells_col.find(
        {
            "run_id": run_id,
            "user_id": user_id
        },
        {
            "grid_key": 1,
            "cluster_id": 1
        },
        no_cursor_timeout=True
    ).batch_size(MONGO_BATCH_SIZE)

    ops = []
    total_cells = 0

    try:
        for cell in cursor:
            grid_key = cell.get("grid_key")
            cluster_id = cell.get("cluster_id")

            if not grid_key:
                continue

            ops.append(
                UpdateMany(
                    {
                        "user_id": user_id,
                        "clustering_run_id": run_id,
                        "grid_key": grid_key
                    },
                    {
                        "$set": {
                            "cluster_id": cluster_id
                        }
                    }
                )
            )

            total_cells += 1

            if len(ops) >= BULK_WRITE_SIZE:
                gps_processed_col.bulk_write(ops, ordered=False)
                ops.clear()

    finally:
        cursor.close()

    if ops:
        gps_processed_col.bulk_write(ops, ordered=False)

    print(f"Original gps_processed cluster_id updated from cells: {total_cells}")