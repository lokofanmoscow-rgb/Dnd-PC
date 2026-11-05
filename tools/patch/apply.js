// Применяет секции //@@ P.name из файлов-патчей к combat.js
const fs = require('fs');
const target = process.argv[2];
const patches = process.argv.slice(3);
let lines = fs.readFileSync(target, 'utf8').split('\n');
for (const pf of patches) {
  const txt = fs.readFileSync(pf, 'utf8');
  const parts = txt.split(/^\/\/@@ /m).filter((s) => s.trim());
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const name = part.slice(0, nl).trim();
    let body = part.slice(nl + 1).replace(/\s+$/, '') + '\n';
    const bodyLines = body.split('\n');
    if (bodyLines[bodyLines.length - 1] === '') bodyLines.pop();
    const startRe = new RegExp('^  ' + name.replace('.', '\\.') + ' = ');
    let s = lines.findIndex((l) => startRe.test(l));
    if (s < 0) {
      const at = lines.findIndex((l) => l.startsWith('  C.Engine = Engine;'));
      lines.splice(at, 0, ...bodyLines, '');
      console.log('insert', name);
      continue;
    }
    let e = s;
    while (e < lines.length && lines[e] !== '  };') e++;
    if (bodyLines[0].trim().startsWith('/*') && lines[s - 1] && lines[s - 1].trim().startsWith('/*')) s--;
    lines.splice(s, e - s + 1, ...bodyLines);
    console.log('replace', name, e - s + 1, '->', bodyLines.length);
  }
}
fs.writeFileSync(target, lines.join('\n'));
