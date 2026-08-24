import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cargar, guardar, indiceVacio, type Indice } from '../../core/indice/almacen';
import { fundir, indexar, listar } from '../../core/indice/indexador';
import { leerFichero } from '../../core/lectores/claude';
import { costeDe } from '../../core/precios/coste';
import { mensajeClaude, rolloutCodex, tokenCount } from '../fixtures/generar';
import type { Registro } from '../../core/tipos';

let dir: string;
let home: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-idx-'));
  home = path.join(dir, 'home');
  fs.mkdirSync(path.join(home, '.claude', 'projects', 'proy'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex', 'sessions', '2026', '08', '24'), { recursive: true });
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const transcript = (nombre: string, lineas: string[]): string => {
  const p = path.join(home, '.claude', 'projects', 'proy', nombre);
  fs.writeFileSync(p, lineas.join('\n') + '\n');
  return p;
};

describe('deduplicación', () => {
  it('P-01 · un mensaje repetido en dos ficheros es un solo cobro', async () => {
    transcript('a.jsonl', [mensajeClaude({ id: 'x', salida: 10 }), mensajeClaude({ id: 'x', salida: 400 }), mensajeClaude({ id: 'x', salida: 120 })]);
    transcript('b.jsonl', [mensajeClaude({ id: 'x', salida: 400 })]);
    const ind = indiceVacio();
    const r = await indexar(ind, { home });
    assert.equal(ind.registros.size, 1);
    assert.equal(r.registros, 1);
  });

  it('P-02 · gana la aparición de mayor salida', async () => {
    transcript('c.jsonl', [mensajeClaude({ id: 'y', salida: 10 }), mensajeClaude({ id: 'y', salida: 400 }), mensajeClaude({ id: 'y', salida: 120 })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    assert.equal(ind.registros.get('y')!.salida, 400);
  });

  it('P-02 · a igual salida gana la de mayor entrada total', () => {
    const ind = indiceVacio();
    const base: Registro = {
      id: 'z', proveedor: 'claude', ts: '', proyecto: 'p', rama: '', sesion: '', subagente: false,
      modelo: 'claude-opus-5', entrada: 10, salida: 100, cacheLectura: 0, cacheEscritura5m: 0, cacheEscritura1h: 0,
      razonamiento: 0, fuentes: ['f'],
    };
    fundir(ind, base);
    fundir(ind, { ...base, entrada: 900 });
    assert.equal(ind.registros.get('z')!.entrada, 900);
    fundir(ind, { ...base, entrada: 5 });
    assert.equal(ind.registros.get('z')!.entrada, 900);
  });

  it('el coste tras deduplicar es el de un solo mensaje', async () => {
    transcript('d.jsonl', [mensajeClaude({ id: 'w', salida: 400 }), mensajeClaude({ id: 'w', salida: 400 }), mensajeClaude({ id: 'w', salida: 400 })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    const total = [...ind.registros.values()].reduce((s, r) => s + (costeDe(r).usd ?? 0), 0);
    const esperado = (100 * 5 + 1000 * 5 * 0.1 + 200 * 5 * 1.25 + 500 * 5 * 2 + 400 * 25) / 1e6;
    assert.ok(Math.abs(total - esperado) < 1e-12, `${total} != ${esperado}`);
  });
});

describe('indexado incremental', () => {
  it('P-05 · no relee lo ya leído y no duplica', async () => {
    const p = transcript('e.jsonl', [mensajeClaude({ id: 'm1' }), mensajeClaude({ id: 'm2' })]);
    const ind = indiceVacio();
    const r1 = await indexar(ind, { home });
    assert.equal(r1.leidos, 1);

    const r2 = await indexar(ind, { home });
    assert.equal(r2.leidos, 0, 'sin cambios no se relee nada');
    assert.equal(ind.registros.size, 2);

    fs.appendFileSync(p, mensajeClaude({ id: 'm3' }) + '\n');
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 3);
  });

  it('P-06 · un fichero reescrito purga sus registros', async () => {
    const p = transcript('f.jsonl', [mensajeClaude({ id: 'z1' }), mensajeClaude({ id: 'z2' })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 2);

    fs.writeFileSync(p, mensajeClaude({ id: 'z9' }) + '\n');
    await indexar(ind, { home });
    assert.deepEqual([...ind.registros.keys()], ['z9']);
  });

  it('un mensaje que vive en dos ficheros sobrevive a que se borre uno', async () => {
    const a = transcript('dos-a.jsonl', [mensajeClaude({ id: 'compartido', salida: 400 })]);
    transcript('dos-b.jsonl', [mensajeClaude({ id: 'compartido', salida: 400 })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 1);
    assert.equal(ind.registros.get('compartido')!.fuentes.length, 2);

    fs.rmSync(a);
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 1, 'el cobro sigue vivo en el otro fichero');
    assert.deepEqual(ind.registros.get('compartido')!.fuentes.length, 1);
  });

  it('un fichero borrado deja de contar', async () => {
    const p = transcript('g.jsonl', [mensajeClaude({ id: 'q1' })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 1);
    fs.rmSync(p);
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 0);
    assert.equal(ind.marcas.size, 0);
  });

  it('cancelar deja el trabajo hecho y lo marca', async () => {
    transcript('h1.jsonl', [mensajeClaude({ id: 'c1' })]);
    transcript('h2.jsonl', [mensajeClaude({ id: 'c2' })]);
    transcript('h3.jsonl', [mensajeClaude({ id: 'c3' })]);
    const ind = indiceVacio();
    let n = 0;
    const r = await indexar(ind, { home, cancelado: () => n++ >= 2 });
    assert.equal(r.cancelado, true);
    assert.ok(ind.registros.size >= 1 && ind.registros.size < 3);
  });

  it('lee también los rollouts de Codex', async () => {
    transcript('i.jsonl', [mensajeClaude({ id: 'k1' })]);
    fs.writeFileSync(
      path.join(home, '.codex', 'sessions', '2026', '08', '24', 'rollout-2026-08-24T10-00-00-abc.jsonl'),
      rolloutCodex({ sesion: 'abc', eventos: [tokenCount(1000)] }),
    );
    const ind = indiceVacio();
    await indexar(ind, { home });
    assert.equal(ind.registros.size, 2);
    assert.ok(ind.registros.has('codex:abc'));
  });

  it('lee carpetas adicionales de los ajustes', async () => {
    const extra = path.join(dir, 'otro');
    fs.mkdirSync(extra, { recursive: true });
    fs.writeFileSync(path.join(extra, 'x.jsonl'), mensajeClaude({ id: 'extra1' }) + '\n');
    const ind = indiceVacio();
    await indexar(ind, { home, extra: [extra] });
    assert.ok(ind.registros.has('extra1'));
  });

  it('listar recorre subdirectorios', async () => {
    const hondo = path.join(home, '.claude', 'projects', 'proy', 'a', 'b');
    fs.mkdirSync(hondo, { recursive: true });
    fs.writeFileSync(path.join(hondo, 'j.jsonl'), mensajeClaude({ id: 'hondo' }) + '\n');
    const encontrados = await listar(path.join(home, '.claude', 'projects'), (n) => n.endsWith('.jsonl'));
    assert.equal(encontrados.length, 1);
  });
});

describe('almacén', () => {
  it('guarda y carga registros y marcas', async () => {
    const p = transcript('k.jsonl', [mensajeClaude({ id: 'g1' }), mensajeClaude({ id: 'g2' })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    const destino = path.join(dir, 'idx');
    await guardar(destino, ind);

    const leido = await cargar(destino);
    assert.equal(leido.registros.size, 2);
    assert.equal(leido.marcas.get(p)!.offset, fs.statSync(p).size);
  });

  it('un índice de otra versión se descarta en vez de romper', async () => {
    const destino = path.join(dir, 'idx2');
    fs.mkdirSync(destino, { recursive: true });
    fs.writeFileSync(path.join(destino, 'marcas.json'), JSON.stringify({ version: 999, marcas: {} }));
    const leido = await cargar(destino);
    assert.equal(leido.registros.size, 0);
  });

  it('un directorio sin índice devuelve índice vacío', async () => {
    const leido: Indice = await cargar(path.join(dir, 'no-existe'));
    assert.equal(leido.registros.size, 0);
    assert.equal(leido.marcas.size, 0);
  });

  it('P-13 · el índice no guarda ni un carácter de prompt', async () => {
    const secreto = 'CANARIO-SECRETO-9f3a';
    transcript('l.jsonl', [mensajeClaude({ id: 'p1', prompt: secreto })]);
    const ind = indiceVacio();
    await indexar(ind, { home });
    const destino = path.join(dir, 'idx3');
    await guardar(destino, ind);

    const crudo = fs.readFileSync(path.join(destino, 'registros.ndjson.gz'));
    assert.ok(!crudo.includes(Buffer.from(secreto)), 'el prompt no puede estar ni comprimido');
    const serializado = JSON.stringify([...ind.registros.values()]);
    assert.ok(!serializado.includes(secreto));
  });

  it('lee lo que escribe aunque haya una fila ilegible', async () => {
    const p = transcript('m.jsonl', [mensajeClaude({ id: 'r1' })]);
    const a = await leerFichero(p, undefined, fs.statSync(p));
    assert.equal(a.registros.length, 1);
  });
});
