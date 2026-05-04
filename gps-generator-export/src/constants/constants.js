export const TYPE = {
    STOP_AT_CURRENT:     'STOP_AT_CURRENT',
    STOP_AT_DESTINATION: 'STOP_AT_DESTINATION',
    RETURN:              'RETURN',
    GO:                  'GO'
};

export const ACTIVITY = {
    STAY:    'STAY',
    WALK:    'WALK',
    DRIVE:   'DRIVE',
    UNKNOWN: 'UNKNOWN'
};

export const TIME_OF_DAY = {
    MORNING:   'morning',    // 05:00 – 11:59
    AFTERNOON: 'afternoon',  // 12:00 – 16:59
    EVENING:   'evening',    // 17:00 – 20:59
    NIGHT:     'night'       // 21:00 – 04:59
};

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const BATCH_SIZE    = 8000;  // bulkWrite batch size
export const CHUNK_SIZE    = 50000; // generator chunk size
export const INTERVAL_SEC  = 3;     // GPS ping every 3 seconds
