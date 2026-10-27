import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WeatherProvider } from '../../src/clients/openMeteoClient';
import { loadConfig } from '../../src/config';
import { upstreamError } from '../../src/errors';
import { createHandler } from '../../src/handlers/weather';
import { createFakeProvider } from '../helpers';

function buildEvent(query: Record<string, string> | null): APIGatewayProxyEvent {
  return { httpMethod: 'GET', path: '/weather', queryStringParameters: query } as APIGatewayProxyEvent;
}

const context = { awsRequestId: 'req-123' } as Context;

function buildHandler(provider: WeatherProvider = createFakeProvider()) {
  return createHandler({ getConfig: () => loadConfig({}), createProvider: () => provider });
}

let logLines: Record<string, unknown>[];

beforeEach(() => {
  // Capturamos lo que el handler escribe en stdout (los logs) para no ensuciar la salida y poder inspeccionarlo.
  logLines = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    logLines.push(JSON.parse(String(chunk)));
    return true;
  });
});

describe('GET /weather handler', () => {
  it('responde 200 con el contrato y cabeceras JSON', async () => {
    const response = await buildHandler()(buildEvent({ city: 'Bogota' }), context);

    expect(response.statusCode).toBe(200);
    expect(response.headers).toMatchObject({
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': 'req-123',
    });
    expect(JSON.parse(response.body)).toMatchObject({
      city: 'Bogotá',
      country: 'Colombia',
      current: { condition: 'Parcialmente nublado', temperature: { value: 14.2, unit: '°C' } },
    });
  });

  it.each([
    ['sin query string', null],
    ['sin city', { other: 'x' }],
    ['city vacío', { city: '' }],
    ['city de 1 carácter', { city: 'B' }],
  ])('responde 400 INVALID_REQUEST %s', async (_case, query) => {
    const response = await buildHandler()(buildEvent(query), context);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'INVALID_REQUEST', message: expect.any(String) },
    });
  });

  it('responde 404 CITY_NOT_FOUND con el mensaje del contrato', async () => {
    const provider = createFakeProvider({ searchCity: async () => null });
    const response = await buildHandler(provider)(buildEvent({ city: 'Ciudadinventada' }), context);

    expect(response.statusCode).toBe(404);
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'CITY_NOT_FOUND', message: "No se encontró la ciudad 'Ciudadinventada'" },
    });
  });

  it('responde 502 UPSTREAM_ERROR si Open-Meteo falla', async () => {
    const provider = createFakeProvider({
      searchCity: async () => {
        throw upstreamError(new Error('timeout'));
      },
    });
    const response = await buildHandler(provider)(buildEvent({ city: 'Bogota' }), context);

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body).error.code).toBe('UPSTREAM_ERROR');
  });

  it('responde 500 INTERNAL_ERROR sin exponer detalles internos', async () => {
    const provider = createFakeProvider({
      searchCity: async () => {
        throw new TypeError("Cannot read properties of undefined (reading 'latitude')");
      },
    });
    const response = await buildHandler(provider)(buildEvent({ city: 'Bogota' }), context);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body)).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno' },
    });
    expect(response.body).not.toMatch(/TypeError|latitude|stack|at /);

    // ...pero el detalle sí queda en los logs.
    expect(logLines).toContainEqual(
      expect.objectContaining({
        level: 'error',
        requestId: 'req-123',
        error: expect.objectContaining({ name: 'TypeError', stack: expect.any(String) }),
      }),
    );
  });

  it('responde 500 con el formato del contrato si la configuración es inválida', async () => {
    const handler = createHandler({
      getConfig: () => loadConfig({ UPSTREAM_TIMEOUT_MS: 'abc' }),
      createProvider: () => createFakeProvider(),
    });
    const response = await handler(buildEvent({ city: 'Bogota' }), context);

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.code).toBe('INTERNAL_ERROR');
  });

  it('escribe logs JSON con level, message y requestId', async () => {
    await buildHandler()(buildEvent({ city: 'Bogota' }), context);

    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) {
      expect(line).toMatchObject({ level: expect.any(String), message: expect.any(String), requestId: 'req-123' });
    }
  });
});
