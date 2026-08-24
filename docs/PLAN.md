# 12. CostKeeper — Plan de ejecución auditado

Complemento de implementación de [12-costkeeper.md](12-costkeeper.md)
Argalla · Tecniart Galicia, S.L. · 24 de agosto de 2026

Este documento no repite la especificación funcional. Cierra las decisiones donde equivocarse obliga a rehacer trabajo, fija el código de esos puntos, y termina con una tabla que asocia cada riesgo a la prueba concreta que lo cierra.

El proceso general —repo, CI, tiendas, cuentas, lanzamiento— es el de [GUIA-EXTENSION-VSCODE-COMPLETA.md](GUIA-EXTENSION-VSCODE-COMPLETA.md) y no se duplica aquí.

Convenciones:

- **[medido]** comprobado empíricamente sobre datos reales el 24 de agosto de 2026, con la sonda que se indica.
- **[verificado]** confirmado contra documentación oficial en la fecha del documento.
- **[F1]** hay que resolverlo al escribir el núcleo; el plan fija cómo.

**Estimación:** 3–4 semanas de trabajo efectivo hasta publicada en las dos tiendas con Pro operativo. No hay backend, ni app, ni panel web, y las plantillas de CI, licencia y l10n están probadas en cuatro extensiones.

---

## 1. La Fase 0 ya está hecha, y cambió el plan

Se ejecutaron seis sondas sobre el histórico real de la máquina de trabajo: 760 ficheros y 2,52 GB de Claude Code, 64 rollouts de Codex. Los resultados no son un anexo: tres de ellos cambiaron decisiones de diseño.

| Sonda | Qué preguntaba | Resultado |
|---|---|---|
| S-1 | ¿Hay tokens exactos por mensaje en Claude Code? | Sí: entrada, salida, lectura de caché, escritura de caché **separada en 1 h y 5 m**, thinking, herramientas de servidor. Y `cwd`, `gitBranch`, `sessionId`, `isSidechain`, `entrypoint`, `version`, `effort` |
| S-2 | ¿Y en Codex? | Sí: eventos `token_count` con `total_token_usage` y `last_token_usage`, `model_context_window`, y **los límites reales del plan** (`used_percent`, `window_minutes`, `resets_at`, `plan_type`, `credits`) |
| S-3 | ¿Se puede contar una línea como un cobro? | **NO.** 192.234 líneas con `usage` corresponden a **92.652 mensajes reales**. Contar por línea infla el coste un **127 %**: $66.006 en vez de $29.084 |
| S-4 | ¿De dónde vienen los duplicados? | 99.141 repeticiones **dentro del mismo fichero** (un mensaje con varios bloques se escribe en varias líneas, cada una con el `usage` completo) y 439 copias **entre ficheros** (`--resume`, forks, worktrees). Además, **7.326 ids** aparecen con `usage` distinto entre apariciones |
| S-5 | ¿Hace falta una base de datos? | No. El índice completo son 92.655 registros: **17,7 MB en NDJSON, 3,36 MB comprimido, 114 ms de carga**. El `stat` de los 760 ficheros tarda **5 ms**, y una pasada completa sobre los 2,52 GB, **9,1 s** |
| S-6 | ¿El `cwd` sirve como identidad de proyecto? | Casi: 291 rutas crudas se reducen a **285** al normalizar mayúsculas y barras. `C:\Users\kirne` y `c:\Users\kirne` son el mismo proyecto y aparecían separados, con $7.074 y $4.008 |

Las tres consecuencias que cambiaron el plan:

1. **La deduplicación por `message.id` no es una optimización, es la corrección.** Sin ella el producto miente por más del doble. Y es exactamente el error que cabe esperar en las 25 extensiones del nicho, porque la vía obvia —una línea, un cobro— es la equivocada. Pasa a ser el argumento técnico central, por delante del desglose de caché.
2. **Fuera SQLite.** El índice cabe en 3,4 MB y carga en 114 ms; un módulo nativo obligaría a compilar por plataforma y por ABI de Electron a cambio de nada. Decisión D6.
3. **La identidad de proyecto se normaliza** antes de agrupar. Decisión D8.

La cifra corregida del histórico de esta máquina es **$29.084 de coste equivalente de API** sobre 68.221 millones de tokens y 92.652 mensajes. El desglose correcto de caché sigue importando: tratar toda la escritura como 5 m da $26.079, una **subestimación del 10,3 %** [medido, sonda S-3 y `prototipos/proto2.mjs`].

---

## 2. Decisiones cerradas

| # | Decisión | Motivo | Alternativa descartada | Se verifica con |
|---|---|---|---|---|
| D1 | **TypeScript + esbuild**, un solo VSIX sin binarios | Solo se leen ficheros de texto; no hay nada que un proceso nativo aporte | Runner en Go como TaskKeeper: aquí no hay planificador ni procesos hijo | Tamaño del VSIX < 200 KB |
| D2 | **Windows, macOS y Linux desde el día uno** | No hay código de sistema operativo; solo rutas | Publicar solo Windows | P-10 |
| D3 | La unidad de cobro es el **`message.id`**, no la línea | S-3: contar líneas infla el coste un 127 % | Una línea, un cobro | **P-01** |
| D4 | Entre apariciones del mismo id gana la de **mayor `output_tokens`**; a igualdad, la de mayor entrada total | S-4: 7.326 ids traen `usage` distinto porque el registro se reescribe mientras se genera. El último estado es el cobrado | Quedarse con la primera; sumarlas | **P-02** |
| D5 | Deduplicación **global**, no por fichero | S-4: 439 ids viven en dos ficheros por `--resume`, forks y worktrees | Deduplicar dentro de cada fichero | P-01 |
| D6 | Índice en **NDJSON comprimido**, sin base de datos | S-5: 3,36 MB y 114 ms. Un `better-sqlite3` obliga a precompilar por plataforma y por versión de Electron, y `node:sqlite` no está garantizado en el host | SQLite nativo; sql.js en WASM | P-11 |
| D7 | Índice **incremental por marca de agua** `(ruta, tamaño, mtimeMs, offset)` | S-5: el `stat` de todo el árbol cuesta 5 ms; releer 2,5 GB cuesta 11 s | Reindexar siempre | **P-05**, **P-06** |
| D8 | La identidad de proyecto se **normaliza**: barras a `/`, sin barra final, minúsculas solo en Windows y macOS | S-6: seis proyectos duplicados por mayúsculas | Usar `cwd` tal cual | **P-08** |
| D9 | En Codex se usa el **último `total_token_usage`** de cada tramo, nunca la suma de los eventos | El total es acumulado: sumar los 119 eventos de una sesión multiplicaría el consumo por sesenta. Se verificó que `suma(last) == último(total)` | Sumar `total_token_usage`; sumar `last_token_usage` sin control de reinicio | **P-07** |
| D10 | El euro y la cuota son **dos cifras distintas**, nunca una sola | Con plan de suscripción el coste de API no es la factura. Mezclarlas es la mentira cómoda del nicho | Mostrar solo euros | Revisión de interfaz |
| D11 | Las tarifas viven en **`tarifas.json` versionado con fecha**, y un modelo sin tarifa se cuenta **aparte y se dice** | S-1: ya aparecen 130 mensajes `<synthetic>` sin tarifa posible | Precios en el código; repartir a ojo | **P-09** |
| D12 | Para **Codex no se muestran euros** salvo que el usuario configure tarifas; se muestran tokens y porcentaje de cuota real | No hay tarifa oficial verificable para sus modelos, y Codex sí publica su cuota. Inventar un precio sería el error que este producto dice no cometer | Estimar el precio | Revisión de interfaz |
| D13 | La ventana de 5 h de Claude es **derivada** y se etiqueta como tal | S-1: Claude Code no guarda sus límites. Se reconstruye por marcas de tiempo | Presentarla como exacta | P-12 |
| D14 | El índice **no guarda ni un carácter de prompt ni de código** | Los `.jsonl` están llenos de ambos. Un índice con texto es una filtración esperando a un `Exportar` | Guardar el texto para poder enseñarlo | **P-13** |

---

## 3. Estructura

```text
costkeeper/
├── src/
│   ├── core/                    sin ninguna importación de 'vscode'
│   │   ├── tipos.ts             contrato común
│   │   ├── lectores/
│   │   │   ├── claude.ts        ~/.claude/projects/**/*.jsonl
│   │   │   ├── codex.ts         ~/.codex/sessions/**/rollout-*.jsonl
│   │   │   └── lineas.ts        lectura por líneas con offset y tolerancia
│   │   ├── precios/
│   │   │   ├── tarifas.json     versionado, con fecha y origen
│   │   │   └── coste.ts
│   │   ├── indice/
│   │   │   ├── almacen.ts       NDJSON + gzip + marcas de agua
│   │   │   └── indexador.ts     incremental, deduplicación global
│   │   ├── consulta/agregar.ts  por proyecto, modelo, día, rama, sesión
│   │   └── cuota.ts             Codex real · Claude derivada
│   ├── vscode/                  adaptadores: rutas, ajustes, progreso
│   ├── ui/                      panel, barra de estado (webviews con CSP)
│   ├── pro/                     polarConfig · licenseService · features
│   └── extension.ts
├── fixtures/                    sesiones sintéticas de los dos proveedores
├── l10n/ · package.nls.json · package.nls.es.json
└── test/                        unitarios (mocha sobre out/) + integración
```

Regla que ya costó una corrección en TaskKeeper: **nunca emojis en la interfaz**; iconos SVG propios o codicons.

---

## 4. Contrato

```ts
// src/core/tipos.ts
export type Proveedor = 'claude' | 'codex';

/** Un cobro. La unidad es el mensaje, no la línea del fichero (D3). */
export interface Registro {
  id: string;             // message.id en Claude; sesión+tramo en Codex
  proveedor: Proveedor;
  ts: string;             // ISO 8601
  proyecto: string;       // cwd normalizado (D8)
  rama: string;
  sesion: string;
  subagente: boolean;
  modelo: string;
  entrada: number;
  salida: number;
  cacheLectura: number;
  cacheEscritura5m: number;
  cacheEscritura1h: number;
  razonamiento: number;   // thinking / reasoning, informativo: ya va en salida
  fuente: string;         // fichero del que salió, para poder purgarlo (D7)
}

export type Confianza = 'exacto' | 'derivado' | 'estimado';

export interface Coste {
  usd: number | null;     // null = sin tarifa conocida (D11)
  confianza: Confianza;
  tarifaFechada: string;  // '2026-08-24'
}

export interface Cuota {
  proveedor: Proveedor;
  usadoPorCiento: number;
  ventanaMinutos: number;
  reiniciaEn: string;
  confianza: Confianza;   // Codex 'exacto', Claude 'derivado' (D13)
  plan?: string;
}

/** Marca de agua por fichero: permite releer solo la cola (D7). */
export interface Marca {
  ruta: string;
  tamano: number;
  mtimeMs: number;
  offset: number;         // byte siguiente al último salto de línea procesado
  /** Solo Codex: estado acumulado, sin el cual reanudar pierde tramos (A-3). */
  codex?: { base: Acum; ultimo: Acum };
}

export interface Acum {
  entrada: number; cache: number; escritura: number; salida: number; razon: number;
}
```

---

## 5. Lectura por líneas con offset

El punto delicado no es leer: es reanudar sin romper una línea por la mitad y sin morir con una línea corrupta —ya hay una en el histórico real [medido, sonda S-4].

**Este apartado se escribió primero con `readline` y la auditoría lo tumbó** (hallazgo A-1 de §17): `readline` descarta el retorno de carro de CRLF, así que el offset acumulado queda un byte corto por línea y la reanudación cae en mitad de la anterior. Se trocea a mano contando bytes, que además resulta ser más rápido.

```ts
// src/core/lectores/lineas.ts
import fs from 'node:fs';

export interface Trozo { linea: string; finOffset: number; }

/**
 * Lee desde `desde` —que debe caer justo detrás de un salto de línea— y
 * devuelve cada línea con el offset en BYTES donde termina.
 * La cola sin salto final no se entrega: está a medio escribir.
 */
export async function* leerDesde(ruta: string, desde = 0): AsyncGenerator<Trozo> {
  const flujo = fs.createReadStream(ruta, { start: desde });   // sin encoding: buffers
  let resto = Buffer.alloc(0);
  let offset = desde;
  for await (const trozo of flujo as AsyncIterable<Buffer>) {
    let buf = resto.length ? Buffer.concat([resto, trozo]) : trozo;
    let i: number;
    while ((i = buf.indexOf(0x0a)) !== -1) {          // 0x0a = '\n'
      offset += i + 1;
      // El '\r' de CRLF queda dentro de la línea; JSON.parse lo tolera.
      yield { linea: buf.subarray(0, i).toString('utf8'), finOffset: offset };
      buf = buf.subarray(i + 1);
    }
    resto = buf;
  }
}
```

Tres propiedades que las pruebas fijan: el offset se cuenta en **bytes** —hay rutas y prompts con acentos y emoji—, funciona igual con LF y con CRLF, y una línea a medio escribir se recupera entera en la siguiente pasada en lugar de contarse rota.

Un carácter multibyte partido entre dos trozos del flujo no se corrompe: el troceo trabaja sobre buffers y solo convierte a texto cuando la línea está completa.

---

## 6. Lector de Claude Code

```ts
// src/core/lectores/claude.ts
import path from 'node:path';
import { leerDesde } from './lineas';
import type { Registro, Marca } from '../tipos';
import { normalizarProyecto, normalizarModelo } from '../normalizar';

export interface Avance { registros: Registro[]; marca: Marca; corruptas: number; }

export async function leerFichero(ruta: string, desde: Marca | undefined,
                                  stat: { size: number; mtimeMs: number }): Promise<Avance> {
  // Fichero truncado o reescrito: la marca ya no vale (D7, P-06).
  const reiniciar = !desde || stat.size < desde.offset;
  const inicio = reiniciar ? 0 : desde!.offset;

  const registros: Registro[] = [];
  let corruptas = 0;
  let offset = inicio;

  for await (const { linea, finOffset } of leerDesde(ruta, inicio)) {
    offset = finOffset;
    // Filtro barato antes de parsear: descarta el 60 % de las líneas.
    if (linea.indexOf('"usage"') === -1) continue;

    let d: any;
    try { d = JSON.parse(linea); } catch { corruptas++; continue; }

    const u = d?.message?.usage;
    const id = d?.message?.id;
    if (!u || !id) continue;

    const cc = u.cache_creation ?? {};
    // Formatos antiguos traen solo el agregado: se imputa al precio menor (5 m),
    // que es el conservador, y el registro se marca como derivado.
    const tiene1h = cc.ephemeral_1h_input_tokens !== undefined;
    const tiene5m = cc.ephemeral_5m_input_tokens !== undefined;

    registros.push({
      id,
      proveedor: 'claude',
      ts: d.timestamp ?? '',
      proyecto: normalizarProyecto(d.cwd ?? ''),
      rama: d.gitBranch ?? '',
      sesion: d.sessionId ?? '',
      subagente: Boolean(d.isSidechain),
      modelo: normalizarModelo(d.message.model ?? ''),
      entrada: u.input_tokens ?? 0,
      salida: u.output_tokens ?? 0,
      cacheLectura: u.cache_read_input_tokens ?? 0,
      cacheEscritura5m: tiene5m ? cc.ephemeral_5m_input_tokens
                                : (tiene1h ? 0 : (u.cache_creation_input_tokens ?? 0)),
      cacheEscritura1h: tiene1h ? cc.ephemeral_1h_input_tokens : 0,
      razonamiento: u.output_tokens_details?.thinking_tokens ?? 0,
      fuente: ruta,
    });
  }

  return { registros, corruptas,
           marca: { ruta, tamano: stat.size, mtimeMs: stat.mtimeMs, offset } };
}

export function raizClaude(home: string): string {
  return path.join(home, '.claude', 'projects');
}
```

```ts
// src/core/normalizar.ts
import os from 'node:os';

const INSENSIBLE = process.platform === 'win32' || process.platform === 'darwin';

/** D8: seis proyectos duplicados en el histórico real solo por mayúsculas. */
export function normalizarProyecto(cwd: string): string {
  if (!cwd) return '(desconocido)';
  let p = cwd.split('\\').join('/').replace(/\/+$/, '');
  if (INSENSIBLE) p = p.toLowerCase();
  return p;
}

/** Quita sufijos de variante que no cambian la tarifa: '[1m]', '-20260101'. */
export function normalizarModelo(m: string): string {
  return (m || '').replace(/\[1m\]$/, '').replace(/-\d{8}$/, '');
}
```

`razonamiento` se guarda por transparencia, pero **no se suma al coste**: los tokens de razonamiento ya vienen dentro de `output_tokens`. Contarlos aparte es otra forma clásica de inflar la cifra.

---

## 7. Lector de Codex

Aquí la trampa es la contraria: los eventos traen **acumulados**. Sumarlos multiplica el consumo por el número de eventos de la sesión —119 en una sesión real [medido, sonda S-2].

```ts
// src/core/lectores/codex.ts
import { leerDesde } from './lineas';
import type { Registro, Cuota, Marca, Acum } from '../tipos';
import { normalizarProyecto } from '../normalizar';

const CERO: Acum = { entrada: 0, cache: 0, escritura: 0, salida: 0, razon: 0 };

export async function leerRollout(ruta: string, desde: Marca | undefined,
                                  stat: { size: number; mtimeMs: number }) {
  const reiniciar = !desde || stat.size < desde.offset;
  // La primera línea es `session_meta` en el 100 % de los rollouts medidos, y
  // trae cwd y modelo de arranque. Al reanudar hay que releerla aparte.
  const meta = await leerMeta(ruta);

  let offset = reiniciar ? 0 : desde!.offset;
  let modelo = meta.modelo;
  // A-3: `base` y `ultimo` viajan en la marca. Si solo se guardara el offset,
  // reanudar después de un reinicio de contexto perdería el tramo anterior.
  let ultimo: Acum = reiniciar ? CERO : desde!.codex?.ultimo ?? CERO;
  let base: Acum = reiniciar ? CERO : desde!.codex?.base ?? CERO;
  let cuota: Cuota | undefined;
  let ts = meta.ts;

  for await (const { linea, finOffset } of leerDesde(ruta, offset)) {
    offset = finOffset;
    let d: any;
    try { d = JSON.parse(linea); } catch { continue; }

    // El modelo puede cambiar dentro de una sesión.
    if (d.type === 'turn_context' && d.payload?.model) modelo = d.payload.model;

    if (d.payload?.type !== 'token_count' || !d.payload.info) continue;
    ts = d.timestamp ?? ts;

    const t = d.payload.info.total_token_usage;
    const actual: Acum = {
      entrada: t.input_tokens ?? 0,
      cache: t.cached_input_tokens ?? 0,
      escritura: t.cache_write_input_tokens ?? 0,
      salida: t.output_tokens ?? 0,
      razon: t.reasoning_output_tokens ?? 0,
    };

    // D9: el total es acumulado. Si baja, hubo reinicio de contexto: se cierra
    // el tramo anterior y se empieza a acumular de nuevo sobre esa base.
    if (actual.entrada + actual.salida < ultimo.entrada + ultimo.salida) {
      base = sumar(base, ultimo);
    }
    ultimo = actual;

    const rl = d.payload.rate_limits?.primary;
    if (rl) {
      cuota = {
        proveedor: 'codex',
        usadoPorCiento: rl.used_percent ?? 0,
        ventanaMinutos: rl.window_minutes ?? 0,
        reiniciaEn: new Date((rl.resets_at ?? 0) * 1000).toISOString(),
        confianza: 'exacto',
        plan: d.payload.rate_limits?.plan_type,
      };
    }
  }

  const total = sumar(base, ultimo);
  // Un registro por sesión: la unidad de cobro de Codex es la sesión acumulada.
  const registro: Registro = {
    id: `codex:${meta.sesion}`,
    proveedor: 'codex',
    ts,
    proyecto: normalizarProyecto(meta.cwd),
    rama: '',
    sesion: meta.sesion,
    subagente: false,
    modelo,
    entrada: total.entrada,
    salida: total.salida,
    cacheLectura: total.cache,
    cacheEscritura5m: total.escritura,   // Codex no separa TTL
    cacheEscritura1h: 0,
    razonamiento: total.razon,
    fuente: ruta,
  };

  return { registros: [registro], cuota,
           marca: { ruta, tamano: stat.size, mtimeMs: stat.mtimeMs, offset,
                    codex: { base, ultimo } } };
}

const sumar = (a: Acum, b: Acum): Acum => ({
  entrada: a.entrada + b.entrada, cache: a.cache + b.cache,
  escritura: a.escritura + b.escritura, salida: a.salida + b.salida, razon: a.razon + b.razon,
});

async function leerMeta(ruta: string) {
  for await (const { linea } of leerDesde(ruta, 0)) {
    try {
      const d = JSON.parse(linea);
      if (d.type === 'session_meta') {
        const p = d.payload ?? {};
        return { sesion: p.session_id ?? p.id ?? ruta, cwd: p.cwd ?? '', ts: d.timestamp ?? '',
                 modelo: p.base_instructions?.provenance?.model ?? '(desconocido)' };
      }
    } catch { /* sigue */ }
    break; // solo la primera línea
  }
  return { sesion: ruta, cwd: '', ts: '', modelo: '(desconocido)' };
}
```

El `id` es `codex:<sesión>`: como el registro se recalcula entero cada vez que crece el rollout, sustituye al anterior en el índice en lugar de sumarse. Ese comportamiento lo fija P-07.

---

## 8. Tarifas y coste

```json
// src/core/precios/tarifas.json
{
  "version": 1,
  "fecha": "2026-08-24",
  "origen": "Precios públicos de la API de Anthropic, USD por millón de tokens",
  "multiplicadoresCache": { "lectura": 0.1, "escritura5m": 1.25, "escritura1h": 2 },
  "modelos": {
    "claude-fable-5":   { "entrada": 10, "salida": 50 },
    "claude-mythos-5":  { "entrada": 10, "salida": 50 },
    "claude-opus-5":    { "entrada": 5,  "salida": 25 },
    "claude-opus-4-8":  { "entrada": 5,  "salida": 25 },
    "claude-opus-4-7":  { "entrada": 5,  "salida": 25 },
    "claude-opus-4-6":  { "entrada": 5,  "salida": 25 },
    "claude-sonnet-5":  { "entrada": 3,  "salida": 15 },
    "claude-sonnet-4-6":{ "entrada": 3,  "salida": 15 },
    "claude-haiku-4-5": { "entrada": 1,  "salida": 5 }
  }
}
```

```ts
// src/core/precios/coste.ts
import tarifas from './tarifas.json';
import type { Registro, Coste } from '../tipos';

export function costeDe(r: Registro): Coste {
  const t = (tarifas.modelos as Record<string, { entrada: number; salida: number }>)[r.modelo];
  if (!t) return { usd: null, confianza: 'estimado', tarifaFechada: tarifas.fecha };  // D11

  const m = tarifas.multiplicadoresCache;
  const usd =
    (r.entrada * t.entrada +
     r.cacheLectura * t.entrada * m.lectura +
     r.cacheEscritura5m * t.entrada * m.escritura5m +
     r.cacheEscritura1h * t.entrada * m.escritura1h +
     r.salida * t.salida) / 1e6;

  return { usd, confianza: 'exacto', tarifaFechada: tarifas.fecha };
}
```

El único caso `derivado` es el de un registro antiguo sin desglose de TTL de caché, y el lector lo marca. Codex no pasa por aquí (D12): se muestran tokens y cuota.

---

## 9. Índice incremental y deduplicación global

Este es el corazón, y la parte donde el error de S-3 se corrige de una vez para todo el producto.

```ts
// src/core/indice/almacen.ts
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Registro, Marca } from '../tipos';

const gzip = promisify(zlib.gzip), gunzip = promisify(zlib.gunzip);
const VERSION = 1;

export interface Indice { version: number; registros: Map<string, Registro>; marcas: Map<string, Marca>; }

export async function cargar(dir: string): Promise<Indice> {
  const vacio: Indice = { version: VERSION, registros: new Map(), marcas: new Map() };
  try {
    const [datos, marcas] = await Promise.all([
      fs.readFile(path.join(dir, 'registros.ndjson.gz')),
      fs.readFile(path.join(dir, 'marcas.json'), 'utf8'),
    ]);
    const m = JSON.parse(marcas);
    if (m.version !== VERSION) return vacio;   // formato viejo: se reconstruye
    const texto = (await gunzip(datos)).toString('utf8');
    const registros = new Map<string, Registro>();
    for (const linea of texto.split('\n')) {
      if (!linea) continue;
      try { const r = JSON.parse(linea) as Registro; registros.set(r.id, r); } catch { /* fila suelta */ }
    }
    return { version: VERSION, registros, marcas: new Map(Object.entries(m.marcas)) };
  } catch { return vacio; }
}

export async function guardar(dir: string, ind: Indice): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const texto = [...ind.registros.values()].map(r => JSON.stringify(r)).join('\n');
  // Escritura atómica: un fallo a media escritura no puede dejar el índice roto.
  const tmp = path.join(dir, `registros.${process.pid}.tmp`);
  await fs.writeFile(tmp, await gzip(Buffer.from(texto, 'utf8'), { level: 6 }));
  await fs.rename(tmp, path.join(dir, 'registros.ndjson.gz'));
  await fs.writeFile(path.join(dir, 'marcas.json'),
    JSON.stringify({ version: VERSION, marcas: Object.fromEntries(ind.marcas) }));
}
```

```ts
// src/core/indice/indexador.ts
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Indice } from './almacen';
import type { Registro } from '../tipos';
import { leerFichero, raizClaude } from '../lectores/claude';
import { leerRollout } from '../lectores/codex';

export interface Progreso { (hechos: number, total: number, fichero: string): void; }

export async function indexar(ind: Indice, home: string,
                              avisar: Progreso, cancelado: () => boolean) {
  const ficheros = [
    ...(await listar(raizClaude(home), n => n.endsWith('.jsonl'))).map(f => ({ f, tipo: 'claude' as const })),
    ...(await listar(path.join(home, '.codex', 'sessions'),
                     n => n.startsWith('rollout-') && n.endsWith('.jsonl'))).map(f => ({ f, tipo: 'codex' as const })),
  ];

  let hechos = 0, corruptas = 0;
  for (const { f, tipo } of ficheros) {
    if (cancelado()) break;
    avisar(++hechos, ficheros.length, f);

    let stat; try { stat = await fs.stat(f); } catch { continue; }   // borrado a media pasada
    const marca = ind.marcas.get(f);

    // Nada que hacer: mismo tamaño y misma fecha.
    if (marca && marca.tamano === stat.size && marca.mtimeMs === stat.mtimeMs) continue;

    // Fichero reescrito o truncado: se purgan sus registros y se relee entero (D7).
    if (marca && stat.size < marca.offset) purgarFuente(ind, f);

    const avance = tipo === 'claude'
      ? await leerFichero(f, marca, stat)
      : await leerRollout(f, marca, stat);

    corruptas += (avance as any).corruptas ?? 0;
    for (const r of avance.registros) fundir(ind, r);
    ind.marcas.set(f, avance.marca);
  }
  return { ficheros: ficheros.length, corruptas };
}

/** D3, D4, D5: un id = un cobro; entre apariciones gana la de mayor salida. */
function fundir(ind: Indice, r: Registro): void {
  const previo = ind.registros.get(r.id);
  if (!previo) { ind.registros.set(r.id, r); return; }
  if (r.proveedor === 'codex') { ind.registros.set(r.id, r); return; }  // recalculado entero
  const mayorSalida = r.salida > previo.salida;
  const igualSalida = r.salida === previo.salida &&
    entradaTotal(r) > entradaTotal(previo);
  if (mayorSalida || igualSalida) ind.registros.set(r.id, r);
}

const entradaTotal = (r: Registro) =>
  r.entrada + r.cacheLectura + r.cacheEscritura5m + r.cacheEscritura1h;

function purgarFuente(ind: Indice, ruta: string): void {
  for (const [id, r] of ind.registros) if (r.fuente === ruta) ind.registros.delete(id);
}

async function listar(raiz: string, acepta: (n: string) => boolean): Promise<string[]> {
  const salida: string[] = [];
  const pila = [raiz];
  while (pila.length) {
    const dir = pila.pop()!;
    let entradas;
    try { entradas = await fs.readdir(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entradas) {
      // A-2: nada de `e.parentPath` ni `e.path`. El primero no existe en el Node
      // de VS Code y el segundo cambió de significado entre versiones.
      const p = path.join(dir, e.name);
      if (e.isDirectory()) pila.push(p);
      else if (acepta(e.name)) salida.push(p);
    }
  }
  return salida;
}
```

Una consecuencia de D5 que hay que tener presente y que P-01 fija: cuando un id vive en dos ficheros, el registro conserva el `cwd` del fichero que ganó. Es el comportamiento correcto —el cobro ocurrió una vez, en un sitio— pero significa que **un mensaje replicado en un worktree se imputa al proyecto donde se generó**, no a los dos. En el histórico real son 439 mensajes sobre 92.652: cinco milésimas.

---

## 10. Agregación

```ts
// src/core/consulta/agregar.ts
import type { Registro } from '../tipos';
import { costeDe } from '../precios/coste';

export type Eje = 'proyecto' | 'modelo' | 'dia' | 'rama' | 'sesion' | 'proveedor';

export interface Fila {
  clave: string; usd: number; tokens: number; mensajes: number;
  sinTarifa: number;            // mensajes que no pudieron costearse (D11)
  cacheEscritura1h: number; cacheEscritura5m: number;
}

export interface Filtro {
  desde?: string; hasta?: string; proyecto?: string;
  proveedor?: 'claude' | 'codex'; incluirSubagentes?: boolean;
}

export function agregar(registros: Iterable<Registro>, eje: Eje, f: Filtro = {}): Fila[] {
  const mapa = new Map<string, Fila>();
  for (const r of registros) {
    if (!pasa(r, f)) continue;
    const clave = claveDe(r, eje);
    const fila = mapa.get(clave) ?? { clave, usd: 0, tokens: 0, mensajes: 0, sinTarifa: 0,
                                      cacheEscritura1h: 0, cacheEscritura5m: 0 };
    const c = costeDe(r);
    if (c.usd === null) fila.sinTarifa++; else fila.usd += c.usd;
    fila.tokens += r.entrada + r.salida + r.cacheLectura + r.cacheEscritura5m + r.cacheEscritura1h;
    fila.cacheEscritura1h += r.cacheEscritura1h;
    fila.cacheEscritura5m += r.cacheEscritura5m;
    fila.mensajes++;
    mapa.set(clave, fila);
  }
  return [...mapa.values()].sort((a, b) => b.usd - a.usd || b.tokens - a.tokens);
}

function pasa(r: Registro, f: Filtro): boolean {
  const dia = r.ts.slice(0, 10);
  if (f.desde && dia < f.desde) return false;
  if (f.hasta && dia > f.hasta) return false;
  if (f.proyecto && r.proyecto !== f.proyecto) return false;
  if (f.proveedor && r.proveedor !== f.proveedor) return false;
  if (f.incluirSubagentes === false && r.subagente) return false;
  return true;
}

const claveDe = (r: Registro, eje: Eje): string =>
  eje === 'dia' ? r.ts.slice(0, 10)
  : eje === 'proyecto' ? r.proyecto
  : eje === 'modelo' ? r.modelo
  : eje === 'rama' ? (r.rama || '(sin rama)')
  : eje === 'proveedor' ? r.proveedor
  : r.sesion;
```

La ventana de cinco horas de Claude, que es dato derivado (D13):

```ts
// src/core/cuota.ts
import type { Registro, Cuota } from './tipos';

const VENTANA_MIN = 300;

/**
 * Claude Code no guarda sus límites (S-1). La ventana se reconstruye: se abre
 * con el primer mensaje tras un hueco de cinco horas y dura cinco horas.
 * Se devuelve SIEMPRE con confianza 'derivado'; el porcentaje de consumo no se
 * puede conocer, así que se informa de tiempo restante y gasto de la ventana.
 */
export function ventanaClaude(registros: Registro[], ahora: Date) {
  const claude = registros.filter(r => r.proveedor === 'claude' && r.ts)
                          .sort((a, b) => a.ts.localeCompare(b.ts));
  if (!claude.length) return undefined;

  let inicio = new Date(claude[0].ts);
  for (const r of claude) {
    const t = new Date(r.ts);
    if (t.getTime() - inicio.getTime() > VENTANA_MIN * 60_000) inicio = t;
  }
  const fin = new Date(inicio.getTime() + VENTANA_MIN * 60_000);
  if (fin < ahora) return undefined;    // no hay ventana abierta

  const dentro = claude.filter(r => new Date(r.ts) >= inicio);
  const cuota: Cuota = { proveedor: 'claude', usadoPorCiento: NaN,
                         ventanaMinutos: VENTANA_MIN, reiniciaEn: fin.toISOString(),
                         confianza: 'derivado' };
  return { cuota, mensajes: dentro.length };
}
```

Que `usadoPorCiento` sea `NaN` no es un descuido: **no se puede saber**, y la interfaz enseña «quedan 2 h 14 min de la ventana» en vez de inventar un porcentaje. La comparación con Codex, que sí publica el suyo, es exactamente lo que hace creíble al producto.

---

## 11. Extensión

```jsonc
// package.json (extracto)
{
  "activationEvents": [],                       // solo comandos: nada al arrancar
  "main": "./dist/extension.js",
  "capabilities": { "untrustedWorkspaces": { "supported": true } },
  "contributes": {
    "commands": [
      { "command": "costkeeper.abrir",     "title": "%cmd.abrir%",     "category": "CostKeeper" },
      { "command": "costkeeper.indexar",   "title": "%cmd.indexar%",   "category": "CostKeeper" },
      { "command": "costkeeper.exportar",  "title": "%cmd.exportar%",  "category": "CostKeeper" },
      { "command": "costkeeper.etiquetar", "title": "%cmd.etiquetar%", "category": "CostKeeper" }
    ],
    "configuration": {
      "properties": {
        "costkeeper.rutasExtra":     { "type": "array",   "default": [] },
        "costkeeper.moneda":         { "type": "string",  "enum": ["USD", "EUR"], "default": "USD" },
        "costkeeper.cambioEurUsd":   { "type": "number",  "default": 0 },
        "costkeeper.tarifasCodex":   { "type": "object",  "default": {} },
        "costkeeper.barraDeEstado":  { "type": "boolean", "default": true }
      }
    }
  }
}
```

`untrustedWorkspaces: supported` es defendible aquí y conviene decirlo en la ficha: la extensión no ejecuta nada del repositorio, solo lee ficheros del perfil del usuario.

```ts
// src/extension.ts (esqueleto)
import * as vscode from 'vscode';
import os from 'node:os';
import { cargar, guardar } from './core/indice/almacen';
import { indexar } from './core/indice/indexador';

export async function activate(ctx: vscode.ExtensionContext) {
  const dir = ctx.globalStorageUri.fsPath;
  let indice = await cargar(dir);

  ctx.subscriptions.push(
    vscode.commands.registerCommand('costkeeper.indexar', () => refrescar(true)),
    vscode.commands.registerCommand('costkeeper.abrir', async () => {
      abrirPanel(ctx, indice);            // se abre con lo que haya, sin esperar
      refrescar(false);                   // y se actualiza cuando termine
    }),
  );

  async function refrescar(visible: boolean) {
    await vscode.window.withProgress(
      { location: visible ? vscode.ProgressLocation.Notification
                          : vscode.ProgressLocation.Window,
        title: vscode.l10n.t('Indexando el histórico de agentes'), cancellable: true },
      async (progreso, token) => {
        let ultimo = 0;
        const res = await indexar(indice, os.homedir(),
          (hechos, total, fichero) => {
            const pct = Math.floor(hechos / total * 100);
            if (pct === ultimo) return;                 // no repintar por cada fichero
            progreso.report({ increment: pct - ultimo, message: `${pct} %` });
            ultimo = pct;
          },
          () => token.isCancellationRequested);
        await guardar(dir, indice);       // guarda también si se canceló: lo hecho, hecho
        if (res.corruptas) console.warn(`CostKeeper: ${res.corruptas} líneas ilegibles`);
      });
  }
}
```

Tres cosas que el esqueleto fija a propósito:

- El panel **se abre con el índice ya cargado** (114 ms) y se refresca después. Nadie mira una barra de progreso de once segundos la primera vez si puede ver datos de la anterior.
- El progreso se reporta **por punto porcentual**, no por fichero: 760 notificaciones por segundo bloquean la interfaz más que la lectura.
- **Cancelar guarda igualmente**. La marca de agua de cada fichero terminado es válida, así que cancelar y reanudar no repite trabajo.

El panel es un webview con CSP estricta y `nonce`, sin red y sin `unsafe-inline`, siguiendo el patrón ya usado en TaskKeeper. La barra de estado muestra la sesión en curso —el fichero con `mtime` más reciente dentro del proyecto abierto— y el porcentaje de ventana de contexto.

---

## 12. Privacidad

D14 no es una promesa de marketing, es una propiedad comprobable: **el `Registro` no tiene ningún campo de texto libre**. No hay prompt, ni respuesta, ni nombre de fichero editado. Lo más sensible que guarda es la ruta del proyecto y el nombre de la rama, y ambas salen del `cwd`.

- La exportación CSV lleva agregados, nunca registros con rutas completas salvo que el usuario elija el eje «proyecto».
- Los mensajes de diagnóstico redactan la ruta a la última carpeta.
- No hay telemetría y no hay red, salvo la validación de licencia de Polar.
- Se comprueba en **P-13**, que hace `grep` de cadenas sembradas en los fixtures contra el índice y contra el CSV.

---

## 13. Pro con Polar

Se reutiliza `pro/{polarConfig,licenseService,features,statusBar}` de `plantillas/`, con el patrón ya verificado en cuatro extensiones: offline-first 24 h / 14 d, límite de tres activaciones, y **sin trampas permanentes** al caducar.

| Gratis | Pro (9 €, pago único) |
|---|---|
| Índice de Claude Code y Codex | Etiquetas de cliente por carpeta o repositorio |
| Ejes proyecto, modelo, día, sesión | Informe por cliente y exportación CSV |
| Desglose correcto de caché y deduplicación | Presupuestos por proyecto con avisos al 50, 80 y 100 % |
| Cuota real de Codex y ventana derivada de Claude | Predicción de agotamiento de ventana |
| Barra de estado | Histórico ilimitado (gratis: 30 días) e informe por rama |

Quitar la licencia devuelve el producto a la columna izquierda íntegra. El corte de 30 días se aplica **en la consulta, no en el índice**: los datos siguen ahí y vuelven a verse al activar, que es lo honesto y lo que evita el «me habéis borrado el histórico».

---

## 14. Pruebas

Unitarias con mocha sobre `out/`, sobre `src/core` puro, con fixtures sintéticos —nunca con sesiones reales, que llevan prompts.

| # | Prueba | Cierra |
|---|---|---|
| **P-01** | Un mensaje escrito en tres líneas dentro de un fichero y copiado a un segundo fichero se cobra **una vez** | D3, D5 |
| **P-02** | Tres apariciones del mismo id con `output_tokens` 10, 400 y 120 → gana 400. A igual salida, gana la de mayor entrada total | D4 |
| **P-03** | Caché: `1h` a 2×, `5m` a 1,25×, lectura a 0,1×; formato antiguo con solo `cache_creation_input_tokens` se imputa a 5 m y se marca derivado | D11 |
| **P-04** | Una línea corrupta, una vacía y una sin `message.id` no abortan el fichero. El contador de ilegibles solo cuenta las que **contienen `usage` y no parsean**: las demás las descarta el filtro barato antes de llegar al parser (A-4) | S-4 |
| **P-04b** | Reanudar sobre un fichero con CRLF cae en frontera de línea; el offset final coincide con el tamaño del fichero | A-1 |
| **P-04c** | Un fichero cuya última línea está a medio escribir no la entrega, y la recupera entera cuando se completa | A-1 |
| **P-05** | Indexar, añadir 10 líneas, reindexar: solo se leen los bytes nuevos y no hay registros duplicados | D7 |
| **P-06** | Fichero truncado a la mitad y reescrito: se purgan sus registros y se relee entero | D7 |
| **P-07** | Codex: 119 eventos acumulados dan el total del último, no la suma. Con un reinicio en medio, da la suma de los dos tramos | D9 |
| **P-08** | `C:\X\Y`, `c:\x\y\` y `C:/X/Y` son el mismo proyecto en Windows y macOS, y **tres distintos en Linux** | D8 |
| **P-09** | Un modelo inventado no rompe nada: `usd: null`, se cuenta en `sinTarifa` y aparece en la interfaz | D11 |
| **P-10** | Rutas POSIX y Windows en el mismo índice; separadores mezclados | D2 |
| **P-11** | Rendimiento: el árbol real se indexa en menos de 20 s y el índice carga en menos de 500 ms | D6 |
| **P-12** | La ventana derivada de Claude nunca se presenta como exacta; `usadoPorCiento` no se pinta | D13 |
| **P-13** | Cadenas sembradas en los prompts de los fixtures **no aparecen** en el índice, ni en el CSV, ni en los logs | D14 |
| **P-14** | Licencia caducada: lo gratuito sigue intacto; adelantar el reloj no amplía el margen | Guía §6 |
| **P-15** | `l10n-sync` falla si sobra o falta una clave en español o inglés | Guía §1 |

Integración con `@vscode/test-electron`: `--user-data-dir` propio, `--disable-extensions`, `HOME` temporal con fixtures. Cuatro casos: arranque sin datos, arranque con índice previo, indexado cancelado a mitad, y panel abierto sobre índice vacío.

---

## 15. Fases y entregables

| Fase | Duración | Entregable que se puede enseñar | Criterio de salida |
|---|---|---|---|
| 0. Sondas | **hecha** | Seis sondas y dos prototipos que ya calculan el histórico real | ✅ §1 de este documento |
| 1. Núcleo | 1 sem | `src/core` con los dos lectores, índice y agregación | P-01 a P-11 en verde |
| 2. Extensión | 1 sem | Panel, barra de estado, indexado en segundo plano, ES/EN | P-12, P-15 en verde |
| 3. Pro | 3 días | Etiquetas de cliente, CSV, presupuestos, licencia Polar | P-13, P-14 en verde |
| 4. Publicación | 3 días | En Marketplace y Open VSX **el mismo día**, con capturas y GIF | Checklist §10 de la guía |
| 5. Lanzamiento | 2 días | Borradores para r/ClaudeAI, X y dev.to | Los publica una persona |

Cada fase la audita un agente independiente y los hallazgos se aplican **antes** de pasar a la siguiente. Polar operativo antes de la primera publicación: el `release.yml` de las plantillas se niega a publicar con `polarConfig` vacío.

Si hay que comprimir, el orden de recorte es: primero la predicción de cuota, después el informe por rama, después Codex. **La deduplicación no se recorta**: sin ella el producto no tiene razón de existir.

### Puerta a 30 días de publicar

| Criterio | Si se cumple | Si no |
|---|---|---|
| ≥ 500 instalaciones | Ampliar a Copilot, Gemini CLI y OpenRouter | No ampliar |
| ≥ 3 licencias Pro | Informe de equipo y plantillas de factura | Revisar precio y posicionamiento antes de tocar código |
| Alguna reseña o issue real | Atender y publicar corrección | Revisar la ficha y el ángulo de lanzamiento |

---

## 16. Auditoría del plan

Cada riesgo con su control y la prueba que lo cierra. Un riesgo sin prueba asociada es una intención, no un control.

| Riesgo | Control | Prueba |
|---|---|---|
| **Enseñar un coste inflado más del doble** | Deduplicación global por `message.id`, con resolución por mayor salida | P-01, P-02 |
| Subestimar el coste ignorando el TTL de la caché | Multiplicadores separados 1,25× y 2×; el formato antiguo se marca derivado | P-03 |
| Contar dos veces los tokens de razonamiento | `razonamiento` se guarda pero no entra en el cálculo: ya está en `output_tokens` | P-03 |
| Multiplicar el consumo de Codex por sesenta | Se usa el último acumulado por tramo, con detección de reinicio | P-07 |
| Un cambio de formato de los proveedores rompe la lectura | Ningún campo es obligatorio; lo desconocido se cuenta aparte y se muestra | P-04, P-09 |
| Un módulo nativo deja de cargar al actualizar VS Code | No hay módulos nativos: solo `node:fs`, `node:zlib`, `node:readline` | P-11, CI en las tres plataformas |
| El primer indexado bloquea el editor | Lectura por líneas, progreso por punto porcentual, cancelable, y el panel abre con el índice previo | P-11 |
| Reindexar duplica o pierde registros | Marca de agua en bytes + purga por fuente al truncarse | P-05, P-06 |
| El mismo proyecto aparece dos veces | Normalización de ruta sensible a la plataforma | P-08 |
| Un prompt o un fragmento de código sale del equipo | El registro no tiene campos de texto libre; se verifica por `grep` | P-13 |
| Presentar como exacto un dato derivado | Tres niveles de confianza en el tipo, no en la interfaz; la ventana de Claude no pinta porcentaje | P-12 |
| Inventar un precio para Codex | Codex no muestra euros salvo tarifas puestas por el usuario | Revisión de interfaz |
| El usuario cree que el euro es su factura | Dos cifras separadas y etiquetadas en todas las vistas | Revisión de interfaz |
| Una tarifa desactualizada envejece en silencio | `tarifas.json` con fecha visible en el panel y en la exportación | P-03 |
| Perder el índice por un fallo a media escritura | Escritura en temporal y `rename` atómico; versión de formato que fuerza reconstrucción | P-05 |

### Puntos débiles que este plan reconoce y no resuelve

1. **El euro es una ficción útil, no una factura.** Con plan de suscripción nadie paga esos dólares. El plan lo etiqueta en todas partes, pero el malentendido va a producirse igual, y alguna reseña lo dirá. La alternativa —enseñar solo porcentajes de cuota— pierde justo lo que se vende, que es imputar a un cliente.
2. **Ni `~/.claude` ni `~/.codex` son API pública.** Un cambio de formato no rompe la extensión, pero puede dejarla mostrando de menos sin avisar. El control real no es técnico: es mirar el contador de «mensajes no clasificados» y publicar rápido.
3. **La deduplicación es una hipótesis bien fundada, no un hecho documentado.** Que un `message.id` repetido sea un solo cobro es lo que dicta el modelo de facturación de la API, y encaja con que las repeticiones tengan `usage` idéntico o creciente. No hay documento oficial que lo confirme; si estuviera equivocada, el producto subestimaría. Se mitiga con una comprobación que sí es definitiva y que hay que hacer en la Fase 1: **contrastar un mes contra la factura real de una cuenta de pago por uso**, y publicar esa comparación en el README.
4. **Codex se lleva un trato peor que Claude**: un registro por sesión, sin rama, sin subagentes y sin euros. Es honesto con lo que el formato permite, pero significa que un usuario de solo Codex ve un producto más pobre y probablemente no pague.
5. **El corte de 30 días del plan gratuito es arbitrario** y es la palanca comercial más frágil del diseño: quien ya tiene el índice construido no pierde nada por no pagar salvo mirar hacia atrás. Si a los 30 días no vende, el candidato a cambiar es este, no el precio.
6. **Nada impide que un competidor con 52.219 instalaciones copie la deduplicación** en una tarde en cuanto lea el README. La ventaja no es el algoritmo, es llegar antes con la explicación y la comparación contra factura.

---

## 17. Auditoría ejecutada del propio plan

El código de las secciones 5 a 10 no se quedó en el documento: se implementó y se le pasaron las pruebas con fixtures sintéticos antes de dar el plan por bueno (`prototipos/auditoria.mjs`). **21 comprobaciones, dos fallos en la primera pasada.** Los dos eran del plan, no de la prueba.

| # | Hallazgo | Gravedad | Corrección |
|---|---|---|---|
| **A-1** | `readline` **descarta el retorno de carro** de CRLF, así que `offset += Buffer.byteLength(linea) + 1` se queda un byte corto por línea. En un fichero de Windows con dos líneas el offset acabó en 692 frente a un tamaño de 694: al reanudar, la lectura empieza dentro de la línea anterior | **Alta**: silenciosa, y en Windows —la plataforma del titular— corrompe todo indexado incremental | Lector reescrito troceando buffers por `0x0a` (§5). Efecto secundario: **9,1 s en vez de 10,9 s** sobre los 2,52 GB reales |
| **A-2** | `listar()` usaba `e.parentPath ?? e.path`; `parentPath` no existe en el Node que embarca VS Code y `path` cambió de significado entre versiones | Media: recorrido vacío o rutas mal formadas | Se usa el directorio de la pila (§9) |
| **A-3** | La marca de agua de Codex guardaba el offset pero no el acumulado: al reanudar un rollout que ya había tenido un reinicio de contexto, el tramo anterior se perdía | Media: infravalora sesiones largas | `Marca.codex = { base, ultimo }` (§4 y §7) |
| **A-4** | El contador de líneas ilegibles no cuenta lo que promete: el filtro barato por `"usage"` descarta las líneas corruptas antes del parser. Sobre datos reales daba 1 en vez de 3 | Baja: solo afecta al diagnóstico | Se documenta qué mide y P-04 se redefine en consecuencia |

Tras las correcciones, **21 de 21 en verde**, y el núcleo corregido reprocesó el histórico real: 760 ficheros, 92.666 mensajes únicos, **$29.087**, 285 proyectos tras normalizar —los dos `C:\Users\kirne` fusionados en una sola fila de $11.083, que antes aparecían separados como $7.074 y $4.008.

Lo que esta pasada **no** cubre y queda para la Fase 1: el lector de Codex solo está probado contra rollouts reales, no contra fixtures con reinicio de contexto (P-07); la licencia, la interfaz y la privacidad (P-12 a P-15) no tienen código todavía.

---

## 18. Lo que este plan no cubre

Copilot, Gemini CLI, OpenRouter y modelos locales; panel de equipo y agregación entre máquinas; sincronización entre dispositivos; recomendación automática de qué excluir del contexto; detección de secretos antes del envío. Todo eso estaba en la ficha 4 original y ninguna decisión de este plan lo bloquea: el `Registro` admite proveedores nuevos sin cambios, y la agregación no sabe de dónde vino el dato.

Tampoco cubre el **panel de contexto en vivo** —qué archivos están entrando ahora mismo en el prompt—, que era la otra mitad del nombre original «Cost & Context». Se deja fuera a propósito: es un producto distinto, con un público distinto, y ya hay siete extensiones que dibujan esa barra.
