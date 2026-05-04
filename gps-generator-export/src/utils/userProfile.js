/**
 * Generates a synthetic user profile with realistic location clusters.
 * All locations are within a believable city radius from a home base.
 */

const CITY_BASES = [
    { city: 'Delhi-NCR',  lat: 28.6139, lng: 77.2090 },
    { city: 'Mumbai',     lat: 19.0760, lng: 72.8777 },
    { city: 'Bangalore',  lat: 12.9716, lng: 77.5946 },
    { city: 'Hyderabad',  lat: 17.3850, lng: 78.4867 },
    { city: 'Pune',       lat: 18.5204, lng: 73.8567 },
    { city: 'Chennai',    lat: 13.0827, lng: 80.2707 },
];

const DEVICE_TYPES = ['mobile', 'tablet', 'obd', 'dashcam'];

/** Offset a coordinate by random km in any direction */
const offsetCoord = (base, maxKm) => {
    const latOffset = (Math.random() - 0.5) * 2 * (maxKm / 111);
    const lngOffset = (Math.random() - 0.5) * 2 * (maxKm / (111 * Math.cos(base * Math.PI / 180)));
    return parseFloat((base + latOffset).toFixed(7));
};

const offsetPoint = (baseLat, baseLng, maxKm) => ({
    lat: offsetCoord(baseLat, maxKm),
    lng: offsetCoord(baseLng, maxKm)
});

/**
 * Generate a user profile.
 * @param {number} index - user index (0-based) for deterministic IDs
 */
export const generateUserProfile = (index) => {
    const cityBase   = CITY_BASES[index % CITY_BASES.length];
    const userId     = `U${String(index + 1).padStart(3, '0')}`;
    const vin        = `VIN${Math.random().toString(36).substring(2, 12).toUpperCase()}`;
    const deviceType = DEVICE_TYPES[index % DEVICE_TYPES.length];

    // Home — city base ± 5km
    const home = offsetPoint(cityBase.lat, cityBase.lng, 5);

    // Office — 10–25km from home
    const office = offsetPoint(home.lat, home.lng, 20);

    // POIs — gym, coffee, mall, restaurant near home/office
    const gym        = offsetPoint(home.lat, home.lng, 3);
    const coffee     = offsetPoint(home.lat, home.lng, 2);
    const mall       = offsetPoint(office.lat, office.lng, 5);
    const restaurant = offsetPoint(office.lat, office.lng, 3);

    return {
        user_id:     userId,
        vin,
        device_type: deviceType,
        city:        cityBase.city,
        locations: { home, office, gym, coffee, mall, restaurant },
        // Simulated SOC drain: full at start, drains over the day
        initialSoc: Math.floor(Math.random() * 30) + 70, // 70–100%
    };
};
