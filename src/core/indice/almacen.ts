import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { promisify } from 'node:util';
import type { Marca, Registro } from '../tipos';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/** Subir esta versión fuerza reconstrucción del índice. */
export const VERSION_INDICE = 2;

export const FICHERO_REGISTROS = 'registros.ndjson.gz';
export const FICHERO_MARCAS = 'marcas.json';

export interface Indice {
  version: number;
  registros: Map<string, Registro>;
  marcas: Map<string, Marca>;
}

export function indiceVacio(): Indice {
  return { version: VERSION_INDICE, registros: new Map(), marcas: new Map() };
}

/**
 * No hace falta base de datos: el índice completo de un histórico de un año son
 * unos pocos MB comprimidos y carga en centésimas. Un módulo nativo obligaría a
 * compilar por plataforma y por ABI de Electron a cambio de nada.
 */
export async function cargar(dir: string): Promise<Indice> {
  try {
    const marcasCrudas = await fs.readFile(path.join(dir, FICHERO_MARCAS), 'utf8');
    const m = JSON.parse(marcasCrudas);
    if (m?.version !== VERSION_INDICE) return indiceVacio();

    const datos = await fs.readFile(path.join(dir, FICHERO_REGISTROS));
    const texto = (await gunzip(datos)).toString('utf8');
    const registros = new Map<string, Registro>();
    for (const linea of texto.split('\n')) {
      if (!linea) continue;
      try {
        const r = JSON.parse(linea) as Registro;
        if (r && typeof r.id === 'string') registros.set(r.id, r);
      } catch {
        /* una fila suelta ilegible no invalida el índice entero */
      }
    }
    return { version: VERSION_INDICE, registros, marcas: new Map(Object.entries(m.marcas ?? {})) };
  } catch {
    return indiceVacio();
  }
}

/** Escritura atómica: un fallo a media escritura no puede dejar el índice roto. */
export async function guardar(dir: string, ind: Indice): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const texto = [...ind.registros.values()].map((r) => JSON.stringify(r)).join('\n');
  const comprimido = await gzip(Buffer.from(texto, 'utf8'), { level: 6 });

  const tmpReg = path.join(dir, `${FICHERO_REGISTROS}.${process.pid}.tmp`);
  await fs.writeFile(tmpReg, comprimido);
  await fs.rename(tmpReg, path.join(dir, FICHERO_REGISTROS));

  const tmpMar = path.join(dir, `${FICHERO_MARCAS}.${process.pid}.tmp`);
  await fs.writeFile(tmpMar, JSON.stringify({ version: VERSION_INDICE, marcas: Object.fromEntries(ind.marcas) }), 'utf8');
  await fs.rename(tmpMar, path.join(dir, FICHERO_MARCAS));
}

export async function borrar(dir: string): Promise<void> {
  await Promise.all([
    fs.rm(path.join(dir, FICHERO_REGISTROS), { force: true }),
    fs.rm(path.join(dir, FICHERO_MARCAS), { force: true }),
  ]);
}
