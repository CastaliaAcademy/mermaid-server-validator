// Deterministic process-protocol failures; never used by the public server.
const mode = await Bun.stdin.text();
if (mode === 'exit') process.exit(2);
else if (mode === 'json') process.stdout.write('{');
else if (mode === 'kind') process.stdout.write('{"kind":"internal"}');
else if (mode === 'boolean') process.stdout.write('{"kind":"result","valid":1,"error":null}');
else if (mode === 'success-error') process.stdout.write('{"kind":"result","valid":true,"error":{}}');
else if (mode === 'missing-error') process.stdout.write('{"kind":"result","valid":false}');
else if (mode === 'message') process.stdout.write('{"kind":"result","valid":false,"error":{"message":17}}');
else process.stdout.write('{"kind":"result","valid":true,"error":null}');
