import type { Filtro } from './consulta/agregar';

/** Días de histórico consultables sin licencia. Los datos no se borran nunca. */
export const DIAS_GRATIS = 30;

/**
 * El corte del plan gratuito se aplica en la consulta, no en el índice: al
 * activar la licencia el histórico vuelve a verse entero. Nunca amplía un
 * rango que el usuario haya pedido más corto.
 */
export function recorteGratis(filtro: Filtro, pro: boolean, ahora: Date): Filtro {
  if (pro) return filtro;
  const limite = new Date(ahora.getTime() - DIAS_GRATIS * 86400_000).toISOString().slice(0, 10);
  const desde = filtro.desde && filtro.desde > limite ? filtro.desde : limite;
  return { ...filtro, desde };
}
