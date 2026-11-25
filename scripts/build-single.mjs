// Builds the game and inlines the JS + CSS into one self-contained HTML file.
// Usage: npm run build:single  ->  velo-game.html
import { execSync } from 'node:child_process';
import fs from 'node:fs';

execSync('npx vite build', { stdio: 'inherit' });
const dir = 'dist/assets/';
const files = fs.readdirSync(dir);
const js = fs.readFileSync(dir + files.find((f) => f.endsWith('.js')), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = fs.readFileSync(dir + files.find((f) => f.endsWith('.css')), 'utf8');
const html = fs.readFileSync('dist/index.html', 'utf8');
const fonts = [...html.matchAll(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g)].map((m) => m[0]).join('\n');
const body = html.split(/<body[^>]*>/)[1].split('</body>')[0].replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();

const out = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VELO Street Racing</title>
${fonts}
<style>:root{color-scheme:dark}html,body{height:100%;background:#000;color:#eef2ff}</style>
<style>${css}</style>
</head>
<body>
${body}
<script type="module">${js}</script>
</body>
</html>
`;
fs.writeFileSync('velo-game.html', out);
console.log(`velo-game.html written (${(out.length / 1024).toFixed(0)} KB)`);
