def classify_place(stats):
    night_ratio = stats.get("night_visit_ratio", 0)
    day_ratio = stats.get("day_visit_ratio", 0)
    weekday_ratio = stats.get("weekday_ratio", 0)

    avg_duration = stats.get("avg_duration_sec", 0)
    visit_count = stats.get("visit_count", 0)

    if night_ratio >= 0.45 and visit_count >= 2:
        return {
            "place_type": "HOME",
            "place_type_source": "rule",
            "place_type_confidence": 0.95
        }

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

    if 30 * 60 <= avg_duration <= 2 * 60 * 60 and visit_count >= 2:
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