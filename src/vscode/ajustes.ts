import * as vscode from 'vscode';
import type { TarifasExtra } from '../core/precios/coste';

export const SECCION = 'costkeeper';

export interface Ajustes {
  rutasExtra: string[];
  moneda: 'USD' | 'EUR';
  cambioEurUsd: number;
  tarifasExtra: TarifasExtra;
  barraDeEstado: boolean;
  indexarAlAbrir: boolean;
}

export function leerAjustes(): Ajustes {
  const c = vscode.workspace.getConfiguration(SECCION);
  return {
    rutasExtra: (c.get<string[]>('rutasExtra') ?? []).filter((r) => typeof r === 'string' && r.trim().length > 0),
    moneda: c.get<'USD' | 'EUR'>('moneda') === 'EUR' ? 'EUR' : 'USD',
    cambioEurUsd: numeroPositivo(c.get<number>('cambioEurUsd')),
    tarifasExtra: tarifasValidas(c.get<Record<string, unknown>>('tarifasExtra')),
    barraDeEstado: c.get<boolean>('barraDeEstado') ?? true,
    indexarAlAbrir: c.get<boolean>('indexarAlAbrir') ?? true,
  };
}

/** Una tarifa mal escrita en los ajustes no puede tumbar el panel. */
function tarifasValidas(crudas: Record<string, unknown> | undefined): TarifasExtra {
  const salida: TarifasExtra = {};
  for (const [modelo, valor] of Object.entries(crudas ?? {})) {
    const v = valor as { entrada?: unknown; salida?: unknown };
    const entrada = numeroPositivo(v?.entrada);
    const sal = numeroPositivo(v?.salida);
    if (entrada > 0 || sal > 0) salida[modelo] = { entrada, salida: sal };
  }
  return salida;
}

function numeroPositivo(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * Conversión a la moneda elegida. Sin cambio configurado se queda en dólares:
 * inventar un tipo de cambio sería el mismo error que inventar una tarifa.
 */
export function formatearImporte(usd: number, ajustes: Ajustes, decimales?: number, idioma = 'es-ES'): string {
  const usarEuros = ajustes.moneda === 'EUR' && ajustes.cambioEurUsd > 0;
  const valor = usarEuros ? usd * ajustes.cambioEurUsd : usd;
  const moneda = usarEuros ? 'EUR' : 'USD';
  const d = decimales ?? decimalesPara(Math.abs(valor));
  return new Intl.NumberFormat(idioma, { style: 'currency', currency: moneda, maximumFractionDigits: d, minimumFractionDigits: d }).format(valor);
}

/**
 * Los decimales se eligen una vez por vista, con la cifra mayor: una columna que
 * mezcla «$812» y «$92,00» se lee mal.
 */
export function decimalesPara(mayor: number): number {
  if (mayor >= 100) return 0;
  if (mayor >= 1) return 2;
  return 4;
}
