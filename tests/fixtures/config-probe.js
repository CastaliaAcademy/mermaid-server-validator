// Private test subprocess: exercise the real DOM/engine without shared globals.
const workerData = await Bun.stdin.json();
let dom;
for (const method of ['log', 'warn', 'error', 'info', 'debug', 'trace']) console[method] = () => {};
let result;
try {
 const { initializeEngine } = await import('../../src/engine.js');
 const engine = await initializeEngine();
 const { mermaid } = engine;
 dom = engine.dom;
 const keys = ['secure','securityLevel','startOnLoad','maxTextSize','maxEdges','suppressErrorRendering','dompurifyConfig','themeCSS','htmlLabels','theme','themeVariables'];
 const before = Object.fromEntries(keys.map(key => [key, JSON.stringify(mermaid.mermaidAPI.getConfig()[key])]));
 const parsed = await mermaid.parse(workerData.source);
 const after = mermaid.mermaidAPI.getConfig();
 const changed = keys.filter(key => before[key] !== JSON.stringify(after[key]));
 dom.window.document.body.innerHTML = '<button onclick="window.__executed = true">Go</button><script>window.__executed = true</script>';
 dom.window.document.querySelector('button').click();
 const external = dom.window.document.createElement('script');
 external.src = workerData.resourceURL ?? 'data:text/javascript,window.__loaded=true';
 dom.window.document.body.append(external);
 if (workerData.resourceURL) {
   const frame = dom.window.document.createElement('iframe'); frame.src = workerData.resourceURL;
   const image = dom.window.document.createElement('img'); image.src = workerData.resourceURL;
   const style = dom.window.document.createElement('link'); style.rel = 'stylesheet'; style.href = workerData.resourceURL;
   dom.window.document.body.append(frame, image, style);
 }
 await new Promise(resolve => setTimeout(resolve, 20));
 result = {changed, securityLevel: after.securityLevel, htmlLabels: after.htmlLabels, startOnLoad: after.startOnLoad, suppressErrorRendering: after.suppressErrorRendering, secure: after.secure, diagramType: parsed.diagramType, scriptExecuted: !!dom.window.__executed, externalScriptLoaded: !!dom.window.__loaded};
} catch(error) {result = {error: error.message};}
finally {dom?.window.close();}
process.stdout.write(JSON.stringify(result));
