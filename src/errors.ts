export type ErrorCode = 'INVALID_REQUEST' | 'CITY_NOT_FOUND' | 'UPSTREAM_ERROR' | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  CITY_NOT_FOUND: 404,
  UPSTREAM_ERROR: 502,
  INTERNAL_ERROR: 500,
};

/** Formato único de error que ve el cliente. */
export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
  };
}

/**
 * Error de la aplicación: lleva el código del contrato y su status HTTP.
 * `message` es seguro para mostrar al cliente; el detalle técnico va en `cause`, solo para logs.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = STATUS_BY_CODE[code];
  }
}

export const invalidRequest = (message: string): AppError => new AppError('INVALID_REQUEST', message);

export const cityNotFound = (city: string): AppError =>
  new AppError('CITY_NOT_FOUND', `No se encontró la ciudad '${city}'`);

export const upstreamError = (cause?: unknown): AppError =>
  new AppError('UPSTREAM_ERROR', 'El proveedor del clima no está disponible, intenta más tarde', { cause });

const INTERNAL_MESSAGE = 'Ocurrió un error interno';

/** Convierte cualquier cosa lanzada en un AppError. Lo desconocido se vuelve INTERNAL_ERROR genérico. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  return new AppError('INTERNAL_ERROR', INTERNAL_MESSAGE, { cause: error });
}

export function toErrorBody(error: AppError): ErrorBody {
  return { error: { code: error.code, message: error.message } };
}
