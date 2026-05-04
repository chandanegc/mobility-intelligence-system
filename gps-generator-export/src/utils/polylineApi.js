function decodePolyline(encoded) {
  if (!encoded) return [];

  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]); // [lat, lng]
  }

  return points;
}

async function getRoutePolyline({ token, points, profile = "driving" }) {
  const coordinates = points.map(([lng, lat]) => `${lng},${lat}`).join(";");

  const url =
    `https://apis.mapmyindia.com/advancedmaps/v1/${token}/route_adv/${profile}/${coordinates}` +
    `?alternatives=false&geometries=polyline&overview=full&steps=false&region=ind`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Route API failed: ${response.status}`);
  }

  const data = await response.json();

  const encodedPolyline = data?.routes?.[0]?.geometry;

  if (!encodedPolyline) {
    throw new Error("Polyline not found in route response");
  }

  return decodePolyline(encodedPolyline);
}

///////////////////////////

const token = "0cb611e0-85b0-4e04-b785-81ee56aad330";

const points = [
  //   [
  //     77.33425620265905, // vashali (home)
  //     28.64782335614879,
  //   ],

//   [
//     77.26919445767186, //MMI  (office)
//     28.55115739290865,
//   ],

//   [
//     77.2678088462576, //lunch (food court) kangaroo park
//     28.55377346240806,
//   ],
//   [
//     77.26919445767186, //MMI  (office)
//     28.55115739290865,
//   ],

//   [
//     77.33425620265905, // vashali (home)
//     28.64782335614879,
//   ],

//   [
//     77.35790358462896, //eye care
//     28.65778085541369,
//   ],

//   [
//     77.33425620265905, // vashali (home)
//     28.64782335614879,
//   ],

//   [
//     77.33307303993791, //gym
//     28.634937894870816,
//   ],

//   [
//     77.36100983358688, //food bazar
//     28.63577381626672,
//   ],

//   [
//     77.3564667148284,
//     28.57832156448444, // Noida city center
//   ],

//   [
//     77.33425620265905, // vashali (home)
//     28.64782335614879,
//   ],
];

const polyline = await getRoutePolyline({
  token,
  points,
  profile: "driving",
});

console.log(JSON.stringify([...polyline]));
