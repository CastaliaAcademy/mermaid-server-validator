import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('all copied Castalia fixture sources are included unmodified in compatibility tests', async () => {
 const castalia = JSON.parse(await readFile(new URL('./fixtures/castalia.json', import.meta.url), 'utf8'));
 const compatibility = JSON.parse(await readFile(new URL('./fixtures/compatibility.json', import.meta.url), 'utf8'));
 assert.equal(castalia.length, 3);
 assert.equal(compatibility.length, 21);
 for (const fixture of castalia) assert.equal(compatibility.find(f => f.id === fixture.id)?.source, fixture.source);
});
