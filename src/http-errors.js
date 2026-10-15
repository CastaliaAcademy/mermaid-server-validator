// Fixed public messages: never serialize a runtime exception.
const definitions = {
  INVALID_JSON: [400, 'Body must be valid UTF-8 JSON.'],
  INVALID_INPUT: [400, 'Expected exactly one nonempty string property: source.'],
  NOT_FOUND: [404, 'Route not found.'],
  METHOD_NOT_ALLOWED: [405, 'Only POST is supported.'],
  PAYLOAD_TOO_LARGE: [413, 'Request exceeds the validation size limit.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Use application/json and identity content encoding.'],
  INTERNAL_ERROR: [500, 'Validation service failed.'],
  BUSY: [503, 'Validation capacity is exhausted.'],
  VALIDATION_TIMEOUT: [504, 'Validation deadline exceeded.'],
};
export class ServiceError extends Error {
  constructor(code) {
    super(definitions[code][1]);
    this.code = code;
    this.status = definitions[code][0];
  }
}
export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store', ...extraHeaders,
  }});
}
export function errorResponse(error) {
  const safe = error instanceof ServiceError ? error : new ServiceError('INTERNAL_ERROR');
  return jsonResponse({error: {code: safe.code, message: safe.message}}, safe.status,
    safe.status === 405 ? {Allow: 'POST'} : {});
}
