/** Geography for the live-tracking map — a stylised India map, not a
 *  survey map. City points are real latitude / longitude; the outline is a
 *  simplified trace of India's boundary (as officially depicted), good for
 *  orientation at a glance, not for measurement. Projection is plain
 *  equirectangular over the box below, so GPS fixes from a driver's phone
 *  land in the right place on the same drawing. */

export interface LatLng { lat: number; lng: number }

/** Map box: west, east, south, north (degrees). */
export const BOX = { w: 67.5, e: 97.8, s: 6.0, n: 37.5 };
export const MAP_W = 600;
export const MAP_H = Math.round(MAP_W * ((BOX.n - BOX.s) / (BOX.e - BOX.w)) * 1.05);

export function project(p: LatLng): { x: number; y: number } {
  return {
    x: ((p.lng - BOX.w) / (BOX.e - BOX.w)) * MAP_W,
    y: ((BOX.n - p.lat) / (BOX.n - BOX.s)) * MAP_H,
  };
}

/** [lng, lat] trace, clockwise from the Rann of Kutch. */
const OUTLINE: [number, number][] = [
  [68.4, 23.6], [69.6, 24.3], [71.0, 24.4], [70.6, 25.7], [70.0, 26.6], [70.7, 27.9], [72.2, 28.4], [73.4, 29.9],
  [74.6, 31.0], [74.6, 32.0], [73.6, 33.0], [72.9, 34.3], [73.0, 36.0], [74.5, 37.0], [75.8, 36.9], [77.8, 35.6],
  [79.5, 35.6], [80.2, 35.0], [79.4, 32.6], [78.8, 31.6], [79.1, 31.0], [80.2, 30.2], [81.1, 28.6], [82.6, 27.5],
  [84.1, 27.4], [85.6, 26.7], [87.0, 26.4], [88.1, 26.5], [88.1, 27.9], [88.9, 27.3], [89.8, 26.7], [91.6, 26.8],
  [92.1, 26.9], [92.0, 27.8], [93.9, 28.7], [95.4, 29.1], [96.5, 29.3], [97.4, 28.2], [96.9, 27.2], [95.2, 26.1],
  [94.6, 24.4], [93.4, 23.1], [93.1, 22.1], [92.6, 21.9], [92.3, 23.6], [91.6, 22.9], [91.2, 23.6], [91.9, 24.2],
  [92.2, 25.0], [90.4, 25.2], [89.8, 25.3], [88.6, 24.3], [88.7, 23.2], [89.0, 22.0], [88.0, 21.6], [87.0, 21.4],
  [86.6, 20.6], [85.5, 19.7], [84.8, 19.2], [83.4, 18.0], [82.3, 16.6], [81.2, 16.0], [80.3, 15.6], [80.1, 13.6],
  [80.3, 13.0], [79.9, 11.8], [79.8, 10.3], [79.2, 9.3], [78.4, 8.9], [77.5, 8.1], [76.9, 8.4], [76.3, 9.6],
  [75.8, 11.3], [74.9, 12.8], [74.4, 14.5], [73.8, 15.6], [73.3, 17.0], [72.8, 18.9], [72.7, 20.4], [72.9, 21.3],
  [72.5, 21.9], [72.2, 21.2], [70.9, 20.7], [69.0, 22.3], [69.7, 22.8], [70.4, 22.9], [68.9, 22.9],
];
export const INDIA_PATH = OUTLINE.map(([lng, lat], i) => {
  const { x, y } = project({ lat, lng });
  return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ") + " Z";

/** Cities Bagdrop serves or is likely to — extend freely. */
export const CITY_GEO: Record<string, LatLng> = {
  Vadodara: { lat: 22.31, lng: 73.18 }, Ahmedabad: { lat: 23.02, lng: 72.57 }, Surat: { lat: 21.17, lng: 72.83 },
  Rajkot: { lat: 22.30, lng: 70.80 }, Nadiad: { lat: 22.69, lng: 72.86 }, Anand: { lat: 22.56, lng: 72.95 },
  Gandhinagar: { lat: 23.22, lng: 72.65 }, Bhavnagar: { lat: 21.76, lng: 72.15 }, Bharuch: { lat: 21.70, lng: 72.98 },
  Mumbai: { lat: 19.08, lng: 72.88 }, "Navi Mumbai": { lat: 19.03, lng: 73.03 }, Thane: { lat: 19.22, lng: 72.98 },
  Pune: { lat: 18.52, lng: 73.86 }, Nashik: { lat: 20.00, lng: 73.79 }, Nagpur: { lat: 21.15, lng: 79.09 },
  Goa: { lat: 15.50, lng: 73.83 }, "North Goa": { lat: 15.60, lng: 73.80 }, "South Goa": { lat: 15.27, lng: 74.05 },
  Delhi: { lat: 28.61, lng: 77.21 }, "Delhi NCR": { lat: 28.61, lng: 77.21 }, Gurgaon: { lat: 28.46, lng: 77.03 },
  Gurugram: { lat: 28.46, lng: 77.03 }, Noida: { lat: 28.54, lng: 77.39 }, Chandigarh: { lat: 30.73, lng: 76.78 },
  Jaipur: { lat: 26.91, lng: 75.79 }, Udaipur: { lat: 24.59, lng: 73.71 }, Jodhpur: { lat: 26.24, lng: 73.02 },
  Indore: { lat: 22.72, lng: 75.86 }, Bhopal: { lat: 23.26, lng: 77.41 }, Lucknow: { lat: 26.85, lng: 80.95 },
  Agra: { lat: 27.18, lng: 78.01 }, Varanasi: { lat: 25.32, lng: 82.97 }, Amritsar: { lat: 31.63, lng: 74.87 },
  Dehradun: { lat: 30.32, lng: 78.03 }, Kolkata: { lat: 22.57, lng: 88.36 }, Bhubaneswar: { lat: 20.30, lng: 85.82 },
  Guwahati: { lat: 26.14, lng: 91.74 }, Patna: { lat: 25.59, lng: 85.14 }, Bengaluru: { lat: 12.97, lng: 77.59 },
  Bangalore: { lat: 12.97, lng: 77.59 }, Mysuru: { lat: 12.30, lng: 76.64 }, Chennai: { lat: 13.08, lng: 80.27 },
  Hyderabad: { lat: 17.39, lng: 78.49 }, Kochi: { lat: 9.93, lng: 76.27 }, Thiruvananthapuram: { lat: 8.52, lng: 76.94 },
  Coimbatore: { lat: 11.02, lng: 76.96 }, Visakhapatnam: { lat: 17.69, lng: 83.22 }, Srinagar: { lat: 34.08, lng: 74.80 },
};

/** Exact name first, then a loose match ("Mumbai Airport T2" → Mumbai). */
export function cityGeo(name: string): LatLng | null {
  if (!name) return null;
  if (CITY_GEO[name]) return CITY_GEO[name];
  const n = name.toLowerCase();
  const hit = Object.keys(CITY_GEO).sort((a, b) => b.length - a.length).find((k) => n.includes(k.toLowerCase()));
  return hit ? CITY_GEO[hit] : null;
}

export const inBox = (p: LatLng) => p.lat >= BOX.s && p.lat <= BOX.n && p.lng >= BOX.w && p.lng <= BOX.e;
