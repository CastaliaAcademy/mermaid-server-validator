import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseDocument } from 'yaml';

// Run from any cwd; an optional filename supports validation of proposed edits.
const filename = process.argv[2] ?? fileURLToPath(new URL('../docs/openapi.yaml', import.meta.url));
const yaml = parseDocument(await readFile(filename, 'utf8'), {uniqueKeys: true});
assert.equal(yaml.errors.length, 0, yaml.errors.map(String).join('\n'));
const document = yaml.toJS();
assert.equal(document.openapi, '3.1.1');
let references = 0;
function walk(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit);
}
walk(document, (value) => {
  if (!('$ref' in value)) return;
  references++;
  assert.ok(value.$ref.startsWith('#/'), `Only local references allowed: ${value.$ref}`);
});
// Full OAS schema validation and dereferencing, with network/file resolution off.
const api = await SwaggerParser.validate(structuredClone(document), {
  resolve: {external: false}, dereference: {circular: false},
});
const methods = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);
const operations = Object.entries(api.paths).flatMap(([path, item]) =>
  Object.keys(item).filter((key) => methods.has(key)).map((method) => `${method.toUpperCase()} ${path}`));
assert.deepEqual(operations.sort(), ['POST /validate', 'POST /validate/detailed']);
assert.deepEqual(api.security, []);
assert.equal(api.components.securitySchemes, undefined);
assert.equal(api.paths['/validate'].post.operationId, 'validate');
assert.equal(api.paths['/validate/detailed'].post.operationId, 'validateDetailed');

// AJV validates actual examples and discriminated envelopes, beyond OAS syntax.
// x-* unit annotations/JS trim remain runtime rules, not JSON Schema validators.
const ajv = new Ajv2020({strict: false, allErrors: true});
let examples = 0;
function checkExample(schema, data, label) {
  const validate = ajv.compile(schema);
  assert.ok(validate(data), `${label}: ${JSON.stringify(validate.errors)}`);
  examples++;
}
walk(api, (value) => {
  if (!value.schema) return;
  if ('example' in value) checkExample(value.schema, value.example, 'example');
  for (const [name, example] of Object.entries(value.examples ?? {})) {
    checkExample(value.schema, example.value, name);
  }
});
for (const [name, schema] of Object.entries(api.components.schemas)) {
  for (const example of schema.examples ?? []) checkExample(schema, example, name);
  ajv.compile(schema); // Also compile components without examples.
}
const schemas = api.components.schemas;
let shapeCases = 0;
function cases(name, accepted, rejected) {
  const validate = ajv.compile(schemas[name]);
  for (const data of accepted) { assert.ok(validate(data), `${name} rejected ${JSON.stringify(data)}`); shapeCases++; }
  for (const data of rejected) { assert.ok(!validate(data), `${name} accepted ${JSON.stringify(data)}`); shapeCases++; }
}
cases('ValidationRequest', [{source: 'flowchart TD\n A --> B'}],
  [null, [], '', {}, {source: null}, {source: 1}, {source: ''}, {source: 'x', config: {}}]);
cases('BooleanValidationResult', [{valid: true}, {valid: false}],
  [true, {}, {valid: 'false'}, {valid: true, error: null}]);
cases('DetailedValidationResult', [
  {valid: true, error: null},
  {valid: false, error: {message: 'diagnostic', position: null}},
  {valid: false, error: {message: 'diagnostic', position: {line: 2, column: null}}},
], [
  {valid: true}, {valid: false, error: null}, {valid: true, error: {message: 'x', position: null}},
  {valid: false, error: {message: '', position: null}},
  {valid: false, error: {message: 'x'}}, {valid: true, error: null, source: 'x'},
]);
cases('SourcePosition', [null, {line: 2, column: 3}, {line: 2, column: null}],
  [{line: 0, column: null}, {line: 1}, {line: 1, column: 0}, {line: null, column: 1},
    {line: 1, column: 1, offset: 0}, {line: 1.5, column: null}]);
cases('ServiceError', [{error: {code: 'BUSY', message: 'Busy'}}],
  [{error: {code: 'UNKNOWN', message: 'x'}}, {error: {code: 'BUSY', message: ''}},
    {error: {code: 'BUSY', message: 'x', position: null}}, {error: {code: 'BUSY', message: 'x'}, valid: false}]);

const responseCodes = {
  BadRequest: ['400', ['INVALID_JSON', 'INVALID_INPUT']],
  NotFound: ['404', ['NOT_FOUND']], MethodNotAllowed: ['405', ['METHOD_NOT_ALLOWED']],
  PayloadTooLarge: ['413', ['PAYLOAD_TOO_LARGE']], UnsupportedMediaType: ['415', ['UNSUPPORTED_MEDIA_TYPE']],
  InternalError: ['500', ['INTERNAL_ERROR']], Busy: ['503', ['BUSY']],
  ValidationTimeout: ['504', ['VALIDATION_TIMEOUT']],
};
const allCodes = Object.values(responseCodes).flatMap(([, codes]) => codes).sort();
assert.deepEqual([...schemas.ServiceError.properties.error.properties.code.enum].sort(), allCodes);
for (const [name, [status, codes]] of Object.entries(responseCodes)) {
  const response = api.components.responses[name];
  assert.equal(response.headers['Cache-Control'].schema.const, 'no-store');
  const validate = ajv.compile(response.content['application/json'].schema);
  for (const code of allCodes) {
    assert.equal(validate({error: {code, message: 'Safe message'}}), codes.includes(code), `${name}: ${code}`);
    shapeCases++;
  }
  // Dispatcher-only responses must not masquerade as branches of valid POSTs.
  if (status === '404' || status === '405') continue;
  for (const item of Object.values(document.paths)) {
    assert.equal(item.post.responses[status].$ref, `#/components/responses/${name}`);
  }
}
assert.equal(api.components.responses.MethodNotAllowed.headers.Allow.schema.const, 'POST');
for (const item of Object.values(api.paths)) {
  assert.deepEqual(Object.keys(item.post.responses).sort(), ['200', '400', '413', '415', '500', '503', '504']);
  assert.equal(item.post.responses['200'].headers['Cache-Control'].schema.const, 'no-store');
  assert.equal(item.post.requestBody.required, true);
  assert.deepEqual(item.post.parameters.map((p) => [p.in, p.name]), [['header', 'Content-Encoding']]);
}
assert.equal(api.components.requestBodies.Validation['x-max-body-bytes'], 131072);
assert.equal(schemas.ValidationRequest.properties.source['x-max-utf16-code-units'], 50000);
assert.equal(schemas.ValidationRequest.properties.source['x-max-utf8-bytes'], 100000);
assert.equal(schemas.SyntaxDiagnostic.properties.message['x-max-utf16-code-units'], 2000);
console.log(JSON.stringify({
  file: filename, openapi: api.openapi, operations, references, examples, shapeCases,
  errorCodes: allCodes.length, errorStatuses: Object.keys(responseCodes).length,
  result: 'OAS validation, local reference resolution, examples and contract shape checks passed',
}, null, 2));
