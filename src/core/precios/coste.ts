import tarifas from './tarifas.json';
import type { Coste, Registro } from '../tipos';

export interface Tarifa {
  entrada: number;
  salida: number;
}

export const FECHA_TARIFAS: string = tarifas.fecha;
export const MULTIPLICADORES = tarifas.multiplicadoresCache;

const MODELOS = tarifas.modelos as Record<string, Tarifa>;

/** Tarifas extra puestas por el usuario en los ajustes, p. ej. para Codex. */
export type TarifasExtra = Record<string, Tarifa>;

export function tarifaDe(modelo: string, extra?: TarifasExtra): Tarifa | undefined {
  const propia = extra?.[modelo];
  if (propia && typeof propia.entrada === 'number' && typeof propia.salida === 'number') return propia;
  return MODELOS[modelo];
}

/**
 * Coste equivalente de API. No es la factura de un plan de suscripción, y la
 * interfaz nunca debe presentarlo como tal.
 *
 * Los tokens de razonamiento ya están dentro de `salida`: sumarlos aparte
 * volvería a inflar la cifra.
 */
export function costeDe(r: Registro, extra?: TarifasExtra): Coste {
  const t = tarifaDe(r.modelo, extra);
  if (!t) return { usd: null, confianza: 'estimado', tarifaFechada: FECHA_TARIFAS };

  const m = MULTIPLICADORES;
  const usd =
    (r.entrada * t.entrada +
      r.cacheLectura * t.entrada * m.lectura +
      r.cacheEscritura5m * t.entrada * m.escritura5m +
      r.cacheEscritura1h * t.entrada * m.escritura1h +
      r.salida * t.salida) /
    1e6;

  return {
    usd,
    confianza: r.cacheDerivada ? 'derivado' : 'exacto',
    tarifaFechada: FECHA_TARIFAS,
  };
}

/** Tokens totales de un registro, para mostrar volumen junto al coste. */
export function tokensDe(r: Registro): number {
  return r.entrada + r.salida + r.cacheLectura + r.cacheEscritura5m + r.cacheEscritura1h;
}

/** Lista de modelos con tarifa conocida, para el panel de ajustes. */
export function modelosConTarifa(): string[] {
  return Object.keys(MODELOS).sort();
}
