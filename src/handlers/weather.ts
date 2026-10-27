import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { OpenMeteoClient, type WeatherProvider } from '../clients/openMeteoClient';
import { loadConfig, type AppConfig } from '../config';
import { toAppError } from '../errors';
import { errorResponse, jsonResponse } from '../http/response';
import { createLogger, type Logger } from '../logger';
import { WeatherService } from '../services/weatherService';

/** Dependencias del handler; en tests se reemplazan para no llamar a Open-Meteo. */
export interface HandlerDeps {
  getConfig: () => AppConfig;
  createProvider: (config: AppConfig, logger: Logger) => WeatherProvider;
}

// La config se lee una sola vez por contenedor y se reutiliza en invocaciones "calientes".
let cachedConfig: AppConfig | undefined;

const defaultDeps: HandlerDeps = {
  getConfig: () => (cachedConfig ??= loadConfig()),
  createProvider: (config, logger) => new OpenMeteoClient(config, logger),
};

export function createHandler(deps: HandlerDeps = defaultDeps) {
  return async (event: APIGatewayProxyEvent, context: Context): Promise<APIGatewayProxyResult> => {
    const startedAt = Date.now();
    const requestId = context.awsRequestId;
    const headers = { 'x-request-id': requestId };
    let logger = createLogger({ context: { requestId } });

    try {
      const config = deps.getConfig();
      logger = createLogger({ level: config.logLevel, context: { requestId } });

      const city = event.queryStringParameters?.city;
      logger.info('Petición recibida', { method: event.httpMethod, path: event.path, city });

      const service = new WeatherService(deps.createProvider(config, logger), logger);
      const weather = await service.getCurrentWeather(city);

      logger.info('Petición completada', { statusCode: 200, durationMs: Date.now() - startedAt });
      return jsonResponse(200, weather, headers);
    } catch (error) {
      const appError = toAppError(error);
      const logData = {
        statusCode: appError.statusCode,
        code: appError.code,
        durationMs: Date.now() - startedAt,
      };

      if (appError.statusCode >= 500) {
        // El detalle técnico (incluido el stack) solo va a los logs, nunca al cliente.
        logger.error('Petición fallida', { ...logData, error: appError.cause ?? appError });
      } else {
        logger.warn('Petición rechazada', { ...logData, reason: appError.message });
      }
      return errorResponse(appError, headers);
    }
  };
}

export const handler = createHandler();
