// Fuente única de versión de EuroSoccer: package.json ("eurosoccerVersion") → genera
// projects/eurosoccer-app/src/environments/version.ts y projects/eurosoccer-app/public/version.json.
// Corre automáticamente antes de `npm run eurosoccer:build` (hook "preeurosoccer:build"). Para
// bumpear la versión, edita SOLO el campo "eurosoccerVersion" de package.json y vuelve a construir;
// nunca edites version.ts ni version.json a mano (se sobrescriben en cada build).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.eurosoccerVersion;

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const buildDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

const appRoot = path.join(root, 'projects', 'eurosoccer-app');

const versionTs =
  `export const APP_VERSION = '${version}';\n` +
  `export const APP_BUILD_DATE = '${buildDate}';\n`;
fs.writeFileSync(path.join(appRoot, 'src', 'environments', 'version.ts'), versionTs, 'utf8');

const versionJson = { version, buildTime: buildDate };
fs.writeFileSync(
  path.join(appRoot, 'public', 'version.json'),
  JSON.stringify(versionJson, null, 2) + '\n',
  'utf8'
);

console.log(`[sync-version-eurosoccer] version.ts y version.json actualizados a ${version} (${buildDate})`);
