import fs from 'node:fs';

export interface Trozo {
  /** undefined cuando la línea no pasó el filtro y no llegó a materializarse. */
  linea: string | undefined;
  /** Offset en bytes justo detrás del salto de línea que cierra esta línea. */
  finOffset: number;
}

const SALTO = 0x0a;

/**
 * Lee desde `desde` —que debe caer justo detrás de un salto de línea— y
 * devuelve cada línea con el offset en BYTES donde termina.
 *
 * Tres decisiones que parecen detalles y no lo son:
 *
 * 1. No usa `readline`: descarta el retorno de carro de CRLF, así que el offset
 *    acumulado queda un byte corto por línea y la reanudación cae dentro de la
 *    línea anterior. Aquí el retorno de carro queda dentro de la línea, que
 *    `JSON.parse` tolera.
 * 2. Los trozos pendientes se acumulan en una lista y solo se concatenan cuando
 *    la línea está completa. Concatenar en cada trozo es cuadrático, y estos
 *    ficheros traen líneas de decenas de MB (imágenes en base64, salidas de
 *    herramientas): con `Buffer.concat` por trozo, leer 1,7 GB de rollouts de
 *    Codex costaba 37 s; así, poco más de un segundo.
 * 3. `contiene` filtra sobre los bytes: una línea que no lleva ninguna de esas
 *    agujas no se concatena ni se convierte a texto. Se entrega igual, sin
 *    texto, para que la marca de agua avance.
 *
 * La cola sin salto final no se entrega: está a medio escribir y se recuperará
 * entera en la siguiente pasada.
 */
export async function* leerDesde(ruta: string, desde = 0, contiene?: readonly string[]): AsyncGenerator<Trozo> {
  const agujas = contiene?.map((c) => Buffer.from(c, 'utf8'));
  const solape = agujas ? Math.max(...agujas.map((a) => a.length)) - 1 : 0;

  const flujo = fs.createReadStream(ruta, { start: desde });
  let pendientes: Buffer[] = [];
  let pendienteBytes = 0;
  let interesa = !agujas;
  /** Últimos bytes del fragmento anterior, por si una aguja cae en la frontera. */
  let borde: Buffer = Buffer.alloc(0);
  let offset = desde;

  const mirar = (b: Buffer): void => {
    if (interesa || !agujas) return;
    const conBorde = borde.length ? Buffer.concat([borde, b]) : b;
    if (agujas.some((a) => conBorde.includes(a))) interesa = true;
    else if (solape > 0) borde = conBorde.subarray(Math.max(0, conBorde.length - solape));
  };

  const cerrarLinea = (ultimo: Buffer, hasta: number): Trozo => {
    const cacho = ultimo.subarray(0, hasta);
    mirar(cacho);
    offset += pendienteBytes + hasta + 1;
    const linea = interesa ? (pendientes.length ? Buffer.concat([...pendientes, cacho]) : cacho).toString('utf8') : undefined;
    pendientes = [];
    pendienteBytes = 0;
    interesa = !agujas;
    borde = Buffer.alloc(0);
    return { linea, finOffset: offset };
  };

  try {
    for await (const trozo of flujo as AsyncIterable<Buffer>) {
      let buf = trozo;
      let i: number;
      while ((i = buf.indexOf(SALTO)) !== -1) {
        yield cerrarLinea(buf, i);
        buf = buf.subarray(i + 1);
      }
      if (buf.length) {
        mirar(buf);
        // Se guarda siempre la referencia (no copia): la aguja puede aparecer en
        // el último fragmento de una línea, y entonces harían falta los de antes.
        pendientes.push(buf);
        pendienteBytes += buf.length;
      }
    }
  } finally {
    flujo.destroy();
  }
}
