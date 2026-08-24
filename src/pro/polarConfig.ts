/**
 * CostKeeper es GRATIS por ahora: `PRO_ACTIVO` en false regala todas las
 * funciones de pago y esconde los comandos de licencia. El código de licencias
 * se conserva entero; para volver a cobrar basta con poner el interruptor a
 * true y rellenar la organización y la URL de compra.
 */
export const PRO_ACTIVO = false;

/**
 * Configuración de Polar (merchant of record) para CostKeeper Pro.
 *
 * Se rellena cuando existan la organización y el producto en Polar
 * (docs/TUS-TAREAS.md, bloque B). Mientras esté vacío, la activación responde
 * «no configurado» y las funciones Pro enseñan el aviso sin enlace de compra.
 * El flujo de publicación rechaza publicar con esto vacío si el README anuncia Pro.
 */
export const POLAR_ORGANIZATION_ID = '';
export const POLAR_CHECKOUT_URL = '';
export const PRO_PRICE_LABEL = '9 €';
export const PRO_INFO_URL = 'https://github.com/TecniartGalicia/costkeeper#pro';

/** Variable de entorno para desarrollo y CI: desbloquea Pro sin red. */
export const DEV_UNLOCK_ENV = 'COSTKEEPER_PRO_DEV';

export function polarConfigured(): boolean {
  return POLAR_ORGANIZATION_ID.trim().length > 0;
}
