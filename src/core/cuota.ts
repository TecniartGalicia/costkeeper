import { costeDe } from './precios/coste';
import type { Cuota, Registro } from './tipos';

export const VENTANA_CLAUDE_MIN = 300;

export interface VentanaClaude {
  cuota: Cuota;
  inicio: string;
  mensajes: number;
  usd: number;
  minutosRestantes: number;
}

/**
 * Claude Code no guarda sus límites en los transcripts. La ventana se
 * reconstruye: se abre con el primer mensaje que llega tras un hueco de cinco
 * horas y dura cinco horas.
 *
 * `usadoPorCiento` queda NaN a propósito: el porcentaje consumido no se puede
 * conocer, y la interfaz enseña tiempo restante en vez de inventar una cifra.
 */
export function ventanaClaude(registros: Iterable<Registro>, ahora: Date): VentanaClaude | undefined {
  const claude: { t: number; r: Registro }[] = [];
  for (const r of registros) {
    if (r.proveedor !== 'claude' || !r.ts) continue;
    const t = Date.parse(r.ts);
    if (Number.isFinite(t)) claude.push({ t, r });
  }
  if (!claude.length) return undefined;
  claude.sort((a, b) => a.t - b.t);

  let inicio = claude[0].t;
  for (const { t } of claude) {
    if (t - inicio > VENTANA_CLAUDE_MIN * 60_000) inicio = t;
  }
  const fin = inicio + VENTANA_CLAUDE_MIN * 60_000;
  if (fin < ahora.getTime()) return undefined; // no hay ventana abierta

  let mensajes = 0;
  let usd = 0;
  for (const { t, r } of claude) {
    if (t < inicio) continue;
    mensajes++;
    usd += costeDe(r).usd ?? 0;
  }

  return {
    cuota: {
      proveedor: 'claude',
      usadoPorCiento: Number.NaN,
      ventanaMinutos: VENTANA_CLAUDE_MIN,
      reiniciaEn: new Date(fin).toISOString(),
      confianza: 'derivado',
    },
    inicio: new Date(inicio).toISOString(),
    mensajes,
    usd,
    minutosRestantes: Math.max(0, Math.round((fin - ahora.getTime()) / 60_000)),
  };
}

/** De todas las cuotas leídas de Codex se queda la más reciente por ventana. */
export function cuotasCodexVigentes(cuotas: Cuota[], ahora: Date): Cuota[] {
  const porVentana = new Map<number, Cuota>();
  for (const c of cuotas) {
    if (c.proveedor !== 'codex' || !c.reiniciaEn) continue;
    const fin = Date.parse(c.reiniciaEn);
    if (!Number.isFinite(fin) || fin < ahora.getTime()) continue;
    const previa = porVentana.get(c.ventanaMinutos);
    if (!previa || Date.parse(previa.reiniciaEn) < fin) porVentana.set(c.ventanaMinutos, c);
  }
  return [...porVentana.values()].sort((a, b) => a.ventanaMinutos - b.ventanaMinutos);
}

/**
 * Predicción de agotamiento (función Pro): a este ritmo, cuántos minutos
 * quedan hasta el 100 %. Devuelve undefined si no hay ritmo medible o si la
 * ventana se reinicia antes.
 */
export function minutosHastaAgotar(cuota: Cuota, ahora: Date, transcurridosMin: number): number | undefined {
  if (!Number.isFinite(cuota.usadoPorCiento) || cuota.usadoPorCiento <= 0 || transcurridosMin <= 0) return undefined;
  const ritmo = cuota.usadoPorCiento / transcurridosMin; // % por minuto
  if (ritmo <= 0) return undefined;
  const restante = (100 - cuota.usadoPorCiento) / ritmo;
  const hastaReinicio = (Date.parse(cuota.reiniciaEn) - ahora.getTime()) / 60_000;
  if (!Number.isFinite(restante) || restante < 0) return undefined;
  return Number.isFinite(hastaReinicio) && restante > hastaReinicio ? undefined : Math.round(restante);
}
