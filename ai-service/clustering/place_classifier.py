def classify_place(cluster_features):
    """
    Rule-based place classification.
    Later yaha Google Places API + ML add kar sakte ho.
    """

    night_ratio = cluster_features.get("night_visit_ratio", 0)
    day_ratio = cluster_features.get("day_visit_ratio", 0)
    weekday_ratio = cluster_features.get("weekday_ratio", 0)

    avg_duration = cluster_features.get("avg_duration_sec", 0)
    visit_count = cluster_features.get("visit_count", 0)

    # HOME:
    # night visits high + repeated visits
    if night_ratio >= 0.45 and visit_count >= 2:
        return {
            "place_type": "HOME",
            "place_type_source": "rule",
            "place_type_confidence": 0.95
        }

    # OFFICE:
    # day time + weekday + long duration
    if (
        day_ratio >= 0.45
        and weekday_ratio >= 0.60
        and avg_duration >= 3 * 60 * 60
    ):
        return {
            "place_type": "OFFICE",
            "place_type_source": "rule",
            "place_type_confidence": 0.90
        }

    # GYM:
    # medium duration + repeated visits
    if (
        30 * 60 <= avg_duration <= 2 * 60 * 60
        and visit_count >= 2
    ):
        return {
            "place_type": "GYM",
            "place_type_source": "rule",
            "place_type_confidence": 0.65
        }

    return {
        "place_type": "OTHER",
        "place_type_source": "rule",
        "place_type_confidence": 0.50
    }