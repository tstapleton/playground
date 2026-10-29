import { render } from 'pele';
import { type Change, DIFF_MARKS } from '../diff/describe';
import { countsText, type DiffSummary, type Section } from '../diff/sections';
import type { Graph } from '../graph/model';
import type { View } from '../graph/slice';
import type { DiffLabels } from './markdown';
import { mermaid } from './mermaid';

/** The full review page: every diagram of the diff, plus each store method before and after. */
export function diffPage(feature: string, summary: DiffSummary, labels: DiffLabels, analyzer: string): string {
  const { sections, changes, unchanged, storeMethods } = summary;
  const total = storeMethods.changed + storeMethods.added + storeMethods.removed + storeMethods.unchanged;
  const chips = (['changed', 'added', 'removed', 'unchanged'] as const)
    .map((s) => `<span class="badge ${s === 'unchanged' ? 'same' : s}">${storeMethods[s]} ${s}</span>`)
    .join('');
  const toc = [
    ...sections.map(
      (s) =>
        `<li><span class="badge ${s.status}">${s.status}</span><a href="#${slug(s.title)}">${html(s.title)}</a> <span class="counts">${html(countsText(s))}</span></li>`,
    ),
    ...unchanged.map((u) => `<li><span class="badge same">unchanged</span>${html(u)}</li>`),
  ].join('\n');

  return page(
    `Call graph diff: ${labels.base} → ${labels.head}`,
    `<main>
<header>
  <h1>Call graph diff</h1>
  <p><code>${html(labels.base)}</code> → <code>${html(labels.head)}</code> · <code>${html(feature)}</code> · ${total} store methods ${chips}</p>
</header>
${LEGEND_HTML}
${whatChanged(changes, sections)}
<nav><h2>Diagrams</h2><ul class="tests">${toc}</ul></nav>
${sections.map(section).join('\n')}
<footer>${html(analyzer)}</footer>
</main>`,
  );
}

/** One revision: a diagram per store method. */
export function graphPage(graph: Graph, views: View[], label: string): string {
  const toc = views
    .map(
      (v) =>
        `<li><a href="#${slug(v.title)}">${html(v.title)}</a> <span class="counts">${v.nodes.length} functions</span></li>`,
    )
    .join('\n');
  return page(
    `Call graph: ${graph.inputs.feature}`,
    `<main>
<header>
  <h1>Call graph</h1>
  <p><code>${html(label)}</code> · <code>${html(graph.inputs.feature)}</code> · ${views.length} store methods</p>
</header>
<nav><h2>Store methods</h2><ul class="tests">${toc}</ul></nav>
${views
  .map(
    (v) =>
      `<section class="test" id="${slug(v.title)}"><div class="head"><h2>${html(v.title)}</h2><div class="meta">${v.nodes.length} functions</div></div><div class="diagram">${svgOf(mermaid(v))}</div></section>`,
  )
  .join('\n')}
<footer>${html(graph.inputs.analyzer)}</footer>
</main>`,
  );
}

function section(s: Section): string {
  const meta = [`<code>${html(s.file)}</code>`, html(countsText(s))];
  if (s.dependencies.added.length) meta.push(`new dependency: <b>${html(s.dependencies.added.join(', '))}</b>`);
  if (s.dependencies.removed.length) meta.push(`no longer calls: <b>${html(s.dependencies.removed.join(', '))}</b>`);
  const head = `<div class="head"><h2><span class="badge ${s.status}">${s.status}</span>${html(s.title)}</h2><div class="meta">${meta.join(' · ')}</div></div>`;
  if (s.status !== 'changed') {
    return `<section class="test" id="${slug(s.title)}">${head}<div class="diagram">${svgOf(mermaid(s.diagram))}</div></section>`;
  }
  const lines = s.changes
    .map((c) => `<li class="${c.op}"><span class="mark">${DIFF_MARKS[c.op]}</span>${inline(c.text)}</li>`)
    .join('\n');
  const sides =
    s.before && s.after
      ? `<details><summary>Before and after</summary>
    <div class="sides">
      <div><h3>Before</h3><div class="diagram">${svgOf(mermaid(s.before))}</div></div>
      <div><h3>After</h3><div class="diagram">${svgOf(mermaid(s.after))}</div></div>
    </div>
  </details>`
      : '';
  return `<section class="test" id="${slug(s.title)}">${head}
  ${lines ? `<ul class="changes">${lines}</ul>` : ''}
  <div class="diagram">${svgOf(mermaid(s.diagram))}</div>
  ${sides}
</section>`;
}

function whatChanged(changes: Change[], sections: Section[]): string {
  if (!changes.length) return '';
  const items = changes
    .map((c) => {
      const where = sections.filter((s) => s.changes.some((x) => x.key === c.key));
      const links = where.map((s) => `<li><a href="#${slug(s.title)}">${html(s.title)}</a></li>`).join('');
      const summary = where.length === 1 ? '1 diagram' : `${where.length} diagrams`;
      return `<li class="${c.op}"><span class="mark">${DIFF_MARKS[c.op]}</span>${inline(c.text)}${
        where.length
          ? `
        <details class="where"><summary>${summary}</summary><ul>${links}</ul></details>`
          : ''
      }</li>`;
    })
    .join('\n');
  return `<section class="summary"><h2>What changed</h2><ul class="changes">${items}</ul></section>`;
}

const LEGEND_HTML = `<div class="legend">
  <span><i style="background:var(--added-bg)"></i>${DIFF_MARKS.added} added</span>
  <span><i style="background:var(--removed-bg)"></i>${DIFF_MARKS.removed} removed</span>
  <span><i style="background:var(--changed-bg)"></i>${DIFF_MARKS.changed} changed</span>
  <span><i style="background:var(--moved-bg)"></i>${DIFF_MARKS.moved} moved to a different point</span>
  <span>→ call · ⇢ read · ⇒ output to the parent template. Code outside the feature is shown but not followed.</span>
</div>`;

/** The Markdown subset change sentences use: **bold** and `code`. */
function inline(text: string): string {
  return html(text)
    .replace(/`([^`]*)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** Renders Mermaid text to an inline SVG with Pele, or an error box if it can't. */
function svgOf(source: string): string {
  try {
    return render(source).svg;
  } catch (error) {
    return `<pre class="render-error">Could not render diagram: ${html(String(error))}</pre>`;
  }
}

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function html(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Self-contained page: inline CSS and SVG, no scripts, light and dark themes. */
function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${html(title)}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`;
}

// plotline's report styles, so the two reports look like one family.
const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f6f4; --surface: #ffffff; --text: #1d1c1a; --muted: #6b6862; --border: #e3e1dc;
  --accent: #2f5bd3; --added: #1f8a3b; --removed: #c2362f; --changed: #a86b00;
  --added-bg: rgba(46, 160, 67, 0.16); --removed-bg: rgba(218, 54, 51, 0.14); --changed-bg: rgba(212, 167, 44, 0.24); --moved-bg: rgba(56, 132, 255, 0.14);
  --pele-bg: var(--surface); --pele-fg: var(--text); --pele-muted: var(--muted); --pele-line: #3a3936;
  --pele-surface: #f4f3ef; --pele-surface-alt: #ebe9e3; --pele-border: #cfccc4; --pele-accent: var(--accent);
  --pele-radius: 6px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #121211; --surface: #1b1b19; --text: #e9e7e2; --muted: #a19e96; --border: #2f2e2b;
    --accent: #7c9cff; --added: #5cc27a; --removed: #ff7b72; --changed: #e3b341;
    --pele-line: #c9c6be; --pele-surface: #252522; --pele-surface-alt: #2e2d2a; --pele-border: #4a4843;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1400px; margin: 0 auto; padding: 32px 16px 64px; }
header h1 { font-size: 24px; margin: 0 0 4px; letter-spacing: -0.01em; }
header p { margin: 0; color: var(--muted); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
nav { margin: 24px 0 32px; padding: 16px 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
nav h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 8px; }
nav ol, nav ul { margin: 0; padding-left: 20px; }
nav li { margin: 2px 0; }
section.test { margin: 0 0 32px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
section.test > .head { padding: 16px 20px; border-bottom: 1px solid var(--border); }
section.test h2 { font-size: 17px; margin: 0; }
section.test .meta { color: var(--muted); font-size: 13px; margin-top: 2px; }
.diagram { padding: 16px; overflow-x: auto; }
.diagram svg { display: block; margin: 0 auto; }
details { border-top: 1px solid var(--border); }
details > summary { cursor: pointer; padding: 10px 20px; color: var(--muted); font-size: 13px; }
.render-error { color: var(--removed); padding: 16px 20px; white-space: pre-wrap; }
.badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 1px 8px; border-radius: 999px; margin-right: 6px; vertical-align: 1px; }
.badge.added { color: var(--added); background: var(--added-bg); }
.badge.removed { color: var(--removed); background: var(--removed-bg); }
.badge.changed { color: var(--changed); background: var(--changed-bg); }
.badge.same { color: var(--muted); background: var(--pele-surface); }
.legend { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 16px 0 0; color: var(--muted); font-size: 13px; }
.legend i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px; }
ul.tests { list-style: none; padding: 0; }
ul.tests li { margin: 4px 0; }
.counts { color: var(--muted); font-size: 13px; margin-left: 4px; }
section.test h2 .badge { margin-right: 8px; }
ul.changes { margin: 0; padding: 12px 20px; list-style: none; font-size: 14px; border-bottom: 1px solid var(--border); }
.summary { margin: 24px 0; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.where { display: inline-block; margin-left: 6px; border: 0; color: var(--muted); font-size: 13px; }
.where > summary { padding: 0; display: inline; }
.where ul { margin: 4px 0 2px; padding-left: 18px; }
.summary h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 16px 20px 0; }
.summary ul.changes { border-bottom: 0; }
ul.changes li { padding: 3px 0; overflow-wrap: anywhere; }
ul.changes .mark { display: inline-block; width: 18px; font-weight: 700; }
ul.changes .added .mark { color: var(--added); }
ul.changes .removed .mark { color: var(--removed); }
ul.changes .changed .mark { color: var(--changed); }
ul.changes .moved .mark { color: var(--accent); }
.sides { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 0; }
.sides > div + div { border-left: 1px solid var(--border); }
.sides h3 { margin: 12px 20px 0; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
footer { color: var(--muted); font-size: 12px; margin-top: 32px; }
`;
