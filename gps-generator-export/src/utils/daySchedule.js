/**
 * Builds a realistic daily schedule for a user.
 * Returns an ordered array of "segments" — each with type, location, start/end timestamps.
 *
 * Weekday schedule (approx):
 *   00:00 – 06:00  Sleep at home
 *   06:00 – 06:30  Morning walk (gym or nearby)
 *   06:30 – 07:00  Coffee stop
 *   07:00 – 08:30  Drive to office
 *   08:30 – 13:00  Stay at office (work)
 *   13:00 – 13:30  Walk to restaurant for lunch
 *   13:30 – 14:30  Stay at restaurant
 *   14:30 – 15:00  Walk back to office
 *   15:00 – 19:00  Stay at office
 *   19:00 – 20:30  Drive back home
 *   20:30 – 23:59  Stay at home (evening/night)
 *
 * Weekend schedule:
 *   00:00 – 08:00  Sleep
 *   08:00 – 09:00  Morning walk (gym)
 *   09:00 – 10:00  Coffee
 *   10:00 – 12:30  Drive to mall
 *   12:30 – 15:00  Stay at mall
 *   15:00 – 16:30  Drive back home
 *   16:30 – 23:59  Stay at home
 */

const SEGMENT_TYPE = {
    STAY:  'STAY',
    WALK:  'WALK',
    DRIVE: 'DRIVE'
};

/** jitter adds ±0–15 min randomness to avoid robotic exact times */
const jitter = (minutes = 15) => Math.floor(Math.random() * minutes * 60);

export const buildDaySchedule = (profile, dayDate, isWeekend) => {
    const { locations } = profile;
    const base = new Date(dayDate);
    base.setHours(0, 0, 0, 0);
    const t = (h, m = 0) => Math.floor(base.getTime() / 1000) + h * 3600 + m * 60;

    const segments = [];

    if (!isWeekend) {
        // ── Weekday ──────────────────────────────────────────────────────────
        segments.push(
            { type: SEGMENT_TYPE.STAY,  from: locations.home,       start: t(0),  end: t(6),       speed: 0,           label: 'sleep' },
            { type: SEGMENT_TYPE.WALK,  from: locations.home,       to: locations.gym,    start: t(6),  end: t(6,30)+jitter(10), speed: rnd(3, 6),   label: 'morning_walk' },
            { type: SEGMENT_TYPE.STAY,  from: locations.gym,        start: t(6,30), end: t(6,50)+jitter(10), speed: 0, label: 'gym_stop' },
            { type: SEGMENT_TYPE.WALK,  from: locations.gym,        to: locations.coffee, start: t(6,55), end: t(7,10)+jitter(5), speed: rnd(3, 5),  label: 'walk_to_coffee' },
            { type: SEGMENT_TYPE.STAY,  from: locations.coffee,     start: t(7,10), end: t(7,30)+jitter(10), speed: 0, label: 'coffee_stop' },
            { type: SEGMENT_TYPE.DRIVE, from: locations.coffee,     to: locations.office, start: t(7,35), end: t(8,30)+jitter(15), speed: rnd(25, 55), label: 'commute_to_office' },
            { type: SEGMENT_TYPE.STAY,  from: locations.office,     start: t(8,30), end: t(13,0),  speed: 0,           label: 'work_morning' },
            { type: SEGMENT_TYPE.WALK,  from: locations.office,     to: locations.restaurant, start: t(13,0), end: t(13,20)+jitter(10), speed: rnd(3, 5), label: 'walk_to_lunch' },
            { type: SEGMENT_TYPE.STAY,  from: locations.restaurant, start: t(13,20), end: t(14,15)+jitter(15), speed: 0, label: 'lunch_break' },
            { type: SEGMENT_TYPE.WALK,  from: locations.restaurant, to: locations.office, start: t(14,15), end: t(14,40)+jitter(10), speed: rnd(3, 5), label: 'walk_back_office' },
            { type: SEGMENT_TYPE.STAY,  from: locations.office,     start: t(14,40), end: t(19,0), speed: 0,            label: 'work_afternoon' },
            { type: SEGMENT_TYPE.DRIVE, from: locations.office,     to: locations.home, start: t(19,0), end: t(20,15)+jitter(20), speed: rnd(20, 50), label: 'commute_home' },
            { type: SEGMENT_TYPE.STAY,  from: locations.home,       start: t(20,15), end: t(24,0)-1, speed: 0,          label: 'evening_home' }
        );
    } else {
        // ── Weekend ──────────────────────────────────────────────────────────
        segments.push(
            { type: SEGMENT_TYPE.STAY,  from: locations.home,   start: t(0),    end: t(8)+jitter(30),   speed: 0,           label: 'sleep_weekend' },
            { type: SEGMENT_TYPE.WALK,  from: locations.home,   to: locations.gym, start: t(8), end: t(8,40)+jitter(10), speed: rnd(3, 6), label: 'weekend_gym' },
            { type: SEGMENT_TYPE.STAY,  from: locations.gym,    start: t(8,40), end: t(9,30)+jitter(15), speed: 0,          label: 'gym_workout' },
            { type: SEGMENT_TYPE.WALK,  from: locations.gym,    to: locations.coffee, start: t(9,30), end: t(9,50)+jitter(10), speed: rnd(3, 5), label: 'walk_coffee' },
            { type: SEGMENT_TYPE.STAY,  from: locations.coffee, start: t(9,50), end: t(10,20)+jitter(15), speed: 0,         label: 'coffee_weekend' },
            { type: SEGMENT_TYPE.DRIVE, from: locations.coffee, to: locations.mall, start: t(10,30), end: t(11,30)+jitter(20), speed: rnd(20, 45), label: 'drive_to_mall' },
            { type: SEGMENT_TYPE.STAY,  from: locations.mall,   start: t(11,30), end: t(15,0)+jitter(30), speed: 0,         label: 'mall_visit' },
            { type: SEGMENT_TYPE.DRIVE, from: locations.mall,   to: locations.home, start: t(15,30), end: t(17,0)+jitter(30), speed: rnd(20, 50), label: 'drive_home_weekend' },
            { type: SEGMENT_TYPE.STAY,  from: locations.home,   start: t(17,0), end: t(24,0)-1, speed: 0,                  label: 'home_evening_weekend' }
        );
    }

    return segments;
};

const rnd = (min, max) => parseFloat((Math.random() * (max - min) + min).toFixed(1));
