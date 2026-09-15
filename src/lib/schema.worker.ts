import { exporter } from '@dbml/core';
import { importSql } from './importSql';
import { parseDbml } from './parseDbml';
import type {
  SchemaWorkerRequest,
  SchemaWorkerResponse,
} from './schemaWorkerProtocol';

const scope = globalThis as unknown as {
  addEventListener: (type: 'message', listener: (event: MessageEvent<SchemaWorkerRequest>) => void) => void;
  postMessage: (message: SchemaWorkerResponse) => void;
};

const errorPayload = (error: unknown): { message: string; name?: string; stack?: string } => {
  if (error instanceof Error) return { message: error.message, name: error.name, stack: error.stack };
  if (typeof error === 'string') return { message: error };
  return { message: 'The schema operation failed.' };
};

scope.addEventListener('message', (event) => {
  const request = event.data;
  try {
    let response: SchemaWorkerResponse;
    switch (request.type) {
      case 'parse':
        response = { id: request.id, type: 'parse', result: parseDbml(request.source) };
        break;
      case 'import':
        response = {
          id: request.id,
          type: 'import',
          result: importSql(request.sql, request.dialect),
        };
        break;
      case 'export':
        response = {
          id: request.id,
          type: 'export',
          result: exporter.export(request.source, request.format),
        };
        break;
      default:
        throw new Error('The schema worker received an unknown operation.');
    }
    scope.postMessage(response);
  } catch (error) {
    scope.postMessage({ id: request.id, type: 'error', error: errorPayload(error) });
  }
});
