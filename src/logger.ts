export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

export interface Logger {
  debug(message: string, data?: LogContext): void;
  info(message: string, data?: LogContext): void;
  warn(message: string, data?: LogContext): void;
  error(message: string, data?: LogContext): void;
  /** Devuelve un logger que agrega `context` (p. ej. requestId) a cada línea. */
  child(context: LogContext): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface LoggerOptions {
  level?: LogLevel;
  context?: LogContext;
  /** Destino de cada línea; se puede reemplazar en tests. */
  write?: (line: string) => void;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const minLevel = options.level ?? 'info';
  const context = options.context ?? {};
  const write = options.write ?? ((line: string) => process.stdout.write(line + '\n'));

  const log = (level: LogLevel, message: string, data: LogContext = {}): void => {
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minLevel]) return;
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
      ...serialize(data),
    };
    write(JSON.stringify(entry));
  };

  return {
    debug: (message, data) => log('debug', message, data),
    info: (message, data) => log('info', message, data),
    warn: (message, data) => log('warn', message, data),
    error: (message, data) => log('error', message, data),
    child: (extra) => createLogger({ level: minLevel, context: { ...context, ...extra }, write }),
  };
}

/** Los Error no se serializan con JSON.stringify ({}), así que los convertimos a mano. */
function serialize(data: LogContext): LogContext {
  const result: LogContext = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] =
      value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value;
  }
  return result;
}
