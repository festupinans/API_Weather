import { vi } from 'vitest';
import type { CurrentForecast, GeocodingResult, WeatherProvider } from '../src/clients/openMeteoClient';
import { createLogger, type Logger } from '../src/logger';

/** Logger que no imprime nada pero guarda cada línea para poder inspeccionarla. */
export function createTestLogger(): { logger: Logger; lines: Record<string, unknown>[] } {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger({ level: 'debug', write: (line) => lines.push(JSON.parse(line)) });
  return { logger, lines };
}

export const bogotaLocation: GeocodingResult = {
  name: 'Bogotá',
  country: 'Colombia',
  latitude: 4.60971,
  longitude: -74.08175,
  timezone: 'America/Bogota',
};

export const bogotaForecast: CurrentForecast = {
  time: '2026-10-27T09:00',
  temperature_2m: 14.2,
  relative_humidity_2m: 78,
  wind_speed_10m: 6.5,
  weather_code: 2,
  units: { temperature_2m: '°C', relative_humidity_2m: '%', wind_speed_10m: 'km/h' },
};

/** Proveedor falso: por defecto responde Bogotá; cada test puede sobrescribir un método. */
export function createFakeProvider(overrides: Partial<WeatherProvider> = {}) {
  return {
    searchCity: vi.fn<WeatherProvider['searchCity']>().mockResolvedValue(bogotaLocation),
    getCurrentForecast: vi.fn<WeatherProvider['getCurrentForecast']>().mockResolvedValue(bogotaForecast),
    ...overrides,
  };
}

/** Crea una Response JSON como la que devolvería fetch. */
export function jsonFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
