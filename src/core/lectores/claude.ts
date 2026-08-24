import path from 'node:path';
import { leerDesde } from './lineas';
import { normalizarModelo, normalizarProyecto } from '../normalizar';
import type { Avance, Marca, Registro } from '../tipos';

export function raizClaude(home: string): string {
  return path.join(home, '.claude', 'projects');
}

export function esFicheroClaude(nombre: string): boolean {
  return nombre.endsWith('.jsonl');
}

/** Solo las líneas de consumo llegan a convertirse en texto. */
const FILTRO = ['"usage"'] as const;

/**
 * Lee un transcript de Claude Code.
 *
 * Ninguna clave es obligatoria: un formato que cambie deja de aportar datos,
 * pero nunca rompe la lectura. `ilegibles` cuenta solo las líneas que contienen
 * `usage` y no parsean; las demás las descarta el filtro previo, que es lo que
 * hace la lectura rápida.
 */
export async function leerFichero(
  ruta: string,
  desde: Marca | undefined,
  stat: { size: number; mtimeMs: number },
  plataforma: NodeJS.Platform = process.platform,
): Promise<Avance> {
  const reiniciar = !desde || stat.size < desde.offset;
  const inicio = reiniciar ? 0 : desde!.offset;

  const registros: Registro[] = [];
  let ilegibles = 0;
  let offset = inicio;

  for await (const { linea, finOffset } of leerDesde(ruta, inicio, FILTRO)) {
    offset = finOffset;
    if (linea === undefined) continue;

    let d: any;
    try {
      d = JSON.parse(linea);
    } catch {
      ilegibles++;
      continue;
    }

    const u = d?.message?.usage;
    const id = d?.message?.id;
    if (!u || typeof id !== 'string' || !id) continue;

    const cc = u.cache_creation ?? {};
    const tiene1h = typeof cc.ephemeral_1h_input_tokens === 'number';
    const tiene5m = typeof cc.ephemeral_5m_input_tokens === 'number';
    const agregado = num(u.cache_creation_input_tokens);

    registros.push({
      id,
      proveedor: 'claude',
      ts: typeof d.timestamp === 'string' ? d.timestamp : '',
      proyecto: normalizarProyecto(typeof d.cwd === 'string' ? d.cwd : '', plataforma),
      rama: typeof d.gitBranch === 'string' ? d.gitBranch : '',
      sesion: typeof d.sessionId === 'string' ? d.sessionId : '',
      subagente: Boolean(d.isSidechain),
      modelo: normalizarModelo(typeof d.message.model === 'string' ? d.message.model : ''),
      entrada: num(u.input_tokens),
      salida: num(u.output_tokens),
      cacheLectura: num(u.cache_read_input_tokens),
      // Sin desglose por TTL se imputa al precio menor (5 m) y se marca derivado.
      cacheEscritura5m: tiene5m ? num(cc.ephemeral_5m_input_tokens) : tiene1h ? 0 : agregado,
      cacheEscritura1h: tiene1h ? num(cc.ephemeral_1h_input_tokens) : 0,
      razonamiento: num(u.output_tokens_details?.thinking_tokens),
      fuentes: [ruta],
      ...(!tiene5m && !tiene1h && agregado > 0 ? { cacheDerivada: true } : {}),
    });
  }

  return {
    registros,
    ilegibles,
    marca: { ruta, tamano: stat.size, mtimeMs: stat.mtimeMs, offset },
  };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
