import path from 'node:path';
import { leerDesde } from './lineas';
import { normalizarProyecto } from '../normalizar';
import type { Acum, Avance, Cuota, Marca, Registro } from '../tipos';

export function raizCodex(home: string): string {
  return path.join(home, '.codex', 'sessions');
}

export function esFicheroCodex(nombre: string): boolean {
  return nombre.startsWith('rollout-') && nombre.endsWith('.jsonl');
}

const CERO: Acum = { entrada: 0, cache: 0, escritura: 0, salida: 0, razon: 0 };

/**
 * Los rollouts llevan imágenes en base64 y salidas de herramientas enormes.
 * Sin este filtro sobre bytes, decodificarlas costaba 38 s de los 47 del
 * indexado completo.
 */
const FILTRO = ['token_count', 'turn_context'] as const;
const FILTRO_META = ['session_meta'] as const;

const sumar = (a: Acum, b: Acum): Acum => ({
  entrada: a.entrada + b.entrada,
  cache: a.cache + b.cache,
  escritura: a.escritura + b.escritura,
  salida: a.salida + b.salida,
  razon: a.razon + b.razon,
});

const tamano = (a: Acum): number => a.entrada + a.salida + a.cache + a.escritura;

/**
 * Lee un rollout de Codex.
 *
 * Los eventos `token_count` traen el consumo ACUMULADO de la sesión: sumarlos
 * multiplica el gasto por el número de eventos (más de cien en una sesión
 * normal). Se usa el último de cada tramo; cuando el acumulado baja, hubo
 * reinicio de contexto y el tramo anterior se cierra y se suma.
 *
 * Se emite un registro por sesión, que sustituye al anterior en el índice en
 * lugar de sumarse a él.
 */
export async function leerRollout(
  ruta: string,
  desde: Marca | undefined,
  stat: { size: number; mtimeMs: number },
  plataforma: NodeJS.Platform = process.platform,
): Promise<Avance> {
  const reiniciar = !desde || stat.size < desde.offset;
  const meta = await leerMeta(ruta);

  let offset = reiniciar ? 0 : desde!.offset;
  let modelo = meta.modelo;
  let ultimo: Acum = reiniciar ? CERO : desde!.codex?.ultimo ?? CERO;
  let base: Acum = reiniciar ? CERO : desde!.codex?.base ?? CERO;
  let cuota: Cuota | undefined;
  let ts = meta.ts;
  let ilegibles = 0;

  for await (const trozo of leerDesde(ruta, offset, FILTRO)) {
    offset = trozo.finOffset;
    if (trozo.linea === undefined) continue;

    let d: any;
    try {
      d = JSON.parse(trozo.linea);
    } catch {
      ilegibles++;
      continue;
    }

    if (d?.type === 'turn_context' && typeof d.payload?.model === 'string') modelo = d.payload.model;
    if (d?.payload?.type !== 'token_count' || !d.payload.info) continue;
    if (typeof d.timestamp === 'string') ts = d.timestamp;

    const t = d.payload.info.total_token_usage ?? {};
    const actual: Acum = {
      entrada: num(t.input_tokens),
      cache: num(t.cached_input_tokens),
      escritura: num(t.cache_write_input_tokens),
      salida: num(t.output_tokens),
      razon: num(t.reasoning_output_tokens),
    };

    if (tamano(actual) < tamano(ultimo)) base = sumar(base, ultimo);
    ultimo = actual;

    const rl = d.payload.rate_limits?.primary;
    if (rl) {
      const resets = Number(rl.resets_at);
      cuota = {
        proveedor: 'codex',
        usadoPorCiento: num(rl.used_percent),
        ventanaMinutos: num(rl.window_minutes),
        reiniciaEn: Number.isFinite(resets) && resets > 0 ? new Date(resets * 1000).toISOString() : '',
        confianza: 'exacto',
        plan: typeof d.payload.rate_limits?.plan_type === 'string' ? d.payload.rate_limits.plan_type : undefined,
      };
    }
  }

  const total = sumar(base, ultimo);
  const registro: Registro = {
    id: `codex:${meta.sesion}`,
    proveedor: 'codex',
    ts,
    proyecto: normalizarProyecto(meta.cwd, plataforma),
    rama: '',
    sesion: meta.sesion,
    subagente: false,
    modelo,
    entrada: total.entrada,
    salida: total.salida,
    cacheLectura: total.cache,
    // Codex no distingue TTL de caché: todo va al multiplicador menor.
    cacheEscritura5m: total.escritura,
    cacheEscritura1h: 0,
    razonamiento: total.razon,
    fuentes: [ruta],
  };

  return {
    registros: tamano(total) > 0 ? [registro] : [],
    ilegibles,
    cuota,
    marca: { ruta, tamano: stat.size, mtimeMs: stat.mtimeMs, offset, codex: { base, ultimo } },
  };
}

/** `session_meta` es la primera línea en todos los rollouts observados. */
async function leerMeta(ruta: string): Promise<{ sesion: string; cwd: string; ts: string; modelo: string }> {
  const porDefecto = { sesion: path.basename(ruta), cwd: '', ts: '', modelo: '(desconocido)' };
  for await (const { linea } of leerDesde(ruta, 0, FILTRO_META)) {
    if (linea === undefined) break;
    try {
      const d = JSON.parse(linea);
      if (d?.type === 'session_meta') {
        const p = d.payload ?? {};
        return {
          sesion: typeof p.session_id === 'string' ? p.session_id : typeof p.id === 'string' ? p.id : porDefecto.sesion,
          cwd: typeof p.cwd === 'string' ? p.cwd : '',
          ts: typeof d.timestamp === 'string' ? d.timestamp : '',
          modelo: typeof p.base_instructions?.provenance?.model === 'string' ? p.base_instructions.provenance.model : porDefecto.modelo,
        };
      }
    } catch {
      /* la primera línea no es legible: se usa el nombre del fichero */
    }
    break;
  }
  return porDefecto;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}
