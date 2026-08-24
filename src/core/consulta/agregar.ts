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
} as const;

export interface Filtro {
  /** AAAA-MM-DD inclusive. */
  desde?: string;
  hasta?: string;
  proyecto?: string;
  proveedor?: Proveedor;
  /** false excluye los mensajes de subagentes. */
  incluirSubagentes?: boolean;
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

export function pasaFiltro(r: Registro, f: Filtro): boolean {
  const dia = r.ts.slice(0, 10);
  if (f.desde && (!dia || dia < f.desde)) return false;
  if (f.hasta && (!dia || dia > f.hasta)) return false;
  if (f.proyecto && r.proyecto !== f.proyecto) return false;
  if (f.proveedor && r.proveedor !== f.proveedor) return false;
  if (f.incluirSubagentes === false && r.subagente) return false;
  return true;
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
      return r.rama || SIN.rama;
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
    if (!pasaFiltro(r, filtro)) continue;
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
    if (!pasaFiltro(reg, filtro)) continue;
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
