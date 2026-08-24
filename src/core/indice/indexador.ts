import fs from 'node:fs/promises';
import path from 'node:path';
import { esFicheroClaude, leerFichero, raizClaude } from '../lectores/claude';
import { esFicheroCodex, leerRollout, raizCodex } from '../lectores/codex';
import type { Cuota, EstadisticasIndexado, Registro } from '../tipos';
import type { Indice } from './almacen';

export type Progreso = (hechos: number, total: number, fichero: string) => void;

export interface OpcionesIndexado {
  home: string;
  /** Carpetas adicionales de transcripts, de los ajustes. */
  extra?: string[];
  progreso?: Progreso;
  cancelado?: () => boolean;
  plataforma?: NodeJS.Platform;
  ahora?: () => number;
}

export interface ResultadoIndexado extends EstadisticasIndexado {
  cuotas: Cuota[];
}

interface Objetivo {
  fichero: string;
  tipo: 'claude' | 'codex';
}

export async function indexar(ind: Indice, opciones: OpcionesIndexado): Promise<ResultadoIndexado> {
  const { home, progreso, cancelado, extra = [] } = opciones;
  const plataforma = opciones.plataforma ?? process.platform;
  const reloj = opciones.ahora ?? (() => Date.now());
  const t0 = reloj();

  const objetivos: Objetivo[] = [];
  for (const raiz of [raizClaude(home), ...extra]) {
    for (const f of await listar(raiz, esFicheroClaude)) objetivos.push({ fichero: f, tipo: 'claude' });
  }
  for (const f of await listar(raizCodex(home), esFicheroCodex)) objetivos.push({ fichero: f, tipo: 'codex' });

  let leidos = 0;
  let ilegibles = 0;
  let hechos = 0;
  const cuotas: Cuota[] = [];

  for (const { fichero, tipo } of objetivos) {
    if (cancelado?.()) {
      return { ficheros: objetivos.length, leidos, ilegibles, registros: ind.registros.size, cancelado: true, ms: reloj() - t0, cuotas };
    }
    progreso?.(++hechos, objetivos.length, fichero);

    let stat;
    try {
      stat = await fs.stat(fichero);
    } catch {
      continue; // borrado a media pasada
    }

    const marca = ind.marcas.get(fichero);
    if (marca && marca.tamano === stat.size && marca.mtimeMs === stat.mtimeMs) continue;

    // Reescrito o truncado: la marca ya no vale y sus registros tampoco.
    if (marca && stat.size < marca.offset) purgarFuente(ind, fichero);

    try {
      const avance =
        tipo === 'claude'
          ? await leerFichero(fichero, marca, stat, plataforma)
          : await leerRollout(fichero, marca, stat, plataforma);
      ilegibles += avance.ilegibles;
      for (const r of avance.registros) fundir(ind, r);
      if (avance.cuota) cuotas.push(avance.cuota);
      ind.marcas.set(fichero, avance.marca);
      leidos++;
    } catch {
      // Un fichero ilegible (permisos, bloqueo) no puede parar el indexado.
      continue;
    }
  }

  purgarDesaparecidos(ind, new Set(objetivos.map((o) => o.fichero)));

  return { ficheros: objetivos.length, leidos, ilegibles, registros: ind.registros.size, cancelado: false, ms: reloj() - t0, cuotas };
}

/**
 * Un id es un cobro. Entre apariciones del mismo mensaje gana la de mayor
 * salida; a igualdad, la de mayor entrada total. Los registros de Codex se
 * recalculan enteros, así que siempre sustituyen.
 */
export function fundir(ind: Indice, r: Registro): void {
  const previo = ind.registros.get(r.id);
  if (!previo) {
    ind.registros.set(r.id, r);
    return;
  }
  if (r.proveedor === 'codex') {
    ind.registros.set(r.id, r);
    return;
  }
  const mayorSalida = r.salida > previo.salida;
  const igualSalida = r.salida === previo.salida && entradaTotal(r) > entradaTotal(previo);
  if (mayorSalida || igualSalida) ind.registros.set(r.id, r);
}

const entradaTotal = (r: Registro): number => r.entrada + r.cacheLectura + r.cacheEscritura5m + r.cacheEscritura1h;

export function purgarFuente(ind: Indice, ruta: string): void {
  for (const [id, r] of ind.registros) if (r.fuente === ruta) ind.registros.delete(id);
}

/** Ficheros que ya no existen: fuera sus registros y su marca. */
function purgarDesaparecidos(ind: Indice, vivos: Set<string>): void {
  for (const ruta of [...ind.marcas.keys()]) {
    if (!vivos.has(ruta)) {
      purgarFuente(ind, ruta);
      ind.marcas.delete(ruta);
    }
  }
}

export async function listar(raiz: string, acepta: (nombre: string) => boolean): Promise<string[]> {
  const salida: string[] = [];
  const pila = [raiz];
  while (pila.length) {
    const dir = pila.pop()!;
    let entradas;
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      // Nada de `e.parentPath` ni `e.path`: no están en todos los Node que
      // embarca VS Code. El directorio ya lo tenemos aquí.
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pila.push(p);
      else if (e.isFile() && acepta(e.name)) salida.push(p);
    }
  }
  return salida;
}
