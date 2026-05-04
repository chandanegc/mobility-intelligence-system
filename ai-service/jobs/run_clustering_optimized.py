import os
import sys
import gc
import uuid
from datetime import datetime

import numpy as np

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(CURRENT_DIR)
sys.path.append(PROJECT_ROOT)

from config.db import (
    ensure_indexes,
    clustering_runs_col,
    cluster_cells_col,
    gps_processed_col,
    user_clusters_col,
    cluster_visits_col
)

from services.grid_cells import (
    build_grid_cells_for_user,
    finalize_cell_centers,
    load_compressed_cells,
    update_cells_with_cluster_ids,
    update_original_points_from_cells
)

from services.dbscan_service import run_weighted_dbscan
from services.visit_service import rebuild_cluster_visits
from services.cluster_summary import rebuild_user_clusters


# Better starting config after analysis:
# EPS 80 was merging large areas, radius 600m+ aa raha tha.
# 50m + min_samples 8 safer hai for home/office/gym/cafe places.
EPS_METERS = 50
MIN_SAMPLES = 8


def create_run(user_id):
    run_id = f"RUN_{user_id}_{uuid.uuid4().hex[:10]}"

    now_ms = int(datetime.now().timestamp() * 1000)

    clustering_runs_col.insert_one(
        {
            "run_id": run_id,
            "user_id": user_id,
            "status": "running",
            "started_at": now_ms,
            "completed_at": None,
            "eps_meters": EPS_METERS,
            "min_samples": MIN_SAMPLES
        }
    )

    return run_id


def complete_run(run_id, status="completed", error=None):
    now_ms = int(datetime.now().timestamp() * 1000)

    update = {
        "status": status,
        "completed_at": now_ms
    }

    if error:
        update["error"] = str(error)

    clustering_runs_col.update_one(
        {"run_id": run_id},
        {"$set": update}
    )


def get_users_for_clustering():
    return gps_processed_col.distinct(
        "user_id",
        {
            "is_stay_point": True,
            "is_anomaly": False
        }
    )


def reset_user_old_clustering_data(user_id):
    """
    Fresh clustering run se pehle old clustering output clean karta hai.

    Why:
    - Old user_clusters stale ho sakte hain
    - Old cluster_visits stale ho sakte hain
    - gps_processed me old cluster_id/grid_key/run_id reh sakta hai
    """

    print(f"Cleaning old clustering data for user={user_id}")

    user_clusters_col.delete_many({
        "user_id": user_id
    })

    cluster_visits_col.delete_many({
        "user_id": user_id
    })

    cluster_cells_col.delete_many({
        "user_id": user_id
    })

    gps_processed_col.update_many(
        {
            "user_id": user_id,
            "is_stay_point": True,
            "is_anomaly": False
        },
        {
            "$set": {
                "cluster_id": None,
                "grid_key": None,
                "clustering_run_id": None
            }
        }
    )


def cluster_user(user_id):
    run_id = create_run(user_id)

    print(f"\n========== USER {user_id} ==========")
    print(f"Run ID: {run_id}")

    try:
        # Clean old output before fresh run
        reset_user_old_clustering_data(user_id)

        # Safety: current run ke cells clean
        cluster_cells_col.delete_many(
            {
                "run_id": run_id,
                "user_id": user_id
            }
        )

        print("Step 1: Building grid cells...")
        raw_stay_points = build_grid_cells_for_user(user_id, run_id)
        print(f"Raw stay points scanned: {raw_stay_points}")

        if raw_stay_points < MIN_SAMPLES:
            print("Not enough stay points.")
            complete_run(run_id)
            return

        print("Step 2: Finalizing cell centers...")
        total_cells = finalize_cell_centers(user_id, run_id)
        print(f"Compressed cells: {total_cells}")

        if total_cells < MIN_SAMPLES:
            print("Not enough compressed cells.")
            complete_run(run_id)
            return

        print("Step 3: Loading compressed cells...")
        compressed_cells = load_compressed_cells(user_id, run_id)

        print("Step 4: Running weighted DBSCAN on compressed cells...")
        labels = run_weighted_dbscan(
            compressed_cells,
            eps_meters=EPS_METERS,
            min_samples=MIN_SAMPLES
        )

        cluster_count = len(set(labels)) - (1 if -1 in labels else 0)
        noise_count = int(np.sum(labels == -1))

        print(f"Clusters found: {cluster_count}")
        print(f"Noise cells: {noise_count}")

        print("Step 5: Updating cluster_cells.cluster_id...")
        update_cells_with_cluster_ids(compressed_cells, labels)

        print("Step 6: Updating original gps_processed.cluster_id...")
        update_original_points_from_cells(user_id, run_id)

        print("Step 7: Rebuilding cluster_visits...")
        visits_count = rebuild_cluster_visits(user_id, run_id)
        print(f"Visits created: {visits_count}")

        print("Step 8: Rebuilding user_clusters...")
        user_clusters_count = rebuild_user_clusters(user_id, run_id)
        print(f"User clusters updated: {user_clusters_count}")

        complete_run(run_id)

        del compressed_cells
        del labels
        gc.collect()

        print(f"Completed user={user_id}")

    except Exception as e:
        complete_run(run_id, status="failed", error=e)
        print(f"Failed user={user_id}: {e}")
        raise


def main():
    ensure_indexes()

    users = get_users_for_clustering()

    print("Users for clustering:", users)

    for user_id in users:
        cluster_user(user_id)

    print("\nAll clustering jobs completed.")


if __name__ == "__main__":
    main()