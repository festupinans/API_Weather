import type { AppConfig } from '../config';
import { upstreamError } from '../errors';
import type { Logger } from '../logger';

/** Primer resultado del servicio de geocoding (solo los campos que usamos). */
export interface GeocodingResult {
  name: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

/** Bloque `current` del forecast junto con sus unidades (`current_units`). */
export interface CurrentForecast {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  wind_speed_10m: number;
  weather_code: number;
  units: {
    temperature_2m: string;
    relative_humidity_2m: string;
    wind_speed_10m: string;
  };
}

/** Contrato que necesita la capa de negocio; permite reemplazar Open-Meteo en tests. */
export interface WeatherProvider {
  /** Devuelve `null` si la ciudad no existe. */
  searchCity(name: string): Promise<GeocodingResult | null>;
  getCurrentForecast(latitude: number, longitude: number): Promise<CurrentForecast>;
}

type FetchFn = typeof fetch;
type ClientConfig = Pick<AppConfig, 'geocodingBaseUrl' | 'forecastBaseUrl' | 'upstreamTimeoutMs'>;

const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code';

export class OpenMeteoClient implements WeatherProvider {
  constructor(
    private readonly config: ClientConfig,
    private readonly logger: Logger,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async searchCity(name: string): Promise<GeocodingResult | null> {
    const url = new URL(`${this.config.geocodingBaseUrl}/search`);
    url.search = new URLSearchParams({ name, count: '1', language: 'es', format: 'json' }).toString();

    const data = await this.getJson(url, 'geocoding');
    return parseGeocoding(data);
  }

  async getCurrentForecast(latitude: number, longitude: number): Promise<CurrentForecast> {
    const url = new URL(`${this.config.forecastBaseUrl}/forecast`);
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: CURRENT_FIELDS,
      timezone: 'auto',
    }).toString();

    const data = await this.getJson(url, 'forecast');
    return parseForecast(data);
  }

  /**
   * GET con timeout. Cualquier fallo (red, timeout, status no-2xx, JSON inválido)
   * se convierte en UPSTREAM_ERROR; el detalle queda en los logs.
   */
  private async getJson(url: URL, service: string): Promise<unknown> {
    const startedAt = Date.now();
    const log = this.logger.child({ upstream: service, url: url.toString() });

    try {
      // El timeout cubre toda la operación: conexión, headers y lectura del body.
      const signal = AbortSignal.timeout(this.config.upstreamTimeoutMs);
      const response = await this.fetchFn(url, { signal, headers: { accept: 'application/json' } });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }

      const data: unknown = await response.json();
      log.info('Respuesta de Open-Meteo recibida', { durationMs: Date.now() - startedAt });
      return data;
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      log.warn(timedOut ? 'Timeout consultando Open-Meteo' : 'Error consultando Open-Meteo', {
        durationMs: Date.now() - startedAt,
        timeoutMs: this.config.upstreamTimeoutMs,
        error,
      });
      throw upstreamError(error);
    }
  }
}

// --- Validación de respuestas -------------------------------------------------
// Open-Meteo es externo: no confiamos ciegamente en la forma del JSON.
// Si no trae lo que esperamos, lo tratamos como falla del proveedor (502).

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === 'string';

function unexpectedShape(service: string): never {
  throw upstreamError(new Error(`Respuesta de ${service} con formato inesperado`));
}

export function parseGeocoding(data: unknown): GeocodingResult | null {
  if (!isObject(data)) return unexpectedShape('geocoding');

  // Si la ciudad no existe, Open-Meteo omite `results`.
  if (data.results === undefined) return null;
  if (!Array.isArray(data.results)) return unexpectedShape('geocoding');

  const first: unknown = data.results[0];
  if (first === undefined) return null;
  if (
    !isObject(first) ||
    !isString(first.name) ||
    !isNumber(first.latitude) ||
    !isNumber(first.longitude) ||
    !isString(first.timezone)
  ) {
    return unexpectedShape('geocoding');
  }

  return {
    name: first.name,
    country: isString(first.country) ? first.country : undefined,
    latitude: first.latitude,
    longitude: first.longitude,
    timezone: first.timezone,
  };
}

export function parseForecast(data: unknown): CurrentForecast {
  if (!isObject(data) || !isObject(data.current) || !isObject(data.current_units)) {
    return unexpectedShape('forecast');
  }

  const { current, current_units: units } = data;
  if (
    !isString(current.time) ||
    !isNumber(current.temperature_2m) ||
    !isNumber(current.relative_humidity_2m) ||
    !isNumber(current.wind_speed_10m) ||
    !isNumber(current.weather_code) ||
    !isString(units.temperature_2m) ||
    !isString(units.relative_humidity_2m) ||
    !isString(units.wind_speed_10m)
  ) {
    return unexpectedShape('forecast');
  }

  return {
    time: current.time,
    temperature_2m: current.temperature_2m,
    relative_humidity_2m: current.relative_humidity_2m,
    wind_speed_10m: current.wind_speed_10m,
    weather_code: current.weather_code,
    units: {
      temperature_2m: units.temperature_2m,
      relative_humidity_2m: units.relative_humidity_2m,
      wind_speed_10m: units.wind_speed_10m,
    },
  };
}
