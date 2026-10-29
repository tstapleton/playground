import { render } from 'pele';
import { GraphDiff } from '../diff/diff';
import { Graph } from '../graph/model';
import { View } from '../graph/slice';
import { classLabel, describe, fullName } from './labels';
import { Labels, nameLookup, significant, summary } from './markdown';
import { mermaid } from './mermaid';

export function diffPage(diff: GraphDiff, views: View[], labels: Labels): string {
  const changes = significant(diff);
  const nameOf = nameLookup(diff);
  const rows = changes.map((c) => {
    const node = (c.head ?? c.base)!;
    const outside = node.kind === 'boundary' ? ' <span class="muted">(outside)</span>' : '';
    return `<tr class="${c.class}"><td><span class="badge ${c.class}">${classLabel(c)}</span></td><td><code>${esc(fullName(node))}</code>${outside}<div class="muted">${esc(node.file)}:${node.line}</div></td><td>${describe(c, nameOf, diff.edges).map(esc).join('<br>') || '—'}</td></tr>`;
  });
  const body = `<main>
<header>
<h1>Call graph changes in <code>${esc(diff.head.feature)}</code></h1>
<p><code>${esc(labels.base)}</code> → <code>${esc(labels.head)}</code> · ${md(summary(changes))}</p>
${LEGEND}
</header>
${changes.length ? `<section><table><thead><tr><th>Change</th><th>Where</th><th>What</th></tr></thead><tbody>${rows.join('')}</tbody></table></section>` : '<p>No method, call or dependency changed.</p>'}
${nav(views)}
${views.map(diagram).join('\n')}
<footer>${esc(diff.base.analyzer)}</footer>
</main>`;
  return page(`Call graph changes: ${diff.head.feature}`, body);
}

export function graphPage(graph: Graph, views: View[], label: string): string {
  const body = `<main>
<header>
<h1>Call graph of <code>${esc(graph.inputs.feature)}</code></h1>
<p><code>${esc(label)}</code> · ${views.length} store method${views.length === 1 ? '' : 's'} · ${graph.nodes.length} nodes, ${graph.edges.length} edges</p>
${LEGEND}
</header>
${nav(views)}
${views.map(diagram).join('\n')}
<footer>${esc(graph.inputs.analyzer)}</footer>
</main>`;
  return page(`Call graph: ${graph.inputs.feature}`, body);
}

function nav(views: View[]): string {
  if (views.length < 2) return '';
  return `<nav><h2>Diagrams</h2><ol>${views.map((v, i) => `<li><a href="#d${i}">${esc(v.title)}</a> <span class="muted">${v.nodes.length} nodes</span></li>`).join('')}</ol></nav>`;
}

function diagram(view: View, i: number): string {
  const source = mermaid(view);
  return `<section class="diagram" id="d${i}">
<h2>${esc(view.title)}</h2>
<div class="svg">${svgOf(source)}</div>
<details><summary>Mermaid source</summary><pre>${esc(source)}</pre></details>
</section>`;
}

function svgOf(source: string): string {
  try {
    return render(source).svg;
  } catch (error) {
    return `<pre class="render-error">Could not render diagram: ${esc(String(error))}</pre>`;
  }
}

const LEGEND = `<p class="legend"><span><i class="added"></i>added</span><span><i class="removed"></i>removed</span><span><i class="structural"></i>calls changed</span><span><i class="context"></i>same calls, different place</span><span><i class="state"></i>state access changed</span><span><i class="implementation"></i>body changed only</span><span>→ call</span><span>⇢ read</span><span>⇒ output to parent template</span></p>`;

function md(text: string): string {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function esc(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Self-contained page: inline CSS and SVG, no scripts. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f6f4; --surface: #ffffff; --text: #1d1c1a; --muted: #6b6862; --border: #e3e1dc; --accent: #2f5bd3;
  --added: #1f8a3b; --removed: #c2362f; --changed: #a86b00; --state: #2f5bd3;
  --pele-bg: var(--surface); --pele-fg: var(--text); --pele-muted: var(--muted); --pele-line: #3a3936;
  --pele-surface: #f4f3ef; --pele-surface-alt: #ebe9e3; --pele-border: #cfccc4; --pele-accent: var(--accent); --pele-radius: 6px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121211; --surface: #1b1b19; --text: #e9e7e2; --muted: #a19e96; --border: #2f2e2b; --accent: #7c9cff;
    --added: #5cc27a; --removed: #ff7b72; --changed: #e3b341; --state: #7c9cff;
    --pele-line: #c9c6be; --pele-surface: #252522; --pele-surface-alt: #2e2d2a; --pele-border: #4a4843;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
header p { margin: 0; color: var(--muted); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.muted { color: var(--muted); font-size: 13px; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 16px 0 0; font-size: 13px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; border: 2px solid; }
i.added { border-color: var(--added); background: rgba(46, 160, 67, 0.2); }
i.removed { border-color: var(--removed); border-style: dashed; background: rgba(218, 54, 51, 0.16); }
i.structural { border-color: var(--changed); background: rgba(212, 167, 44, 0.28); }
i.context { border-color: var(--changed); border-style: dashed; }
i.state { border-color: var(--state); background: rgba(56, 100, 255, 0.16); }
i.implementation { border-color: var(--muted); border-width: 3px; }
section, nav { margin: 24px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
nav { padding: 16px 20px; }
nav h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 8px; }
nav ol { margin: 0; padding-left: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 8px 14px; border-bottom: 1px solid var(--border); overflow-wrap: anywhere; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
tr:last-child td { border-bottom: 0; }
.badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; white-space: nowrap; }
.badge.added { color: var(--added); background: rgba(46, 160, 67, 0.16); }
.badge.removed { color: var(--removed); background: rgba(218, 54, 51, 0.14); }
.badge.structural, .badge.context { color: var(--changed); background: rgba(212, 167, 44, 0.22); }
.badge.state, .badge.renamed { color: var(--state); background: rgba(56, 100, 255, 0.14); }
.badge.implementation { color: var(--muted); background: var(--pele-surface); }
section.diagram h2 { font-size: 17px; margin: 0; padding: 14px 20px; border-bottom: 1px solid var(--border); }
.svg { padding: 16px; overflow-x: auto; }
.svg svg { display: block; margin: 0 auto; max-width: 100%; height: auto; }
details { border-top: 1px solid var(--border); }
details > summary { cursor: pointer; padding: 10px 20px; color: var(--muted); font-size: 13px; }
details pre { margin: 0; padding: 12px 20px 20px; overflow-x: auto; font-size: 12px; }
.render-error { color: var(--removed); padding: 16px 20px; white-space: pre-wrap; }
footer { color: var(--muted); font-size: 12px; margin-top: 32px; }
`;
