import { describe, expect, it } from 'vitest';
import { AppError, upstreamError } from '../../src/errors';
import { toWeatherResponse, validateCity, WeatherService } from '../../src/services/weatherService';
import { bogotaForecast, bogotaLocation, createFakeProvider, createTestLogger } from '../helpers';

describe('validateCity', () => {
  it('devuelve la ciudad sin espacios sobrantes', () => {
    expect(validateCity('  Bogota  ')).toBe('Bogota');
  });

  it.each([
    ['ausente', undefined, 'obligatorio'],
    ['vacía', '', 'obligatorio'],
    ['solo espacios', '   ', 'obligatorio'],
    ['de 1 carácter', 'B', 'al menos 2'],
    ['demasiado larga', 'x'.repeat(101), 'no puede superar'],
  ])('rechaza una ciudad %s con INVALID_REQUEST', (_case, value, message) => {
    expect(() => validateCity(value)).toThrow(
      expect.objectContaining({ code: 'INVALID_REQUEST', statusCode: 400, message: expect.stringContaining(message) }),
    );
  });
});

describe('toWeatherResponse', () => {
  it('transforma geocoding + forecast al contrato de la API', () => {
    expect(toWeatherResponse(bogotaLocation, bogotaForecast)).toEqual({
      city: 'Bogotá',
      country: 'Colombia',
      coordinates: { latitude: 4.60971, longitude: -74.08175 },
      timezone: 'America/Bogota',
      current: {
        temperature: { value: 14.2, unit: '°C' },
        humidity: { value: 78, unit: '%' },
        windSpeed: { value: 6.5, unit: 'km/h' },
        condition: 'Parcialmente nublado',
        observedAt: '2026-10-27T09:00',
      },
    });
  });

  it('devuelve country null si el geocoding no lo trae', () => {
    const { country: _omit, ...withoutCountry } = bogotaLocation;
    expect(toWeatherResponse(withoutCountry, bogotaForecast).country).toBeNull();
  });

  it('usa la condición por defecto para códigos desconocidos', () => {
    const response = toWeatherResponse(bogotaLocation, { ...bogotaForecast, weather_code: 12345 });
    expect(response.current.condition).toBe('Condición desconocida');
  });
});

describe('WeatherService.getCurrentWeather', () => {
  it('consulta geocoding con la ciudad limpia y forecast con sus coordenadas', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider, createTestLogger().logger);

    const result = await service.getCurrentWeather('  Bogota ');

    expect(provider.searchCity).toHaveBeenCalledWith('Bogota');
    expect(provider.getCurrentForecast).toHaveBeenCalledWith(4.60971, -74.08175);
    expect(result.city).toBe('Bogotá');
  });

  it('lanza CITY_NOT_FOUND si el geocoding no encuentra la ciudad', async () => {
    const provider = createFakeProvider({ searchCity: async () => null });
    const service = new WeatherService(provider, createTestLogger().logger);

    await expect(service.getCurrentWeather('Ciudadinventada')).rejects.toMatchObject({
      code: 'CITY_NOT_FOUND',
      statusCode: 404,
      message: "No se encontró la ciudad 'Ciudadinventada'",
    });
    expect(provider.getCurrentForecast).not.toHaveBeenCalled();
  });

  it('no llama a Open-Meteo si la ciudad es inválida', async () => {
    const provider = createFakeProvider();
    const service = new WeatherService(provider, createTestLogger().logger);

    await expect(service.getCurrentWeather('B')).rejects.toBeInstanceOf(AppError);
    expect(provider.searchCity).not.toHaveBeenCalled();
  });

  it('propaga UPSTREAM_ERROR del proveedor', async () => {
    const provider = createFakeProvider({
      getCurrentForecast: async () => {
        throw upstreamError(new Error('HTTP 503'));
      },
    });
    const service = new WeatherService(provider, createTestLogger().logger);

    await expect(service.getCurrentWeather('Bogota')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      statusCode: 502,
    });
  });
});
