import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('usa valores por defecto cuando no hay variables de entorno', () => {
    expect(loadConfig({})).toEqual({
      geocodingBaseUrl: 'https://geocoding-api.open-meteo.com/v1',
      forecastBaseUrl: 'https://api.open-meteo.com/v1',
      upstreamTimeoutMs: 5000,
      logLevel: 'info',
    });
  });

  it('lee las variables de entorno y quita la "/" final de las URLs', () => {
    const config = loadConfig({
      GEOCODING_BASE_URL: 'http://localhost:4000/geo/',
      FORECAST_BASE_URL: 'http://localhost:4000/forecast',
      UPSTREAM_TIMEOUT_MS: '1500',
      LOG_LEVEL: 'DEBUG',
    });

    expect(config).toEqual({
      geocodingBaseUrl: 'http://localhost:4000/geo',
      forecastBaseUrl: 'http://localhost:4000/forecast',
      upstreamTimeoutMs: 1500,
      logLevel: 'debug',
    });
  });

  it.each([
    [{ UPSTREAM_TIMEOUT_MS: 'cinco' }, /UPSTREAM_TIMEOUT_MS/],
    [{ UPSTREAM_TIMEOUT_MS: '-10' }, /UPSTREAM_TIMEOUT_MS/],
    [{ GEOCODING_BASE_URL: 'no-es-url' }, /GEOCODING_BASE_URL/],
    [{ LOG_LEVEL: 'verbose' }, /LOG_LEVEL/],
  ])('rechaza configuración inválida %o', (env, expectedError) => {
    expect(() => loadConfig(env)).toThrow(expectedError);
  });
});
