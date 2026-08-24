import { costeDe, tokensDe, type TarifasExtra } from '../precios/coste';
import type { Proveedor, Registro } from '../tipos';

export type Eje = 'proyecto' | 'modelo' | 'dia' | 'rama' | 'sesion' | 'proveedor' | 'cliente';

/**
 * Marcadores para las claves ausentes. El núcleo no habla ningún idioma: la
 * capa de interfaz los traduce al mostrarlos.
 */
export const SIN = {
  cliente: '(sin-cliente)',
  rama: '(sin-rama)',
  fecha: '(sin-fecha)',
  modelo: '(sin-modelo)',
  sesion: '(sin-sesion)',
  otros: '(otros)',
} as const;

/**
 * Claude Code escribe `HEAD` cuando no consigue resolver una rama —lo hace
 * incluso en repos que están en `main`, cuando la sesión no arrancó dentro del
 * repositorio—. No es una rama: es la falta de dato, y agruparlo con las de
 * verdad sería inventarse el reparto.
 */
export const RAMA_SIN_RESOLVER = 'HEAD';

export interface Filtro {
  /** AAAA-MM-DD inclusive. */
  desde?: string;
  hasta?: string;
  proyecto?: string;
  modelo?: string;
  cliente?: string;
  sesion?: string;
  proveedor?: Proveedor;
  /** false excluye los mensajes de subagentes. */
  incluirSubagentes?: boolean;
  /** Patrones de proyecto a dejar fuera de la vista (nunca del índice). */
  excluir?: readonly string[];
}

export interface Fila {
  clave: string;
  usd: number;
  tokens: number;
  mensajes: number;
  /** Mensajes cuyo modelo no tiene tarifa conocida: no entran en `usd`. */
  sinTarifa: number;
  /** Mensajes cuyo coste es derivado (caché sin desglose de TTL). */
  derivados: number;
  cacheEscritura1h: number;
  cacheEscritura5m: number;
}

export interface Resumen {
  usd: number;
  tokens: number;
  mensajes: number;
  sinTarifa: number;
  derivados: number;
  /** Lo que costaría si toda la escritura de caché se contase a 5 m. */
  usdSinDesgloseCache: number;
  desde: string;
  hasta: string;
}

export interface Opciones {
  tarifasExtra?: TarifasExtra;
  /** proyecto normalizado -> nombre de cliente (función Pro). */
  clientes?: Record<string, string>;
}

export function pasaFiltro(r: Registro, f: Filtro, clientes?: Record<string, string>): boolean {
  const dia = r.ts.slice(0, 10);
  if (f.desde && (!dia || dia < f.desde)) return false;
  if (f.hasta && (!dia || dia > f.hasta)) return false;
  if (f.proyecto && r.proyecto !== f.proyecto) return false;
  if (f.modelo && (r.modelo || SIN.modelo) !== f.modelo) return false;
  if (f.sesion && r.sesion !== f.sesion) return false;
  if (f.cliente && (clientes?.[r.proyecto] ?? SIN.cliente) !== f.cliente) return false;
  if (f.proveedor && r.proveedor !== f.proveedor) return false;
  if (f.incluirSubagentes === false && r.subagente) return false;
  if (f.excluir?.length && f.excluir.some((patron) => casaPatron(r.proyecto, patron))) return false;
  return true;
}

/**
 * Patrón de exclusión sobre una ruta de proyecto.
 *
 * Sin comodines casa la ruta exacta o cualquiera **dentro** de ella: excluir
 * `c:/users/x` no puede llevarse medio panel por coincidir a mitad de otra ruta,
 * que es lo que hacía la comparación por subcadena.
 *
 * Con `*` casa por comodines, y el emparejamiento es lineal a propósito: una
 * expresión regular con muchos `*` tarda decenas de segundos y congela la
 * interfaz (medido: 60 comodines, 56 s).
 */
export function casaPatron(valor: string, patron: string): boolean {
  const p = patron.trim().toLowerCase();
  if (!p) return false;
  const v = valor.toLowerCase();
  if (!p.includes('*')) return v === p || v.startsWith(p.replace(/\/+$/, '') + '/');
  return casaComodines(v, p);
}

/** Emparejamiento con `*` en tiempo lineal: sin retroceso, sin regex. */
function casaComodines(texto: string, patron: string): boolean {
  let t = 0;
  let p = 0;
  let ultimoAsterisco = -1;
  let vueltaT = 0;
  while (t < texto.length) {
    if (p < patron.length && (patron[p] === texto[t])) {
      t++;
      p++;
    } else if (p < patron.length && patron[p] === '*') {
      ultimoAsterisco = p++;
      vueltaT = t;
    } else if (ultimoAsterisco !== -1) {
      p = ultimoAsterisco + 1;
      t = ++vueltaT;
    } else {
      return false;
    }
  }
  while (p < patron.length && patron[p] === '*') p++;
  return p === patron.length;
}

export function claveDe(r: Registro, eje: Eje, clientes?: Record<string, string>): string {
  switch (eje) {
    case 'dia':
      return r.ts.slice(0, 10) || SIN.fecha;
    case 'proyecto':
      return r.proyecto;
    case 'modelo':
      return r.modelo || SIN.modelo;
    case 'rama':
      return !r.rama || r.rama === RAMA_SIN_RESOLVER ? SIN.rama : r.rama;
    case 'proveedor':
      return r.proveedor;
    case 'cliente':
      return clientes?.[r.proyecto] ?? SIN.cliente;
    default:
      return r.sesion || SIN.sesion;
  }
}

export function agregar(registros: Iterable<Registro>, eje: Eje, filtro: Filtro = {}, opciones: Opciones = {}): Fila[] {
  const mapa = new Map<string, Fila>();
  for (const r of registros) {
    if (!pasaFiltro(r, filtro, opciones.clientes)) continue;
    const clave = claveDe(r, eje, opciones.clientes);
    let fila = mapa.get(clave);
    if (!fila) {
      fila = { clave, usd: 0, tokens: 0, mensajes: 0, sinTarifa: 0, derivados: 0, cacheEscritura1h: 0, cacheEscritura5m: 0 };
      mapa.set(clave, fila);
    }
    const c = costeDe(r, opciones.tarifasExtra);
    if (c.usd === null) fila.sinTarifa++;
    else fila.usd += c.usd;
    if (c.confianza === 'derivado') fila.derivados++;
    fila.tokens += tokensDe(r);
    fila.cacheEscritura1h += r.cacheEscritura1h;
    fila.cacheEscritura5m += r.cacheEscritura5m;
    fila.mensajes++;
  }
  return [...mapa.values()].sort((a, b) => b.usd - a.usd || b.tokens - a.tokens || a.clave.localeCompare(b.clave));
}

export function resumir(registros: Iterable<Registro>, filtro: Filtro = {}, opciones: Opciones = {}): Resumen {
  const r: Resumen = { usd: 0, tokens: 0, mensajes: 0, sinTarifa: 0, derivados: 0, usdSinDesgloseCache: 0, desde: '', hasta: '' };
  for (const reg of registros) {
    if (!pasaFiltro(reg, filtro, opciones.clientes)) continue;
    const c = costeDe(reg, opciones.tarifasExtra);
    if (c.usd === null) r.sinTarifa++;
    else r.usd += c.usd;
    if (c.confianza === 'derivado') r.derivados++;
    // Mismo registro contado como si toda la escritura fuese de cinco minutos.
    const ingenuo = costeDe({ ...reg, cacheEscritura5m: reg.cacheEscritura5m + reg.cacheEscritura1h, cacheEscritura1h: 0 }, opciones.tarifasExtra);
    r.usdSinDesgloseCache += ingenuo.usd ?? 0;
    r.tokens += tokensDe(reg);
    r.mensajes++;
    const dia = reg.ts.slice(0, 10);
    if (dia) {
      if (!r.desde || dia < r.desde) r.desde = dia;
      if (!r.hasta || dia > r.hasta) r.hasta = dia;
    }
  }
  return r;
}

/** Serie diaria continua, con ceros en los días sin actividad. */
export function serieDiaria(registros: Iterable<Registro>, filtro: Filtro = {}, opciones: Opciones = {}): { dia: string; usd: number }[] {
  const filas = agregar(registros, 'dia', filtro, opciones).filter((f) => f.clave !== SIN.fecha);
  if (!filas.length) return [];
  const dias = filas.map((f) => f.clave).sort();
  const mapa = new Map(filas.map((f) => [f.clave, f.usd]));
  const salida: { dia: string; usd: number }[] = [];
  const cursor = new Date(`${dias[0]}T00:00:00Z`);
  const fin = new Date(`${dias[dias.length - 1]}T00:00:00Z`);
  while (cursor <= fin) {
    const dia = cursor.toISOString().slice(0, 10);
    salida.push({ dia, usd: mapa.get(dia) ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return salida;
}

/** AAAA-MM-DD de hace `dias` días, para los rangos rápidos del panel. */
export function diaHace(dias: number, ahora: Date = new Date()): string {
  const d = new Date(ahora.getTime());
  d.setDate(d.getDate() - dias);
  return fechaLocal(d);
}

export function fechaLocal(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Una fila que además sabe de dónde salió, para poder enseñar algo legible. */
export interface FilaConMuestra extends Fila {
  proyecto: string;
  desdeDia: string;
  hastaDia: string;
}

/**
 * Sesiones ordenadas por coste. Un identificador de sesión no le dice nada a
 * nadie, así que cada fila lleva su proyecto y sus fechas.
 */
export function sesiones(registros: Iterable<Registro>, filtro: Filtro = {}, opciones: Opciones = {}): FilaConMuestra[] {
  const mapa = new Map<string, FilaConMuestra>();
  for (const r of registros) {
    if (!pasaFiltro(r, filtro, opciones.clientes)) continue;
    const clave = r.sesion || SIN.sesion;
    let fila = mapa.get(clave);
    if (!fila) {
      fila = {
        clave, usd: 0, tokens: 0, mensajes: 0, sinTarifa: 0, derivados: 0,
        cacheEscritura1h: 0, cacheEscritura5m: 0,
        proyecto: r.proyecto, desdeDia: '', hastaDia: '',
      };
      mapa.set(clave, fila);
    }
    const c = costeDe(r, opciones.tarifasExtra);
    if (c.usd === null) fila.sinTarifa++;
    else fila.usd += c.usd;
    if (c.confianza === 'derivado') fila.derivados++;
    fila.tokens += tokensDe(r);
    fila.mensajes++;
    const dia = r.ts.slice(0, 10);
    if (dia) {
      if (!fila.desdeDia || dia < fila.desdeDia) fila.desdeDia = dia;
      if (!fila.hastaDia || dia > fila.hastaDia) fila.hastaDia = dia;
    }
  }
  return [...mapa.values()].sort((a, b) => b.usd - a.usd || b.mensajes - a.mensajes);
}

/**
 * Pliega la cola en una fila «otros». Nunca esconde dinero: lo suma y lo
 * enseña. Se usa solo para mirar; la exportación no pliega jamás.
 */
export function plegar(filas: Fila[], umbralPorCiento: number, tope: number): { filas: Fila[]; otros?: Fila } {
  if (umbralPorCiento <= 0 && filas.length <= tope) return { filas };
  const total = filas.reduce((s, f) => s + f.usd, 0);
  const minimo = (total * umbralPorCiento) / 100;
  const visibles: Fila[] = [];
  const resto: Fila[] = [];
  for (const f of filas) {
    if (visibles.length < tope && f.usd >= minimo) visibles.push(f);
    else resto.push(f);
  }
  if (!resto.length) return { filas: visibles };
  const otros: Fila = {
    clave: SIN.otros,
    usd: resto.reduce((s, f) => s + f.usd, 0),
    tokens: resto.reduce((s, f) => s + f.tokens, 0),
    mensajes: resto.reduce((s, f) => s + f.mensajes, 0),
    sinTarifa: resto.reduce((s, f) => s + f.sinTarifa, 0),
    derivados: resto.reduce((s, f) => s + f.derivados, 0),
    cacheEscritura1h: resto.reduce((s, f) => s + f.cacheEscritura1h, 0),
    cacheEscritura5m: resto.reduce((s, f) => s + f.cacheEscritura5m, 0),
  };
  return { filas: visibles, otros };
}

/**
 * El periodo inmediatamente anterior, de la misma duración y sin solaparse.
 * Sin rango cerrado no hay comparación posible: devuelve undefined en vez de
 * inventarse una ventana.
 */
export function periodoAnterior(f: Filtro): Filtro | undefined {
  if (!f.desde || !f.hasta) return undefined;
  const desde = Date.parse(f.desde + 'T00:00:00Z');
  const hasta = Date.parse(f.hasta + 'T00:00:00Z');
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta < desde) return undefined;
  const dias = Math.round((hasta - desde) / 86400_000) + 1;
  const finPrevio = new Date(desde - 86400_000);
  const iniPrevio = new Date(desde - dias * 86400_000);
  return { ...f, desde: iniPrevio.toISOString().slice(0, 10), hasta: finPrevio.toISOString().slice(0, 10) };
}

/** Mensajes que no traen rama utilizable, para poder decirlo en vez de callarlo. */
export function sinRama(registros: Iterable<Registro>, filtro: Filtro = {}, opciones: Opciones = {}): number {
  let n = 0;
  for (const r of registros) {
    if (!pasaFiltro(r, filtro, opciones.clientes)) continue;
    if (!r.rama || r.rama === RAMA_SIN_RESOLVER) n++;
  }
  return n;
}
