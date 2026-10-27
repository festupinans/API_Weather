import type { CurrentForecast, GeocodingResult, WeatherProvider } from '../clients/openMeteoClient';
import { describeWeatherCode } from '../domain/weatherCondition';
import { cityNotFound, invalidRequest } from '../errors';
import type { Logger } from '../logger';

// --- Contrato público de la API ----------------------------------------------

export interface Measurement {
  value: number;
  unit: string;
}

export interface WeatherResponse {
  city: string;
  country: string | null;
  coordinates: { latitude: number; longitude: number };
  timezone: string;
  current: {
    temperature: Measurement;
    humidity: Measurement;
    windSpeed: Measurement;
    condition: string;
    observedAt: string;
  };
}

// --- Reglas de negocio --------------------------------------------------------

export const CITY_MIN_LENGTH = 2;
export const CITY_MAX_LENGTH = 100;

/** Valida el parámetro `city` y lo devuelve sin espacios sobrantes. */
export function validateCity(raw: string | undefined): string {
  const city = raw?.trim() ?? '';
  if (city.length === 0) {
    throw invalidRequest("El parámetro 'city' es obligatorio");
  }
  if (city.length < CITY_MIN_LENGTH) {
    throw invalidRequest(`El parámetro 'city' debe tener al menos ${CITY_MIN_LENGTH} caracteres`);
  }
  if (city.length > CITY_MAX_LENGTH) {
    throw invalidRequest(`El parámetro 'city' no puede superar ${CITY_MAX_LENGTH} caracteres`);
  }
  return city;
}

/** Combina geocoding + forecast en el contrato propio. Función pura: fácil de testear. */
export function toWeatherResponse(location: GeocodingResult, forecast: CurrentForecast): WeatherResponse {
  return {
    city: location.name,
    country: location.country ?? null,
    // Usamos las coordenadas del geocoding: el forecast las ajusta a su cuadrícula.
    coordinates: { latitude: location.latitude, longitude: location.longitude },
    timezone: location.timezone,
    current: {
      temperature: { value: forecast.temperature_2m, unit: forecast.units.temperature_2m },
      humidity: { value: forecast.relative_humidity_2m, unit: forecast.units.relative_humidity_2m },
      windSpeed: { value: forecast.wind_speed_10m, unit: forecast.units.wind_speed_10m },
      condition: describeWeatherCode(forecast.weather_code),
      observedAt: forecast.time,
    },
  };
}

// --- Caso de uso --------------------------------------------------------------

export class WeatherService {
  constructor(
    private readonly provider: WeatherProvider,
    private readonly logger: Logger,
  ) {}

  async getCurrentWeather(rawCity: string | undefined): Promise<WeatherResponse> {
    const city = validateCity(rawCity);

    const location = await this.provider.searchCity(city);
    if (!location) {
      this.logger.info('Ciudad no encontrada', { city });
      throw cityNotFound(city);
    }

    const forecast = await this.provider.getCurrentForecast(location.latitude, location.longitude);
    const response = toWeatherResponse(location, forecast);

    this.logger.info('Clima obtenido', { city: response.city, country: response.country });
    return response;
  }
}
