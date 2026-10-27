import type { APIGatewayProxyResult } from 'aws-lambda';
import { type AppError, toErrorBody } from '../errors';

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' };

export function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: { ...JSON_HEADERS, ...headers },
    body: JSON.stringify(body),
  };
}

export function errorResponse(error: AppError, headers: Record<string, string> = {}): APIGatewayProxyResult {
  return jsonResponse(error.statusCode, toErrorBody(error), headers);
}
