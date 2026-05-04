import ngeohash from "ngeohash";
import GpsRaw from "./src/models/gpsRaw.model.js";
import connectDB from "./config/db.js";
import "dotenv/config";

const userId = "U123";
const gapSeconds = 5;
const stayGapSeconds = 30;

let currentStartTime = new Date("2026-05-04T09:15:00+05:30").getTime();
let globalPointIndex = 0;

function getTimeOfDay(date) {
  const hour = date.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

function getDistanceMeter(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getHeading(lat1, lng1, lat2, lng2) {
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  lat1 = (lat1 * Math.PI) / 180;
  lat2 = (lat2 * Math.PI) / 180;

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

  return Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360);
}

function randomNoiseMeter(lat, lng, maxMeter = 20) {
  const r = maxMeter / 111320;

  const newLat = lat + (Math.random() * 2 - 1) * r;
  const newLng =
    lng + ((Math.random() * 2 - 1) * r) / Math.cos((lat * Math.PI) / 180);

  return [Number(newLat.toFixed(7)), Number(newLng.toFixed(7))];
}

function createBaseDoc({
  lat,
  lng,
  date,
  speed = 0,
  heading = 0,
  vin,
  routeType,
  movementType,
  pointIndex,
  placeType = null
}) {
  const timestamp = Math.floor(date.getTime() / 1000);

  return {
    user_id: userId,
    vin,
    device_type: "mobile",

    gps_TimeStamp: timestamp,
    createdOn: timestamp,
    updatedOn: timestamp,

    lat,
    lng,

    location: {
      type: "Point",
      coordinates: [lng, lat]
    },

    geoHash: ngeohash.encode(lat, lng, 8),

    speed,
    heading,
    accuracy: Math.floor(Math.random() * 8) + 5,
    altitude: null,
    hdop: Number((Math.random() * 0.8 + 0.8).toFixed(2)),
    soc: 85,
    igs: 1,

    day_of_week: date.toLocaleDateString("en-US", { weekday: "long" }),
    is_weekend: [0, 6].includes(date.getDay()),
    time_of_day: getTimeOfDay(date),

    processed: false,

    route_type: routeType,
    movement_type: movementType,
    place_type: placeType,
    point_index: pointIndex
  };
}

function generateTripWithStay(
  polyline,
  stayHours = 0,
  stayMinutes = 0,
  options = {}
) {
  const {
    vin = "TRIP_001",
    routeType = "home_to_office",
    placeType = "OFFICE"
  } = options;

  const movingData = polyline.map(([lat, lng], index) => {
    const date = new Date(currentStartTime + index * gapSeconds * 1000);

    let speed = 0;
    let heading = 0;

    if (index > 0) {
      const [prevLat, prevLng] = polyline[index - 1];
      const distance = getDistanceMeter(prevLat, prevLng, lat, lng);

      speed = Number((distance / gapSeconds).toFixed(2));
      heading = getHeading(prevLat, prevLng, lat, lng);
    }

    return createBaseDoc({
      lat,
      lng,
      date,
      speed,
      heading,
      vin,
      routeType,
      movementType: "moving",
      pointIndex: globalPointIndex++
    });
  });

 const movingEndTime =
  currentStartTime + (polyline.length - 1) * gapSeconds * 1000 + gapSeconds * 1000;

  const stayTotalMinutes = stayHours * 60 + stayMinutes;
  const stayTotalPoints = Math.floor(
    (stayTotalMinutes * 60) / stayGapSeconds
  );

  const [baseLat, baseLng] = polyline[polyline.length - 1];

  const stayData = Array.from({ length: stayTotalPoints }, (_, index) => {
    const [lat, lng] = randomNoiseMeter(baseLat, baseLng, 20);
    const date = new Date(movingEndTime + index * stayGapSeconds * 1000);

    return createBaseDoc({
      lat,
      lng,
      date,
      speed: Number((Math.random() * 0.4).toFixed(2)),
      heading: Math.floor(Math.random() * 360),
      vin,
      routeType,
      movementType: "stay",
      placeType,
      pointIndex: globalPointIndex++
    });
  });

  const stayEndTime =
    movingEndTime + stayTotalPoints * stayGapSeconds * 1000;

  currentStartTime = stayEndTime;

  return [...movingData, ...stayData];
}

/////////////////////////$$$$$$$$$$$$$$$$$$$$$$$$$$$$444444444  $$$$$$$$$$$$$$$$$$$$$$$$$$$$/////////////////////////
const homeTohomePolyline = [
     [
        28.54412,
        77.2763
    ],
    [
        28.54424,
        77.27632
    ]
]
const homeToOfficePolyline = [
    [
        28.54412,
        77.2763
    ],
    [
        28.54424,
        77.27632
    ],
    [
        28.54443,
        77.27629
    ],
    [
        28.54445,
        77.27628
    ],
    [
        28.54447,
        77.27626
    ],
    [
        28.54453,
        77.27622
    ],
    [
        28.54454,
        77.27621
    ],
    [
        28.54456,
        77.2762
    ],
    [
        28.54457,
        77.2762
    ],
    [
        28.54469,
        77.27619
    ],
    [
        28.54478,
        77.27618
    ],
    [
        28.5449,
        77.27617
    ],
    [
        28.54496,
        77.27615
    ],
    [
        28.54531,
        77.27602
    ],
    [
        28.54536,
        77.27599
    ],
    [
        28.54553,
        77.27593
    ],
    [
        28.54565,
        77.27592
    ],
    [
        28.54602,
        77.27594
    ],
    [
        28.54615,
        77.27596
    ],
    [
        28.54653,
        77.27595
    ],
    [
        28.54668,
        77.27595
    ],
    [
        28.54684,
        77.27594
    ],
    [
        28.54698,
        77.27611
    ],
    [
        28.54701,
        77.27615
    ],
    [
        28.54704,
        77.27617
    ],
    [
        28.54709,
        77.27618
    ],
    [
        28.54724,
        77.27601
    ],
    [
        28.54736,
        77.27589
    ],
    [
        28.54745,
        77.27589
    ],
    [
        28.54753,
        77.27585
    ],
    [
        28.54765,
        77.27575
    ],
    [
        28.54781,
        77.27555
    ],
    [
        28.54791,
        77.27544
    ],
    [
        28.548,
        77.27547
    ],
    [
        28.54807,
        77.27544
    ],
    [
        28.54824,
        77.27531
    ],
    [
        28.54832,
        77.27522
    ],
    [
        28.54852,
        77.27487
    ],
    [
        28.54858,
        77.27476
    ],
    [
        28.54863,
        77.27475
    ],
    [
        28.54867,
        77.27475
    ],
    [
        28.54868,
        77.27474
    ],
    [
        28.5487,
        77.27473
    ],
    [
        28.54871,
        77.27472
    ],
    [
        28.54879,
        77.2746
    ],
    [
        28.5488,
        77.27458
    ],
    [
        28.54881,
        77.27455
    ],
    [
        28.54883,
        77.2744
    ],
    [
        28.54892,
        77.27438
    ],
    [
        28.54899,
        77.27435
    ],
    [
        28.54906,
        77.27428
    ],
    [
        28.54922,
        77.27393
    ],
    [
        28.54926,
        77.27384
    ],
    [
        28.54929,
        77.27379
    ],
    [
        28.54938,
        77.27369
    ],
    [
        28.54946,
        77.27373
    ],
    [
        28.54949,
        77.27373
    ],
    [
        28.54956,
        77.27371
    ],
    [
        28.54963,
        77.27368
    ],
    [
        28.54979,
        77.27357
    ],
    [
        28.55004,
        77.27322
    ],
    [
        28.55029,
        77.27301
    ],
    [
        28.55071,
        77.27264
    ],
    [
        28.55112,
        77.27227
    ],
    [
        28.55161,
        77.27181
    ],
    [
        28.5521,
        77.27136
    ],
    [
        28.55206,
        77.2707
    ],
    [
        28.55205,
        77.2703
    ],
    [
        28.552,
        77.2703
    ],
    [
        28.55195,
        77.27029
    ],
    [
        28.55193,
        77.27027
    ],
    [
        28.5519,
        77.27023
    ],
    [
        28.55177,
        77.27031
    ],
    [
        28.55154,
        77.27039
    ],
    [
        28.55125,
        77.26965
    ],
    [
        28.55123,
        77.26958
    ],
    [
        28.5512,
        77.2695
    ],
    [
        28.55112,
        77.26926
    ],
    [
        28.55108,
        77.26915
    ],
    [
        28.55108,
        77.26914
    ]
];


const officeToLunchPolyline = 
[
    [
        28.55108,
        77.26914
    ],
    [
        28.55108,
        77.26915
    ],
    [
        28.55112,
        77.26926
    ],
    [
        28.5512,
        77.2695
    ],
    [
        28.55123,
        77.26958
    ],
    [
        28.55125,
        77.26965
    ],
    [
        28.55154,
        77.27039
    ],
    [
        28.55177,
        77.27031
    ],
    [
        28.5519,
        77.27023
    ],
    [
        28.55188,
        77.27018
    ],
    [
        28.55189,
        77.27013
    ],
    [
        28.5519,
        77.27011
    ],
    [
        28.55193,
        77.27006
    ],
    [
        28.55195,
        77.27005
    ],
    [
        28.55198,
        77.27003
    ],
    [
        28.55201,
        77.27003
    ],
    [
        28.55205,
        77.27003
    ],
    [
        28.55212,
        77.26998
    ],
    [
        28.55272,
        77.26944
    ],
    [
        28.55331,
        77.26891
    ],
    [
        28.55382,
        77.26846
    ],
    [
        28.55405,
        77.26825
    ],
    [
        28.55412,
        77.26817
    ],
    [
        28.55417,
        77.26811
    ],
    [
        28.5543,
        77.26791
    ],
    [
        28.55429,
        77.26788
    ],
    [
        28.55429,
        77.26784
    ],
    [
        28.5543,
        77.2678
    ],
    [
        28.55431,
        77.26778
    ],
    [
        28.55433,
        77.26776
    ],
    [
        28.55435,
        77.26775
    ],
    [
        28.55439,
        77.26774
    ],
    [
        28.55443,
        77.26775
    ],
    [
        28.55445,
        77.26777
    ],
    [
        28.55447,
        77.26779
    ],
    [
        28.55454,
        77.26775
    ],
    [
        28.55459,
        77.26772
    ],
    [
        28.55483,
        77.26751
    ],
    [
        28.55522,
        77.2672
    ],
    [
        28.55545,
        77.26705
    ],
    [
        28.55527,
        77.26668
    ],
    [
        28.55517,
        77.2665
    ],
    [
        28.555,
        77.26619
    ],
    [
        28.55478,
        77.26582
    ],
    [
        28.55462,
        77.26559
    ],
    [
        28.55444,
        77.26543
    ],
    [
        28.55433,
        77.26536
    ],
    [
        28.55414,
        77.26524
    ],
    [
        28.5539,
        77.26513
    ],
    [
        28.55313,
        77.26481
    ],
    [
        28.55292,
        77.26472
    ],
    [
        28.5527,
        77.26463
    ],
    [
        28.55248,
        77.26455
    ],
    [
        28.5521,
        77.26441
    ],
    [
        28.55188,
        77.26432
    ],
    [
        28.55172,
        77.26433
    ],
    [
        28.55094,
        77.26408
    ],
    [
        28.55057,
        77.26393
    ],
    [
        28.55026,
        77.26378
    ],
    [
        28.54982,
        77.26343
    ],
    [
        28.54972,
        77.26333
    ],
    [
        28.54953,
        77.2631
    ],
    [
        28.54953,
        77.26302
    ],
    [
        28.54953,
        77.26297
    ],
    [
        28.54954,
        77.26294
    ],
    [
        28.54957,
        77.26291
    ],
    [
        28.54961,
        77.26291
    ],
    [
        28.54964,
        77.26292
    ],
    [
        28.54973,
        77.26296
    ],
    [
        28.54992,
        77.26317
    ],
    [
        28.55009,
        77.26334
    ],
    [
        28.55042,
        77.26357
    ],
    [
        28.5507,
        77.26371
    ],
    [
        28.55112,
        77.26389
    ],
    [
        28.55191,
        77.2642
    ],
    [
        28.55208,
        77.26426
    ],
    [
        28.55217,
        77.2643
    ],
    [
        28.55228,
        77.26434
    ],
    [
        28.55236,
        77.26437
    ],
    [
        28.55267,
        77.26449
    ],
    [
        28.55286,
        77.26457
    ],
    [
        28.55294,
        77.2646
    ],
    [
        28.55323,
        77.26472
    ],
    [
        28.55376,
        77.26495
    ],
    [
        28.55429,
        77.26517
    ],
    [
        28.55442,
        77.26525
    ]
];

const homeToGymPolyline =[
    [
        28.54412,
        77.2763
    ],
    [
        28.54398,
        77.27626
    ],
    [
        28.54369,
        77.27617
    ],
    [
        28.54364,
        77.27617
    ],
    [
        28.54349,
        77.27615
    ],
    [
        28.54341,
        77.27615
    ],
    [
        28.54335,
        77.27615
    ],
    [
        28.54328,
        77.27617
    ],
    [
        28.54325,
        77.27618
    ],
    [
        28.54322,
        77.2762
    ],
    [
        28.54315,
        77.27626
    ],
    [
        28.54309,
        77.27633
    ],
    [
        28.54284,
        77.27667
    ],
    [
        28.54277,
        77.2768
    ],
    [
        28.54247,
        77.27701
    ],
    [
        28.54182,
        77.27748
    ],
    [
        28.54175,
        77.27753
    ],
    [
        28.54157,
        77.27764
    ],
    [
        28.54142,
        77.27774
    ],
    [
        28.54127,
        77.27785
    ],
    [
        28.54122,
        77.27788
    ],
    [
        28.5411,
        77.27796
    ],
    [
        28.5408,
        77.27815
    ],
    [
        28.54076,
        77.27818
    ],
    [
        28.54033,
        77.27844
    ],
    [
        28.54054,
        77.27885
    ]
];

const homeToRestaurantPolyline = [
    [
        28.54412,
        77.2763
    ],
    [
        28.54424,
        77.27632
    ],
    [
        28.54443,
        77.27629
    ],
    [
        28.54445,
        77.27628
    ],
    [
        28.54447,
        77.27626
    ],
    [
        28.54453,
        77.27622
    ],
    [
        28.54454,
        77.27621
    ],
    [
        28.54456,
        77.2762
    ],
    [
        28.54457,
        77.2762
    ],
    [
        28.54469,
        77.27619
    ],
    [
        28.54478,
        77.27618
    ],
    [
        28.5449,
        77.27617
    ],
    [
        28.54496,
        77.27615
    ],
    [
        28.54531,
        77.27602
    ],
    [
        28.54536,
        77.27599
    ],
    [
        28.54553,
        77.27593
    ],
    [
        28.54565,
        77.27592
    ],
    [
        28.54602,
        77.27594
    ],
    [
        28.54615,
        77.27596
    ],
    [
        28.54653,
        77.27595
    ],
    [
        28.54668,
        77.27595
    ],
    [
        28.54684,
        77.27594
    ],
    [
        28.54698,
        77.27611
    ],
    [
        28.54701,
        77.27615
    ],
    [
        28.54704,
        77.27617
    ],
    [
        28.54709,
        77.27618
    ],
    [
        28.54724,
        77.27601
    ],
    [
        28.54736,
        77.27589
    ],
    [
        28.54745,
        77.27589
    ],
    [
        28.54753,
        77.27585
    ],
    [
        28.54765,
        77.27575
    ],
    [
        28.54781,
        77.27555
    ],
    [
        28.54791,
        77.27544
    ],
    [
        28.548,
        77.27547
    ],
    [
        28.54807,
        77.27544
    ],
    [
        28.54824,
        77.27531
    ],
    [
        28.54832,
        77.27522
    ],
    [
        28.54852,
        77.27487
    ],
    [
        28.54858,
        77.27476
    ],
    [
        28.54863,
        77.27475
    ],
    [
        28.54867,
        77.27475
    ],
    [
        28.54868,
        77.27474
    ],
    [
        28.5487,
        77.27473
    ],
    [
        28.54871,
        77.27472
    ],
    [
        28.54879,
        77.2746
    ],
    [
        28.5488,
        77.27458
    ],
    [
        28.54881,
        77.27455
    ],
    [
        28.54883,
        77.2744
    ],
    [
        28.54892,
        77.27438
    ],
    [
        28.54899,
        77.27435
    ],
    [
        28.54906,
        77.27428
    ],
    [
        28.54922,
        77.27393
    ],
    [
        28.54926,
        77.27384
    ],
    [
        28.54929,
        77.27379
    ],
    [
        28.54938,
        77.27369
    ],
    [
        28.54923,
        77.27342
    ],
    [
        28.54888,
        77.27282
    ],
    [
        28.54875,
        77.27258
    ],
    [
        28.5484,
        77.27195
    ],
    [
        28.54837,
        77.2719
    ],
    [
        28.54808,
        77.27136
    ],
    [
        28.54778,
        77.27082
    ],
    [
        28.54741,
        77.27011
    ],
    [
        28.54705,
        77.26941
    ],
    [
        28.54671,
        77.26959
    ],
    [
        28.5463,
        77.26981
    ],
    [
        28.54617,
        77.26959
    ],
    [
        28.54605,
        77.26932
    ],
    [
        28.54604,
        77.26925
    ],
    [
        28.54604,
        77.26895
    ],
    [
        28.54606,
        77.26875
    ],
    [
        28.54605,
        77.26866
    ],
    [
        28.54603,
        77.26857
    ],
    [
        28.54585,
        77.2682
    ],
    [
        28.54578,
        77.2681
    ],
    [
        28.54574,
        77.26806
    ],
    [
        28.54571,
        77.26803
    ],
    [
        28.54565,
        77.26801
    ],
    [
        28.54558,
        77.268
    ],
    [
        28.54506,
        77.26803
    ],
    [
        28.54504,
        77.26796
    ],
    [
        28.54503,
        77.26792
    ],
    [
        28.54498,
        77.26737
    ],
    [
        28.54497,
        77.26721
    ],
    [
        28.54493,
        77.26687
    ],
    [
        28.54488,
        77.26647
    ],
    [
        28.5448,
        77.26612
    ],
    [
        28.54462,
        77.26542
    ],
    [
        28.54442,
        77.26452
    ],
    [
        28.5444,
        77.26444
    ],
    [
        28.54438,
        77.26437
    ],
    [
        28.54379,
        77.2646
    ],
    [
        28.54374,
        77.26463
    ],
    [
        28.54371,
        77.26456
    ],
    [
        28.54362,
        77.26421
    ],
    [
        28.54345,
        77.26372
    ],
    [
        28.54342,
        77.26365
    ],
    [
        28.54338,
        77.26358
    ],
    [
        28.54336,
        77.26355
    ],
    [
        28.54332,
        77.26353
    ],
    [
        28.5432,
        77.26346
    ],
    [
        28.5427,
        77.26327
    ],
    [
        28.54219,
        77.26308
    ],
    [
        28.54156,
        77.26284
    ],
    [
        28.54153,
        77.26294
    ],
    [
        28.54151,
        77.26299
    ],
    [
        28.54134,
        77.26347
    ],
    [
        28.54121,
        77.26381
    ],
    [
        28.54109,
        77.26422
    ],
    [
        28.54108,
        77.26431
    ],
    [
        28.54108,
        77.2644
    ],
    [
        28.54092,
        77.26463
    ],
    [
        28.54064,
        77.26446
    ]
];

/////
const homeTohomeData = generateTripWithStay(
  homeTohomePolyline,
  0,
  30,
  {
    vin: "HOME_HOME_001",
    routeType: "home_to_home",
    placeType: "HOME"
  }
);

const homeToOfficeData = generateTripWithStay(
  homeToOfficePolyline,
  4,
  30,
  {
    vin: "HOME_OFFICE_001",
    routeType: "home_to_office",
    placeType: "OFFICE"
  }
);

const officeToLunchData = generateTripWithStay(
  officeToLunchPolyline,
  1,
  10,
  {
    vin: "OFFICE_LUNCH_001",
    routeType: "office_to_lunch",
    placeType: "LUNCH"
  }
);

const lunchToOfficeData = generateTripWithStay(
 [...officeToLunchPolyline].reverse()  ,
  5,
  32,
  {
    vin: "LUNCH_OFFICE_001",
    routeType: "lunch_to_office",
    placeType: "OFFICE"
  }
);


const officeToHomeData = generateTripWithStay(
  [...homeToOfficePolyline].reverse(),
  0,
  46,
  {
    vin: "OFFICE_HOME_001",
    routeType: "office_to_home",
    placeType: "HOME"
  }
);

const homeToGymData = generateTripWithStay(
  homeToGymPolyline,
  1,
  10,
  {
    vin: "HOME_GYM_001",
    routeType: "home_to_gym",
    placeType: "GYM"
  }
);

const gymToHomeData = generateTripWithStay(
  [...homeToGymPolyline].reverse(),
  1,
  20,
  {
    vin: "GYM_HOME_001",
    routeType: "gym_to_home",
    placeType: "HOME"
  }
);

const homeToRestaurantData = generateTripWithStay(
  homeToRestaurantPolyline,
  1,
  10,
  {
    vin: "HOME_RESTAURANT_001",
    routeType: "home_to_restaurant",
    placeType: "RESTAURANT"
  }
);

const restaurantToHomeData = generateTripWithStay(
  [...homeToRestaurantPolyline].reverse(),
  8,
  20,
  {
    vin: "HOME_RESTAURANT_001",
    routeType: "home_to_restaurant",
    placeType: "HOME"
  }
);


await connectDB();

await GpsRaw.insertMany([
    ...homeTohomeData,
    ...homeToOfficeData,
    ...officeToLunchData,
    ...lunchToOfficeData,
    ...officeToHomeData,
    ...homeToGymData,
    ...gymToHomeData,
    ...homeToRestaurantData,
    ...restaurantToHomeData
]);

console.log("Data inserted successfully");