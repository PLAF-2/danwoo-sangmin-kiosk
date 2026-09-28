import type { IncomingMessage, ServerResponse } from 'node:http';
import type { z } from 'zod';

export type ApiRequest = Pick<IncomingMessage, 'method' | 'headers'> & { body?: unknown };
export type ApiResponse = Pick<ServerResponse, 'statusCode' | 'setHeader' | 'end'>;

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export function parseBody<T>(request: ApiRequest, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) throw new HttpError(400, 'Invalid request body');
  return parsed.data;
}

export function endpoint(method: string, handle: (request: ApiRequest, response: ApiResponse) => Promise<unknown>) {
  return async (request: ApiRequest, response: ApiResponse): Promise<void> => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (request.method !== method) {
        response.setHeader('Allow', method);
        throw new HttpError(405, 'Method not allowed');
      }
      const result = await handle(request, response);
      response.statusCode = 200;
      response.end(JSON.stringify(result ?? { ok: true }));
    } catch (error) {
      response.statusCode = error instanceof HttpError ? error.status : 500;
      response.end(JSON.stringify({ error: error instanceof HttpError ? error.message : 'Internal server error' }));
    }
  };
}
