/**
 * Genera una vista previa del catalogo web con datos de ejemplo, para revisar
 * el diseno antes de subirlo. NO forma parte de la app: es solo una ayuda de
 * desarrollo.
 *
 *   cd backend && npm run build && node scripts/preview-catalogo.js
 *
 * Escribe backend/.preview-catalogo/index.html y lo puedes abrir en el
 * navegador (o servirlo con cualquier servidor estatico).
 */
const fs = require('fs');
const path = require('path');
const { generarHtml } = require('../dist/catalogo/plantilla.js');

const materiales = ['Plata', 'Oro', 'Oro'];
const cats = ['Anillo', 'Cadena', 'Arete', 'Pulsera', 'Dije'];
const nombres = [
  'Solitario circonia 4 mm', 'Argolla confort 5 mm', 'Media alianza pave',
  'Cadena veneciana 45 cm', 'Cadena barbada 50 cm', 'Topo perla cultivada',
  'Argolla huggie 12 mm', 'Pulsera tenis circonia', 'Esclava identificacion',
  'Dije corazon grabable', 'Dije inicial calado', 'Cadena rolo 55 cm',
  'Anillo sello ovalado', 'Arete largo gota', 'Pulsera rigida martillada',
];

// Algunas piezas con tallas para probar el selector del catalogo.
const tallasPorTipo = {
  Anillo: ['5', '6', '7', '8', '9'],
  Cadena: ['40 cm', '45 cm', '50 cm', '55 cm'],
  Pulsera: ['S', 'M', 'L'],
};

const productos = nombres.map((nombre, i) => {
  const categoria = cats[i % cats.length];
  return {
    sku: categoria.slice(0, 2).toUpperCase() + '-' + String(1001 + i),
    nombre,
    precio: [1850, 8900, 22400, 2400, 14700, 1200, 6300, 3600, 2150, 2900, 4600, 3100, 9800, 5400, 7200][i],
    imagen: null,
    material: materiales[i % materiales.length],
    categoria,
    tallas: i % 2 === 0 ? (tallasPorTipo[categoria] ?? []) : [],
  };
});

const datos = {
  negocio: 'Cafe Shopping',
  descripcion: 'Joyeria que se usa todos los dias',
  direccion: 'Santiago, Republica Dominicana',
  telefonoWhatsapp: '18095551234',
  logo: null,
  productos,
  generado: new Date().toLocaleDateString('es-DO'),
  relevoUrl: 'https://ejemplo-relevo.workers.dev',
};

const out = path.join(__dirname, '..', '.preview-catalogo');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'index.html'), generarHtml(datos), 'utf8');
console.log('Vista previa escrita en', path.join(out, 'index.html'));
