import type { LogLevel } from './logger';

export interface AppConfig {
  geocodingBaseUrl: string;
  forecastBaseUrl: string;
  upstreamTimeoutMs: number;
  logLevel: LogLevel;
}

const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];

/**
 * Lee la configuración desde variables de entorno.
 * Recibe `env` como parámetro para poder probarla sin tocar process.env.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    geocodingBaseUrl: readUrl(env, 'GEOCODING_BASE_URL', 'https://geocoding-api.open-meteo.com/v1'),
    forecastBaseUrl: readUrl(env, 'FORECAST_BASE_URL', 'https://api.open-meteo.com/v1'),
    upstreamTimeoutMs: readPositiveInt(env, 'UPSTREAM_TIMEOUT_MS', 5000),
    logLevel: readLogLevel(env, 'LOG_LEVEL', 'info'),
  };
}

function readUrl(env: NodeJS.ProcessEnv, name: string, fallback: string): string {
  const value = env[name]?.trim() || fallback;
  try {
    new URL(value);
  } catch {
    throw new Error(`Variable de entorno ${name} no es una URL válida: '${value}'`);
  }
  // Sin "/" final para poder concatenar rutas de forma predecible.
  return value.replace(/\/+$/, '');
}

function readPositiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Variable de entorno ${name} debe ser un entero positivo: '${raw}'`);
  }
  return value;
}

function readLogLevel(env: NodeJS.ProcessEnv, name: string, fallback: LogLevel): LogLevel {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (!LOG_LEVELS.includes(raw as LogLevel)) {
    throw new Error(`Variable de entorno ${name} debe ser uno de ${LOG_LEVELS.join(', ')}: '${raw}'`);
  }
  return raw as LogLevel;
}
