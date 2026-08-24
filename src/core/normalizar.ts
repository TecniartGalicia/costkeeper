/**
 * Identidad de proyecto y de modelo.
 *
 * Sin normalizar, `C:\Users\x` y `c:\Users\x` cuentan como dos proyectos y el
 * gasto sale partido en dos filas. Medido sobre un histórico real: 291 rutas
 * crudas se quedan en 285.
 */

const BARRA_INVERSA = String.fromCharCode(92);

/** En Linux las rutas distinguen mayúsculas; en Windows y macOS, no. */
export function normalizarProyecto(cwd: string, plataforma: NodeJS.Platform = process.platform): string {
  if (!cwd) return '(desconocido)';
  const p = cwd.split(BARRA_INVERSA).join('/').replace(/\/+$/, '');
  if (!p) return '(desconocido)';
  const insensible = plataforma === 'win32' || plataforma === 'darwin';
  return insensible ? p.toLowerCase() : p;
}

/** Nombre corto para mostrar: la última carpeta de la ruta. */
export function nombreCortoProyecto(proyecto: string): string {
  if (!proyecto || proyecto === '(desconocido)') return proyecto;
  const partes = proyecto.split('/').filter(Boolean);
  return partes[partes.length - 1] ?? proyecto;
}

/** Quita sufijos que no cambian la tarifa: variante de contexto y fecha. */
export function normalizarModelo(modelo: string): string {
  return (modelo || '')
    .replace(/\[1m\]$/, '')
    .replace(/-\d{8}$/, '')
    .trim();
}
