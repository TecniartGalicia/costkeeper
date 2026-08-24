import { agregar, type Filtro, type Opciones } from './consulta/agregar';
import type { Registro } from './tipos';

export interface Presupuesto {
  /** Proyecto normalizado, o '*' para el total de la máquina. */
  proyecto: string;
  /** Límite mensual en USD de coste equivalente. */
  usdMes: number;
}

export type Umbral = 50 | 80 | 100;

export interface AvisoPresupuesto {
  proyecto: string;
  usd: number;
  limite: number;
  porCiento: number;
  umbral: Umbral;
}

const UMBRALES: Umbral[] = [100, 80, 50];

/** Mes natural en curso, en hora local, como par de fechas AAAA-MM-DD. */
export function mesDe(ahora: Date): { desde: string; hasta: string } {
  const y = ahora.getFullYear();
  const m = String(ahora.getMonth() + 1).padStart(2, '0');
  const ultimo = new Date(y, ahora.getMonth() + 1, 0).getDate();
  return { desde: `${y}-${m}-01`, hasta: `${y}-${m}-${String(ultimo).padStart(2, '0')}` };
}

/**
 * Devuelve un aviso por presupuesto superado, con el umbral más alto alcanzado.
 * Quién ya fue avisado de qué lo decide la capa de VS Code, para no repetir el
 * mismo aviso cada vez que se reindexa.
 */
export function comprobarPresupuestos(
  registros: Iterable<Registro>,
  presupuestos: Presupuesto[],
  ahora: Date,
  opciones: Opciones = {},
): AvisoPresupuesto[] {
  if (!presupuestos.length) return [];
  const mes = mesDe(ahora);
  const avisos: AvisoPresupuesto[] = [];
  const lista = [...registros];

  for (const p of presupuestos) {
    if (!(p.usdMes > 0)) continue;
    const filtro: Filtro = { desde: mes.desde, hasta: mes.hasta };
    if (p.proyecto !== '*') filtro.proyecto = p.proyecto;
    const filas = agregar(lista, p.proyecto === '*' ? 'proveedor' : 'proyecto', filtro, opciones);
    const usd = filas.reduce((s, f) => s + f.usd, 0);
    const porCiento = (usd / p.usdMes) * 100;
    const umbral = UMBRALES.find((u) => porCiento >= u);
    if (umbral) avisos.push({ proyecto: p.proyecto, usd, limite: p.usdMes, porCiento, umbral });
  }
  return avisos;
}

/** Clave estable para no repetir un aviso ya mostrado este mes. */
export function claveAviso(a: AvisoPresupuesto, ahora: Date): string {
  const { desde } = mesDe(ahora);
  return `${desde}|${a.proyecto}|${a.umbral}`;
}
