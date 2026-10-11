/**
 * Servidor estatico minimo para revisar la vista previa del catalogo
 * (backend/.preview-catalogo). Solo para desarrollo.
 *
 *   node scripts/preview-server.js   ->   http://localhost:4180
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..', '.preview-catalogo');
const PUERTO = process.env.PORT || 4180;
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

http
  .createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/') rel = '/index.html';
    const archivo = path.join(raiz, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
    fs.readFile(archivo, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('No encontrado');
        return;
      }
      res.writeHead(200, { 'Content-Type': tipos[path.extname(archivo)] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(PUERTO, () => console.log('Vista previa del catalogo en http://localhost:' + PUERTO));
