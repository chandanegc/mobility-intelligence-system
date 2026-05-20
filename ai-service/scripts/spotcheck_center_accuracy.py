import os
from config.db import user_clusters_col, cluster_cells_col
from utils.geo import haversine_meters


def main():
    user_id = os.environ.get("USER_ID", "U123")
    run_id = os.environ.get("RUN_ID")
    cluster_id = os.environ.get("CLUSTER_ID")  # optional

    q = {"user_id": user_id}
    if cluster_id:
        q["cluster_id"] = cluster_id

    clusters = list(user_clusters_col.find(q, {"_id": 0, "cluster_id": 1, "center": 1, "clustering_version": 1, "center_method": 1}))
    if not clusters:
        print("No clusters found for query", q)
        return

    for c in clusters[:20]:
        cid = c["cluster_id"]
        center = c.get("center") or {}
        if center.get("lat") is None or center.get("lng") is None:
            continue

        rid = run_id or c.get("clustering_version")
        if not rid:
            print(f"{cid}: missing run id")
            continue

        # densest cell for this cluster
        cell = cluster_cells_col.find_one(
            {"user_id": user_id, "run_id": rid, "cluster_id": cid, "center": {"$exists": True}},
            sort=[("count", -1)],
            projection={"_id": 0, "center": 1, "count": 1},
        )
        if not cell:
            print(f"{cid}: no cells")
            continue

        d = haversine_meters(center["lat"], center["lng"], cell["center"]["lat"], cell["center"]["lng"])
        print(
            f"{cid}: center_method={c.get('center_method')}  "
            f"dist_to_densest_cell_m={round(d,2)}  densest_count={cell.get('count')}"
        )


if __name__ == "__main__":
    main()

