// Respuestas reales de Open-Meteo (recortadas) usadas como datos de prueba.

export const geocodingBogota = {
  results: [
    {
      id: 3688689,
      name: 'Bogotá',
      latitude: 4.60971,
      longitude: -74.08175,
      elevation: 2582.0,
      country_code: 'CO',
      timezone: 'America/Bogota',
      country: 'Colombia',
      admin1: 'Bogotá D.C.',
    },
  ],
  generationtime_ms: 0.268,
};

/** Cuando la ciudad no existe, Open-Meteo omite `results`. */
export const geocodingNotFound = { generationtime_ms: 0.068 };

export const forecastBogota = {
  latitude: 4.6045694,
  longitude: -74.05252,
  timezone: 'America/Bogota',
  current_units: {
    time: 'iso8601',
    interval: 'seconds',
    temperature_2m: '°C',
    relative_humidity_2m: '%',
    wind_speed_10m: 'km/h',
    weather_code: 'wmo code',
  },
  current: {
    time: '2026-10-27T09:00',
    interval: 900,
    temperature_2m: 14.2,
    relative_humidity_2m: 78,
    wind_speed_10m: 6.5,
    weather_code: 2,
  },
};
