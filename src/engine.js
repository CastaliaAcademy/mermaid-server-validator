import { JSDOM } from 'jsdom';

// Private implementation module, not a package export. Call only inside a worker.
export async function initializeEngine() {
  // No resources: "usable", no runScripts: jsdom cannot load subresources or run
  // diagram-provided scripts/event handlers. The .invalid origin is not fetched.
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://mermaid.invalid/' });
  try {
    // DOMPurify binds to window during Mermaid's module evaluation.
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Element = dom.window.Element;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.SVGElement = dom.window.SVGElement;
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
      htmlLabels: false, theme: 'base',
      secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'maxEdges',
        'suppressErrorRendering', 'dompurifyConfig', 'themeCSS', 'htmlLabels', 'theme', 'themeVariables'],
    });
    return { mermaid, dom };
  } catch (error) {
    dom.window.close();
    throw error;
  }
}
