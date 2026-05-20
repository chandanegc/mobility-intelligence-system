import os
from collections import defaultdict

from config.db import clustering_runs_col
from services.cluster_summary import rebuild_user_clusters


def latest_run_id_for_user(user_id: str) -> str | None:
    doc = clustering_runs_col.find_one(
        {"user_id": user_id, "status": {"$in": ["completed", "running"]}},
        sort=[("started_at", -1)],
        projection={"_id": 0, "run_id": 1},
    )
    return doc["run_id"] if doc else None


def main():
    user_id = os.environ.get("USER_ID", "U123")
    run_id = os.environ.get("RUN_ID") or latest_run_id_for_user(user_id)

    if not run_id:
        raise RuntimeError(f"No clustering run found for user={user_id}")

    updated = rebuild_user_clusters(user_id, run_id)
    print(f"Updated clusters: {updated} for user={user_id} run_id={run_id}")


if __name__ == "__main__":
    main()

