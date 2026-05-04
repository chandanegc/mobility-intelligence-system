import math


EARTH_RADIUS_KM = 6371.0088
EARTH_RADIUS_M = 6371000


def haversine_meters(lat1, lng1, lat2, lng2):
    lat1 = math.radians(float(lat1))
    lng1 = math.radians(float(lng1))
    lat2 = math.radians(float(lat2))
    lng2 = math.radians(float(lng2))

    dlat = lat2 - lat1
    dlng = lng2 - lng1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )

    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return EARTH_RADIUS_M * c


def make_grid_key(lat, lng, precision=4):
    return f"{round(float(lat), precision)}_{round(float(lng), precision)}"