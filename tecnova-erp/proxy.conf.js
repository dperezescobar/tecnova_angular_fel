/*
 * Proxy del dev server (ng serve).
 *
 * >>> INTERRUPTOR maildte: cambia MAILDTE_LOCAL a true (local) o false (produccion) <<<
 *   - true  -> https://localhost:44369        (tu maildte en IIS Express; secure:false por cert self-signed)
 *   - false -> https://maildte.kulstoresv.com (produccion)
 *
 * Si tu maildte local corre en HTTP y no HTTPS, cambia 'https://localhost:44369' por 'http://localhost:44369'.
 * Tras cambiar el valor, reinicia `ng serve`.
 */
const MAILDTE_LOCAL = true;

const maildte = MAILDTE_LOCAL
  ? { target: 'https://localhost:44369', secure: false }
  : { target: 'https://maildte.kulstoresv.com', secure: true };

module.exports = {
  '/dte-proxy': {
    target: 'http://localhost:28801',
    secure: false,
    changeOrigin: true,
    pathRewrite: { '^/dte-proxy': '' }
  },
  '/maildte-proxy': {
    target: maildte.target,
    secure: maildte.secure,
    changeOrigin: true,
    pathRewrite: { '^/maildte-proxy': '' }
  }
};
