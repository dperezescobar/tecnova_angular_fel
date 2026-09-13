// Fuente única de versión: package.json → genera src/environments/version.ts y public/version.json.
// Corre automáticamente antes de `npm run build` (hook "prebuild"). Para bumpear la versión,
// edita SOLO el campo "version" de package.json y vuelve a construir; nunca edites version.ts
// ni version.json a mano (se sobrescriben en cada build).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const buildDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

const versionTs =
  `export const APP_VERSION = '${version}';\n` +
  `export const APP_BUILD_DATE = '${buildDate}';\n`;
fs.writeFileSync(path.join(root, 'src', 'environments', 'version.ts'), versionTs, 'utf8');

const versionJson = { version, buildTime: buildDate };
fs.writeFileSync(
  path.join(root, 'public', 'version.json'),
  JSON.stringify(versionJson, null, 2) + '\n',
  'utf8'
);

console.log(`[sync-version] version.ts y version.json actualizados a ${version} (${buildDate})`);
