import type { Fila } from './consulta/agregar';
import type { Resumen } from './consulta/agregar';

/**
 * CSV de agregados. Nunca lleva prompts ni código: solo claves de agrupación y
 * cifras. El separador es la coma y el decimal el punto, para que Excel y
 * cualquier hoja de cálculo lo lean igual.
 */
export function filasACsv(filas: Fila[], eje: string, tarifaFechada: string): string {
  const cabecera = [eje, 'usd', 'tokens', 'mensajes', 'sin_tarifa', 'derivados', 'cache_1h', 'cache_5m'].join(',');
  const cuerpo = filas.map((f) =>
    [
      escapar(f.clave),
      f.usd.toFixed(4),
      f.tokens,
      f.mensajes,
      f.sinTarifa,
      f.derivados,
      f.cacheEscritura1h,
      f.cacheEscritura5m,
    ].join(','),
  );
  return [`# CostKeeper · coste equivalente de API en USD · tarifas de ${tarifaFechada}`, cabecera, ...cuerpo].join('\n') + '\n';
}

/** Resumen mensual para adjuntar a una factura. */
export function resumenACsv(resumen: Resumen, filas: Fila[], eje: string, tarifaFechada: string): string {
  const cabecera = [
    `# CostKeeper · resumen ${resumen.desde} a ${resumen.hasta}`,
    `# Coste equivalente de API en USD, tarifas de ${tarifaFechada}.`,
    '# No es la factura de un plan de suscripción.',
    `# Total,${resumen.usd.toFixed(2)}`,
    `# Mensajes,${resumen.mensajes}`,
    `# Tokens,${resumen.tokens}`,
    resumen.sinTarifa ? `# Mensajes sin tarifa conocida (no contados),${resumen.sinTarifa}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return `${cabecera}\n${filasACsv(filas, eje, tarifaFechada)}`;
}

function escapar(v: string): string {
  return /[",\n]/.test(v) ? `"${v.split('"').join('""')}"` : v;
}
