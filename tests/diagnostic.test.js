import { expect, test } from 'bun:test';
import { syntaxDiagnostic } from '../src/http-diagnostic.js';

const source = 'flowchart TD\n A --> )';
const jison = message => ({message, hash: {token: 'INVALID', loc: {first_line: 1, first_column: 99}}});

test('only verified original-source line headers yield coordinates, never Jison previous-token columns', () => {
  for (const [message, line] of [['Parse error on line 2:\nUnexpected )', 2], ['Lexical error on line 2.\nUnrecognized text', 2]]) {
    expect(syntaxDiagnostic(jison(message), source).position).toEqual({line, column: null});
  }
  for (const message of ['Parse error on line 0:', 'Parse error on line 3:',
    'Parse error on line 99999999999999999999:', 'line 2 column 3', 'Parse error on line 2x:']) {
    expect(syntaxDiagnostic(jison(message), source).position).toBeNull();
  }
  for (const changed of ['\n' + source, '%% comment\n' + source, '---\ntitle: x\n---\n' + source,
    'flowchart TD\n A["&#35;"] --> )', 'flowchart TD\n A["<b>x</b>"] --> )', 'classDiagram\n??']) {
    expect(syntaxDiagnostic(jison('Parse error on line 2:'), changed).position).toBeNull();
  }
});

test('recognizes upstream syntax families but does not misclassify runtime exceptions', () => {
  for (const error of [undefined, null, new Error('private path'), {}, {hash: 'bad'},
    {hash: {}}, {result: {}}, {result: 'bad'}, {name: 'TypeError', message: 'parse error'}]) {
    expect(syntaxDiagnostic(error, source)).toBeNull();
  }
  for (const error of [{name: 'UnknownDiagramError'}, {name: 'YAMLException'},
    {hash: {loc: {}}}, {hash: {expected: []}}, {result: {lexerErrors: []}},
    {result: {parserErrors: []}}]) {
    expect(syntaxDiagnostic(error, source)).toEqual({message: 'Mermaid syntax error.', position: null});
  }
});

test('diagnostics are bounded, omit stack suffixes, and replace missing/empty messages', () => {
  expect(syntaxDiagnostic(jison('bad syntax\n    at secret (/private/path)'), source).message).toBe('bad syntax');
  expect(syntaxDiagnostic(jison('x'.repeat(3000)), source).message).toHaveLength(2000);
  for (const message of ['', ' \n ', 17, undefined]) {
    expect(syntaxDiagnostic(jison(message), source).message).toBe('Mermaid syntax error.');
  }
});
