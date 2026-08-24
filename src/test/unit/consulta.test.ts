import assert from 'node:assert/strict';
import { agregar, casaPatron, diaHace, periodoAnterior, plegar, resumir, serieDiaria, sesiones, sinRama, SIN } from '../../core/consulta/agregar';
import { costeDe, tarifasValidas, tokensDe } from '../../core/precios/coste';
import { normalizarModelo, normalizarProyecto, nombreCortoProyecto } from '../../core/normalizar';
import { cuotasCodexVigentes, minutosHastaAgotar, ventanaClaude } from '../../core/cuota';
import { filasACsv, resumenACsv } from '../../core/exportar';
import { claveAviso, comprobarPresupuestos, mesDe } from '../../core/presupuesto';
import type { Cuota, Registro } from '../../core/tipos';

const reg = (o: Partial<Registro> = {}): Registro => ({
  id: Math.random().toString(36).slice(2),
  proveedor: 'claude',
  ts: '2026-08-24T10:00:00.000Z',
  proyecto: 'c:/proy/uno',
  rama: 'main',
  sesion: 's1',
  subagente: false,
  modelo: 'claude-opus-5',
  entrada: 0,
  salida: 0,
  cacheLectura: 0,
  cacheEscritura5m: 0,
  cacheEscritura1h: 0,
  razonamiento: 0,
  fuentes: ['f'],
  ...o,
});

describe('normalizar', () => {
  it('P-08 · en Windows y macOS las tres grafías son el mismo proyecto', () => {
    for (const plataforma of ['win32', 'darwin'] as NodeJS.Platform[]) {
      const a = normalizarProyecto('C:\\X\\Y', plataforma);
      const b = normalizarProyecto('c:\\x\\y\\', plataforma);
      const c = normalizarProyecto('C:/X/Y', plataforma);
      assert.equal(a, b);
      assert.equal(b, c);
    }
  });

  it('P-08 · en Linux se distinguen mayúsculas', () => {
    assert.notEqual(normalizarProyecto('/X/Y', 'linux'), normalizarProyecto('/x/y', 'linux'));
  });

  it('una ruta vacía es (desconocido)', () => {
    assert.equal(normalizarProyecto('', 'linux'), '(desconocido)');
    assert.equal(normalizarProyecto('/', 'linux'), '(desconocido)');
  });

  it('el nombre corto es la última carpeta', () => {
    assert.equal(nombreCortoProyecto('c:/users/x/apps/costkeeper'), 'costkeeper');
    assert.equal(nombreCortoProyecto('(desconocido)'), '(desconocido)');
  });

  it('quita sufijos que no cambian la tarifa', () => {
    assert.equal(normalizarModelo('claude-opus-5[1m]'), 'claude-opus-5');
    assert.equal(normalizarModelo('claude-haiku-4-5-20251001'), 'claude-haiku-4-5');
  });
});

describe('coste', () => {
  it('P-03 · multiplicadores de caché', () => {
    assert.equal(costeDe(reg({ cacheEscritura1h: 1e6 })).usd, 10);
    assert.equal(costeDe(reg({ cacheEscritura5m: 1e6 })).usd, 6.25);
    assert.equal(costeDe(reg({ cacheLectura: 1e6 })).usd, 0.5);
    assert.equal(costeDe(reg({ entrada: 1e6 })).usd, 5);
    assert.equal(costeDe(reg({ salida: 1e6 })).usd, 25);
  });

  it('el razonamiento no se suma aparte', () => {
    const conRazonamiento = costeDe(reg({ salida: 1000, razonamiento: 900 })).usd;
    const sinRazonamiento = costeDe(reg({ salida: 1000, razonamiento: 0 })).usd;
    assert.equal(conRazonamiento, sinRazonamiento);
  });

  it('P-09 · un modelo desconocido no rompe nada', () => {
    const c = costeDe(reg({ modelo: 'modelo-inventado', entrada: 1e6 }));
    assert.equal(c.usd, null);
    assert.equal(c.confianza, 'estimado');
  });

  it('las tarifas propias del usuario tienen prioridad', () => {
    const c = costeDe(reg({ modelo: 'gpt-5.6-sol', entrada: 1e6 }), { 'gpt-5.6-sol': { entrada: 2, salida: 10 } });
    assert.equal(c.usd, 2);
  });

  it('la caché derivada baja la confianza', () => {
    assert.equal(costeDe(reg({ cacheDerivada: true })).confianza, 'derivado');
  });

  it('tokensDe suma las cinco cifras', () => {
    assert.equal(tokensDe(reg({ entrada: 1, salida: 2, cacheLectura: 4, cacheEscritura5m: 8, cacheEscritura1h: 16 })), 31);
  });
});

describe('agregar', () => {
  const datos = [
    reg({ proyecto: 'a', modelo: 'claude-opus-5', salida: 1e6, ts: '2026-08-01T10:00:00Z' }),
    reg({ proyecto: 'b', modelo: 'claude-haiku-4-5', salida: 1e6, ts: '2026-08-02T10:00:00Z' }),
    reg({ proyecto: 'a', modelo: 'claude-opus-5', salida: 1e6, ts: '2026-08-03T10:00:00Z', subagente: true }),
  ];

  it('agrupa y ordena por coste', () => {
    const filas = agregar(datos, 'proyecto');
    assert.equal(filas[0].clave, 'a');
    assert.equal(filas[0].usd, 50);
    assert.equal(filas[1].clave, 'b');
    assert.equal(filas[1].usd, 5);
  });

  it('filtra por fechas', () => {
    const filas = agregar(datos, 'proyecto', { desde: '2026-08-02', hasta: '2026-08-02' });
    assert.equal(filas.length, 1);
    assert.equal(filas[0].clave, 'b');
  });

  it('puede excluir subagentes', () => {
    const filas = agregar(datos, 'proyecto', { incluirSubagentes: false });
    assert.equal(filas[0].usd, 25);
  });

  it('agrupa por cliente con las etiquetas', () => {
    const filas = agregar(datos, 'cliente', {}, { clientes: { a: 'Cliente Uno' } });
    assert.deepEqual(filas.map((f) => f.clave).sort(), [SIN.cliente, 'Cliente Uno']);
  });

  it('el resumen calcula también el coste sin desglose de caché', () => {
    const r = resumir([reg({ cacheEscritura1h: 1e6 })]);
    assert.equal(r.usd, 10);
    assert.equal(r.usdSinDesgloseCache, 6.25);
    assert.equal(r.desde, '2026-08-24');
  });

  it('la serie diaria rellena los días sin actividad', () => {
    const serie = serieDiaria(datos);
    assert.equal(serie.length, 3);
    assert.deepEqual(serie.map((s) => s.dia), ['2026-08-01', '2026-08-02', '2026-08-03']);
  });

  it('diaHace usa fecha local', () => {
    assert.equal(diaHace(0, new Date(2026, 7, 24)), '2026-08-24');
    assert.equal(diaHace(30, new Date(2026, 7, 24)), '2026-07-25');
  });
});

describe('cuota', () => {
  it('P-12 · la ventana de Claude es derivada y sin porcentaje', () => {
    const ahora = new Date('2026-08-24T12:00:00Z');
    const v = ventanaClaude([reg({ ts: '2026-08-24T10:00:00Z', salida: 1e6 })], ahora);
    assert.ok(v);
    assert.equal(v!.cuota.confianza, 'derivado');
    assert.ok(Number.isNaN(v!.cuota.usadoPorCiento));
    assert.equal(v!.minutosRestantes, 180);
    assert.equal(v!.usd, 25);
  });

  it('una ventana cerrada no se muestra', () => {
    const v = ventanaClaude([reg({ ts: '2026-08-24T01:00:00Z' })], new Date('2026-08-24T12:00:00Z'));
    assert.equal(v, undefined);
  });

  it('un hueco de más de cinco horas abre ventana nueva', () => {
    const v = ventanaClaude(
      [reg({ ts: '2026-08-24T01:00:00Z' }), reg({ ts: '2026-08-24T11:30:00Z' })],
      new Date('2026-08-24T12:00:00Z'),
    );
    assert.equal(v!.mensajes, 1);
  });

  it('se queda con la cuota vigente de Codex por ventana', () => {
    const ahora = new Date('2026-08-24T12:00:00Z');
    const c = (pc: number, fin: string, ventana = 10080): Cuota => ({ proveedor: 'codex', usadoPorCiento: pc, ventanaMinutos: ventana, reiniciaEn: fin, confianza: 'exacto' });
    const vigentes = cuotasCodexVigentes(
      [c(10, '2026-08-25T00:00:00Z'), c(40, '2026-08-26T00:00:00Z'), c(90, '2026-08-01T00:00:00Z'), c(5, '2026-08-24T18:00:00Z', 300)],
      ahora,
    );
    assert.equal(vigentes.length, 2);
    assert.equal(vigentes[0].ventanaMinutos, 300);
    assert.equal(vigentes[1].usadoPorCiento, 40);
  });

  it('predice el agotamiento solo si llega antes del reinicio', () => {
    const ahora = new Date('2026-08-24T12:00:00Z');
    const cuota: Cuota = { proveedor: 'codex', usadoPorCiento: 50, ventanaMinutos: 600, reiniciaEn: '2026-08-24T22:00:00Z', confianza: 'exacto' };
    assert.equal(minutosHastaAgotar(cuota, ahora, 60), 60);
    assert.equal(minutosHastaAgotar({ ...cuota, usadoPorCiento: 1 }, ahora, 60), undefined);
    assert.equal(minutosHastaAgotar({ ...cuota, usadoPorCiento: 0 }, ahora, 60), undefined);
  });
});

describe('exportar', () => {
  it('el CSV lleva cabecera con la fecha de tarifas y escapa comas', () => {
    const filas = agregar([reg({ proyecto: 'a,b', salida: 1e6 })], 'proyecto');
    const csv = filasACsv(filas, 'proyecto', '2026-08-24');
    assert.match(csv, /tarifas de 2026-08-24/);
    assert.match(csv, /"a,b"/);
  });

  it('P-13 · la exportación no puede llevar prompts', () => {
    const filas = agregar([reg({ proyecto: 'p', salida: 10 })], 'proyecto');
    const csv = resumenACsv(resumir([reg({ proyecto: 'p', salida: 10 })]), filas, 'proyecto', '2026-08-24');
    assert.ok(!/texto de la respuesta/.test(csv));
    assert.match(csv, /No es la factura de un plan de suscripción/);
  });
});

describe('presupuestos', () => {
  const ahora = new Date(2026, 7, 24);

  it('el mes en curso va del día 1 al último', () => {
    const m = mesDe(ahora);
    assert.equal(m.desde, '2026-08-01');
    assert.equal(m.hasta, '2026-08-31');
  });

  it('avisa con el umbral más alto alcanzado', () => {
    const datos = [reg({ proyecto: 'a', salida: 1e6, ts: '2026-08-10T10:00:00Z' })]; // 25 USD
    const avisos = comprobarPresupuestos(datos, [{ proyecto: 'a', usdMes: 30 }], ahora);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].umbral, 80);
    assert.equal(Math.round(avisos[0].porCiento), 83);
  });

  it('el presupuesto global suma todos los proyectos', () => {
    const datos = [reg({ proyecto: 'a', salida: 1e6, ts: '2026-08-10T10:00:00Z' }), reg({ proyecto: 'b', salida: 1e6, ts: '2026-08-11T10:00:00Z' })];
    const avisos = comprobarPresupuestos(datos, [{ proyecto: '*', usdMes: 40 }], ahora);
    assert.equal(avisos[0].umbral, 100);
  });

  it('sin superar el 50 % no avisa', () => {
    const datos = [reg({ proyecto: 'a', salida: 1e6, ts: '2026-08-10T10:00:00Z' })];
    assert.deepEqual(comprobarPresupuestos(datos, [{ proyecto: 'a', usdMes: 1000 }], ahora), []);
  });

  it('la clave de aviso cambia de mes', () => {
    const aviso = { proyecto: 'a', usd: 1, limite: 1, porCiento: 100, umbral: 100 as const };
    assert.notEqual(claveAviso(aviso, new Date(2026, 7, 1)), claveAviso(aviso, new Date(2026, 8, 1)));
  });
});

describe('0.2.0 · mejoras del panel', () => {
  const datos = [
    reg({ proyecto: 'c:/x/uno', modelo: 'claude-opus-5', salida: 1e6, ts: '2026-08-20T10:00:00Z', rama: 'HEAD', sesion: 's1' }),
    reg({ proyecto: 'c:/x/dos', modelo: 'claude-haiku-4-5', salida: 1e6, ts: '2026-08-21T10:00:00Z', rama: 'main', sesion: 's2' }),
    reg({ proyecto: 'c:/x/uno', modelo: 'claude-opus-5', salida: 1e6, ts: '2026-08-22T10:00:00Z', rama: '', sesion: 's1', subagente: true }),
  ];

  it('P-01 · HEAD no es una rama: cae con las que faltan', () => {
    const filas = agregar(datos, 'rama');
    const sin = filas.find((f) => f.clave === SIN.rama);
    assert.ok(sin, 'debe existir la cubeta de sin rama');
    assert.equal(sin!.mensajes, 2, 'HEAD y la vacía van juntas');
    assert.equal(sinRama(datos), 2);
    assert.ok(filas.some((f) => f.clave === 'main'));
  });

  it('P-02 · los filtros se combinan y se quitan', () => {
    const todo = resumir(datos).usd;
    assert.equal(resumir(datos, { proyecto: 'c:/x/uno' }).usd, 50);
    assert.equal(resumir(datos, { proyecto: 'c:/x/uno', modelo: 'claude-haiku-4-5' }).usd, 0);
    assert.equal(resumir(datos, { sesion: 's2' }).usd, 5);
    assert.equal(resumir(datos, {}).usd, todo, 'sin filtro vuelve el total');
  });

  it('P-02 · el filtro por cliente usa las etiquetas', () => {
    const opciones = { clientes: { 'c:/x/uno': 'Acme' } };
    assert.equal(resumir(datos, { cliente: 'Acme' }, opciones).usd, 50);
    assert.equal(resumir(datos, { cliente: SIN.cliente }, opciones).usd, 5);
  });

  it('P-03 · los patrones de exclusión no se pasan de listos', () => {
    assert.equal(casaPatron('c:/x/uno', 'uno'), true);
    assert.equal(casaPatron('c:/x/uno', 'c:/x/*'), true);
    assert.equal(casaPatron('c:/x/uno', 'c:/y/*'), false);
    assert.equal(casaPatron('c:/x/uno', 'un'), true, 'el texto suelto casa en cualquier parte');
    assert.equal(casaPatron('c:/x/uno', '*/dos'), false);
    assert.equal(casaPatron('c:/x/uno', ''), false);
    assert.equal(resumir(datos, { excluir: ['c:/x/uno'] }).usd, 5);
  });

  it('P-04 · el periodo anterior no se solapa ni deja hueco', () => {
    const p = periodoAnterior({ desde: '2026-08-18', hasta: '2026-08-24' });
    assert.deepEqual([p!.desde, p!.hasta], ['2026-08-11', '2026-08-17']);
    assert.equal(periodoAnterior({ desde: '2026-08-18' }), undefined, 'sin rango cerrado no hay comparación');
    assert.equal(periodoAnterior({}), undefined);
  });

  it('P-04 · el periodo anterior conserva los demás filtros', () => {
    const p = periodoAnterior({ desde: '2026-08-18', hasta: '2026-08-24', proyecto: 'c:/x/uno' });
    assert.equal(p!.proyecto, 'c:/x/uno');
  });

  it('P-05 · las sesiones traen proyecto y fechas, ordenadas por coste', () => {
    const s = sesiones(datos);
    assert.equal(s[0].clave, 's1');
    assert.equal(s[0].usd, 50);
    assert.equal(s[0].proyecto, 'c:/x/uno');
    assert.equal(s[0].desdeDia, '2026-08-20');
    assert.equal(s[0].hastaDia, '2026-08-22');
  });

  it('P-05 · una sesión sin fecha no rompe', () => {
    const s = sesiones([reg({ ts: '', sesion: 'x', salida: 1000 })]);
    assert.equal(s[0].desdeDia, '');
    assert.equal(s[0].mensajes, 1);
  });

  it('P-07 · apagar los subagentes baja el total en lo que suman', () => {
    const con = resumir(datos, { incluirSubagentes: true }).usd;
    const sin = resumir(datos, { incluirSubagentes: false }).usd;
    assert.equal(con - sin, 25);
  });

  it('P-08 · plegar conserva el total al céntimo', () => {
    const filas = agregar(
      [...Array(30)].map((_, i) => reg({ proyecto: 'p' + i, salida: (30 - i) * 1000 })),
      'proyecto',
    );
    const total = filas.reduce((s, f) => s + f.usd, 0);
    const { filas: visibles, otros } = plegar(filas, 1, 8);
    const plegado = visibles.reduce((s, f) => s + f.usd, 0) + (otros?.usd ?? 0);
    assert.ok(Math.abs(total - plegado) < 1e-12, 'no puede perderse ni un céntimo');
    assert.ok(visibles.length <= 8);
    assert.equal(otros!.mensajes + visibles.reduce((s, f) => s + f.mensajes, 0), 30);
  });

  it('P-09 · una tarifa escrita a mano se limpia antes de usarse', () => {
    const t = tarifasValidas({
      bueno: { entrada: 2, salida: 10 },
      texto: { entrada: 'dos', salida: 'diez' },
      negativo: { entrada: -1, salida: -5 },
      medio: { entrada: 3 },
      nulo: null,
    });
    assert.deepEqual(t.bueno, { entrada: 2, salida: 10 });
    assert.equal(t.texto, undefined, 'un texto no es una tarifa');
    assert.equal(t.negativo, undefined);
    assert.deepEqual(t.medio, { entrada: 3, salida: 0 }, 'media tarifa vale: la otra mitad es cero');
    assert.equal(t.nulo, undefined);
    assert.deepEqual(tarifasValidas(undefined), {});
    assert.deepEqual(tarifasValidas('no soy un objeto'), {});
  });

  it('P-08 · sin cola no aparece la fila otros', () => {
    const filas = agregar([reg({ proyecto: 'a', salida: 1e6 })], 'proyecto');
    assert.equal(plegar(filas, 1, 8).otros, undefined);
  });
});
