// Jest globalTeardown: lists every generated diagram in traces/README.md.
const { existsSync, readdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

module.exports = function writeIndex() {
  const root = join(process.cwd(), 'traces');
  if (!process.env.TRACE || !existsSync(root)) return;

  const lines = ['# Traced behaviour', '', 'One sequence diagram per integration test. Regenerate with `npm run test:trace`.', ''];
  for (const spec of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    lines.push(`## ${spec.name}`, '');
    for (const file of readdirSync(join(root, spec.name)).filter((f) => f.endsWith('.md')).sort()) {
      const title = readFileSync(join(root, spec.name, file), 'utf8').split('\n')[0].replace(/^# /, '');
      lines.push(`- [${title}](${spec.name}/${file})`);
    }
    lines.push('');
  }
  writeFileSync(join(root, 'README.md'), lines.join('\n'));
};
