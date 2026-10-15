import { expect, test } from 'bun:test';
import castalia from './fixtures/castalia.json';
import compatibility from './fixtures/compatibility.json';

test('all copied Castalia fixture sources remain unmodified in compatibility tests', () => {
  expect(castalia).toHaveLength(3);
  expect(compatibility).toHaveLength(21);
  for (const fixture of castalia) {
    expect(compatibility.find(item => item.id === fixture.id)?.source).toBe(fixture.source);
  }
});
