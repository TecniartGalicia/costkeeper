// Audita el webview REAL de CostKeeper ejecutándolo: comprueba que el buscador
// conserva el foco, que el clic filtra y que quitar un filtro funciona en inglés.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

import path from 'node:path';
import { fileURLToPath } from 'node:url';
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(EXT + '/src/ui/panel.ts', 'utf8');
const between = (decl) => {
  const i = src.indexOf(decl);
  const open = src.indexOf('`', i);
  return src.slice(open + 1, src.indexOf('`', open + 1));
};
const CSS = between('export const CSS =');
const SCRIPT = between('export const SCRIPT =');
const ICONOS = {};
for (const m of src.matchAll(/^\s{2}(refrescar|exportar|etiqueta): '(<svg[\s\S]*?<\/svg>)',$/gm)) ICONOS[m[1]] = m[2];
const T = {
  titulo: 'What your agents cost', dias7: '7 days', dias30: '30 days', dias90: '90 days', todo: 'All',
  actualizar: 'Update', cliente: 'Client', csv: 'CSV', subagentes: 'Subagents',
  porProyecto: 'By project', porModelo: 'By model', porCliente: 'By client',
  porRama: 'By branch', sesiones: 'Most expensive sessions', cuota: 'Quota', porDia: 'Per day',
};
const CUERPO = between('export function cuerpoHtml')
  .replace(/\$\{escapar\(t\.(\w+)\)\}/g, (_, k) => T[k])
  .replace(/\$\{ICONOS\.(\w+)\}/g, (_, k) => ICONOS[k]);

// Datos como los manda la extensión, en INGLÉS (los nombres de eje van traducidos).
const fila = (etiqueta, usd, mensajes, clave) => ({ clave: clave ?? etiqueta, etiqueta, usd, importe: '$' + usd, mensajes, filtrable: true });
const tarjeta = (eje, filas, extra = {}) => ({ eje, mayor: Math.max(...filas.map((f) => f.usd)), todas: false, ocultas: 0, filas, ...extra });
const datos = (filtros = []) => ({
  dias: 30, incluirSubagentes: true, filtros,
  resumen: { usd: 100, importe: '$100', subtitulo: 's', rango: 'r', tendencia: '+47 %', tendenciaSube: true },
  tarjetas: [
    tarjeta('proyecto', Array.from({ length: 12 }, (_, i) => fila('proy-' + i, 12 - i, 10, 'c:/x/proy-' + i)), { busqueda: '', ocultas: 4 }),
    tarjeta('modelo', [fila('claude-opus-5', 50, 10)]),
    tarjeta('sesion', [fila('acme', 20, 5, 'sesion-1')]),
    tarjeta('cliente', [fila('Acme', 30, 5)]),
    tarjeta('rama', [fila('main', 10, 5)]),
  ],
  serie: [{ dia: '2026-08-01', usd: 1, importe: '$1' }],
  cuotas: [], avisos: [],
  textos: { sinDatos: 'x', sinCuota: 'x', buscar: 'Search…', verTodas: 'Show all ({0} more)', verMenos: 'Show less',
    filtrarPor: 'Filter by', quitar: 'Remove filter', subagentes: 'Subagents', pie: 'pie' },
});

const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><style>${CSS}</style></head><body>
${CUERPO}
<script>
window.__enviados = [];
window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__enviados.push(m) });
</script>
<script>${SCRIPT}</script>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push(e.message));
await page.setContent(html, { waitUntil: 'load' });

let fallos = 0;
const ok = (n, c, extra = '') => { console.log(`${c ? '  OK  ' : '  FALLA'} ${n}${extra ? ' · ' + extra : ''}`); if (!c) fallos++; };

const pintar = (d) => page.evaluate((dd) => window.postMessage({ tipo: 'datos', datos: dd }, '*'), d);

await pintar(datos());
await page.waitForTimeout(200);

console.log('== pintado inicial');
ok('sin errores de JavaScript', errores.length === 0, errores[0] ?? '');
ok('el total se pinta', (await page.textContent('#total')) === '$100');
ok('la tendencia se pinta', (await page.textContent('#tendencia')) === '+47 %');
ok('las filas de proyecto salen', (await page.locator('#t-proyecto tr').count()) > 0);

console.log('\n== clic en una fila');
await page.locator('#t-proyecto tr').first().click();
let enviados = await page.evaluate(() => window.__enviados);
const filtrar = enviados.find((m) => m.tipo === 'filtrar');
ok('pinchar una fila pide filtrar', !!filtrar, JSON.stringify(filtrar));
ok('manda la clave completa, no la etiqueta', filtrar?.valor === 'c:/x/proy-0', filtrar?.valor);

console.log('\n== quitar un filtro (interfaz en inglés)');
// Como los manda la extensión: clave interna del eje + nombre traducido para leer.
 await pintar(datos([{ eje: 'proyecto', nombre: 'project', valor: 'c:/x/proy-0', etiqueta: 'proy-0' }]));
await page.waitForTimeout(150);
await page.evaluate(() => { window.__enviados = []; });
await page.locator('.chip button').first().click();
enviados = await page.evaluate(() => window.__enviados);
const quitar = enviados.find((m) => m.tipo === 'filtrar');
ok('el botón manda un eje que la extensión entienda',
  ['proyecto', 'modelo', 'cliente', 'sesion'].includes(quitar?.eje),
  `manda "${quitar?.eje}"`);

console.log('\n== buscador');
await pintar(datos());
await page.waitForTimeout(150);
const caja = page.locator('#t-proyecto input.busca');
await caja.click();
await page.keyboard.type('pr');
// La extensión responde repintando con lo que el usuario lleva escrito.
await pintar({ ...datos(), tarjetas: datos().tarjetas.map((t) => (t.eje === 'proyecto' ? { ...t, busqueda: 'pr' } : t)) });
await page.waitForTimeout(150);
const enfocado = await page.evaluate(() => document.activeElement?.className);
ok('el buscador conserva el foco tras repintar', enfocado === 'busca', `foco en "${enfocado}"`);
await page.keyboard.type('oy');
const valorFinal = await page.evaluate(() => document.querySelector('#t-proyecto input.busca')?.value);
ok('se puede seguir escribiendo', valorFinal === 'proy', `quedó "${valorFinal}"`);

console.log(`\n===== ${fallos} fallos`);
await browser.close();
process.exit(fallos ? 1 : 0);
