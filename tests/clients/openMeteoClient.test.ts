import { describe, expect, it, vi } from 'vitest';
import { OpenMeteoClient } from '../../src/clients/openMeteoClient';
import { forecastBogota, geocodingBogota, geocodingNotFound } from '../fixtures/openMeteo';
import { createTestLogger, jsonFetchResponse } from '../helpers';

const config = {
  geocodingBaseUrl: 'https://geo.test/v1',
  forecastBaseUrl: 'https://forecast.test/v1',
  upstreamTimeoutMs: 50,
};

function setup(fetchImpl: (url: URL, init?: RequestInit) => Promise<Response>) {
  const fetchFn = vi.fn(fetchImpl);
  const { logger, lines } = createTestLogger();
  const client = new OpenMeteoClient(config, logger, fetchFn as unknown as typeof fetch);
  return { client, fetchFn, lines };
}

/** fetch que nunca responde y solo termina cuando se aborta (simula a Open-Meteo colgado). */
function hangingFetch(_url: URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
  });
}

describe('OpenMeteoClient.searchCity', () => {
  it('arma la URL de geocoding codificando la ciudad', async () => {
    const { client, fetchFn } = setup(async () => jsonFetchResponse(geocodingBogota));

    await client.searchCity('São Paulo & Co');

    const url = fetchFn.mock.calls[0]![0];
    expect(url.origin + url.pathname).toBe('https://geo.test/v1/search');
    expect(url.searchParams.get('name')).toBe('São Paulo & Co');
    expect(url.searchParams.get('count')).toBe('1');
    expect(url.searchParams.get('language')).toBe('es');
  });

  it('devuelve solo los campos necesarios del primer resultado', async () => {
    const { client } = setup(async () => jsonFetchResponse(geocodingBogota));

    await expect(client.searchCity('Bogota')).resolves.toEqual({
      name: 'Bogotá',
      country: 'Colombia',
      latitude: 4.60971,
      longitude: -74.08175,
      timezone: 'America/Bogota',
    });
  });

  it('devuelve null cuando la respuesta no trae `results`', async () => {
    const { client } = setup(async () => jsonFetchResponse(geocodingNotFound));
    await expect(client.searchCity('Ciudadinventada')).resolves.toBeNull();
  });

  it('devuelve null cuando `results` viene vacío', async () => {
    const { client } = setup(async () => jsonFetchResponse({ results: [] }));
    await expect(client.searchCity('Ciudadinventada')).resolves.toBeNull();
  });
});

describe('OpenMeteoClient.getCurrentForecast', () => {
  it('pide los campos actuales con timezone=auto y devuelve valores + unidades', async () => {
    const { client, fetchFn } = setup(async () => jsonFetchResponse(forecastBogota));

    const forecast = await client.getCurrentForecast(4.60971, -74.08175);

    const url = fetchFn.mock.calls[0]![0];
    expect(url.pathname).toBe('/v1/forecast');
    expect(url.searchParams.get('latitude')).toBe('4.60971');
    expect(url.searchParams.get('longitude')).toBe('-74.08175');
    expect(url.searchParams.get('current')).toBe('temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code');
    expect(url.searchParams.get('timezone')).toBe('auto');
    expect(forecast).toEqual({
      time: '2026-10-27T09:00',
      temperature_2m: 14.2,
      relative_humidity_2m: 78,
      wind_speed_10m: 6.5,
      weather_code: 2,
      units: { temperature_2m: '°C', relative_humidity_2m: '%', wind_speed_10m: 'km/h' },
    });
  });
});

describe('OpenMeteoClient: errores del proveedor → UPSTREAM_ERROR', () => {
  const upstream = { code: 'UPSTREAM_ERROR', statusCode: 502 };

  it('cuando Open-Meteo responde con status de error', async () => {
    const { client } = setup(async () => jsonFetchResponse({ error: true, reason: 'boom' }, 500));
    await expect(client.searchCity('Bogota')).rejects.toMatchObject(upstream);
  });

  it('cuando hay un error de red', async () => {
    const { client } = setup(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(client.searchCity('Bogota')).rejects.toMatchObject(upstream);
  });

  it('cuando la respuesta no es JSON válido', async () => {
    const { client } = setup(async () => new Response('<html>Bad Gateway</html>', { status: 200 }));
    await expect(client.searchCity('Bogota')).rejects.toMatchObject(upstream);
  });

  it('cuando el forecast no trae los campos esperados', async () => {
    const broken = { ...forecastBogota, current: { ...forecastBogota.current, temperature_2m: null } };
    const { client } = setup(async () => jsonFetchResponse(broken));
    await expect(client.getCurrentForecast(4.6, -74)).rejects.toMatchObject(upstream);
  });

  it('cuando el geocoding trae un resultado con formato inesperado', async () => {
    const { client } = setup(async () => jsonFetchResponse({ results: [{ name: 'Bogotá' }] }));
    await expect(client.searchCity('Bogota')).rejects.toMatchObject(upstream);
  });

  it('cuando Open-Meteo tarda más que el timeout configurado', async () => {
    const { client, lines } = setup(hangingFetch);

    const error = await client.searchCity('Bogota').catch((e: unknown) => e);

    expect(error).toMatchObject(upstream);
    expect((error as Error).cause).toMatchObject({ name: 'TimeoutError' });
    expect(lines).toContainEqual(
      expect.objectContaining({ level: 'warn', message: 'Timeout consultando Open-Meteo', timeoutMs: 50 }),
    );
  });
});
