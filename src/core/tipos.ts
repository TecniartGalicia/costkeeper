/** Contrato común a los dos proveedores. Ver docs/PLAN.md §4. */

export type Proveedor = 'claude' | 'codex';

/**
 * Un cobro. La unidad es el mensaje, no la línea del fichero: un mensaje con
 * varios bloques se escribe varias veces con el mismo `usage`, y `--resume`,
 * los forks y los worktrees lo copian entre ficheros.
 *
 * No contiene ningún campo de texto libre: ni prompts, ni respuestas, ni
 * nombres de fichero editados. Lo más sensible es la ruta del proyecto.
 */
export interface Registro {
  id: string;
  proveedor: Proveedor;
  /** ISO 8601. */
  ts: string;
  /** cwd normalizado. */
  proyecto: string;
  rama: string;
  sesion: string;
  subagente: boolean;
  modelo: string;
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura5m: number;
  cacheEscritura1h: number;
  /** Informativo: ya está incluido en `salida`, nunca se suma aparte. */
  razonamiento: number;
  /** Fichero del que salió, para poder purgarlo si se reescribe. */
  fuente: string;
  /** true cuando el desglose de caché por TTL no venía y se imputó a 5 m. */
  cacheDerivada?: boolean;
}

export type Confianza = 'exacto' | 'derivado' | 'estimado';

export interface Coste {
  /** null = no hay tarifa conocida para ese modelo. */
  usd: number | null;
  confianza: Confianza;
  tarifaFechada: string;
}

export interface Cuota {
  proveedor: Proveedor;
  /** NaN cuando no se puede conocer (Claude). */
  usadoPorCiento: number;
  ventanaMinutos: number;
  /** ISO. */
  reiniciaEn: string;
  confianza: Confianza;
  plan?: string;
}

export interface Acum {
  entrada: number;
  cache: number;
  escritura: number;
  salida: number;
  razon: number;
}

/** Marca de agua por fichero: permite releer solo la cola. */
export interface Marca {
  ruta: string;
  tamano: number;
  mtimeMs: number;
  /** Byte siguiente al último salto de línea procesado. */
  offset: number;
  /** Solo Codex: estado acumulado, sin el cual reanudar pierde tramos. */
  codex?: { base: Acum; ultimo: Acum };
}

export interface Avance {
  registros: Registro[];
  marca: Marca;
  ilegibles: number;
  cuota?: Cuota;
}

export interface EstadisticasIndexado {
  ficheros: number;
  leidos: number;
  ilegibles: number;
  registros: number;
  cancelado: boolean;
  ms: number;
}
