from pymongo import MongoClient, ASCENDING, GEOSPHERE

MONGO_URL = "mongodb://10.10.21.44:27017/"
DB_NAME = "gps_tracking_ai"

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

gps_processed_col = db["gps_processed"]
user_clusters_col = db["user_clusters"]
cluster_visits_col = db["cluster_visits"]

cluster_cells_col = db["cluster_cells"]
clustering_runs_col = db["clustering_runs"]


def ensure_indexes():
    gps_processed_col.create_index(
        [
            ("user_id", ASCENDING),
            ("is_stay_point", ASCENDING),
            ("is_anomaly", ASCENDING),
            ("gps_TimeStamp", ASCENDING),
        ],
        name="idx_processed_stay_user_time"
    )

    gps_processed_col.create_index(
        [
            ("user_id", ASCENDING),
            ("clustering_run_id", ASCENDING),
            ("grid_key", ASCENDING),
        ],
        name="idx_processed_run_grid"
    )

    gps_processed_col.create_index(
        [
            ("user_id", ASCENDING),
            ("cluster_id", ASCENDING),
            ("gps_TimeStamp", ASCENDING),
        ],
        name="idx_processed_cluster_time"
    )

    user_clusters_col.create_index(
        [
            ("user_id", ASCENDING),
            ("cluster_id", ASCENDING),
        ],
        unique=True,
        name="idx_user_cluster_unique"
    )

    user_clusters_col.create_index(
        [("center_location", GEOSPHERE)],
        name="idx_user_cluster_center_geo"
    )

    cluster_visits_col.create_index(
        [
            ("user_id", ASCENDING),
            ("cluster_id", ASCENDING),
            ("visit_start", ASCENDING),
        ],
        name="idx_visit_user_cluster_start"
    )

    cluster_cells_col.create_index(
        [
            ("run_id", ASCENDING),
            ("user_id", ASCENDING),
            ("grid_key", ASCENDING),
        ],
        unique=True,
        name="idx_cluster_cells_unique"
    )

    clustering_runs_col.create_index(
        [("run_id", ASCENDING)],
        unique=True,
        name="idx_clustering_run_unique"
    )