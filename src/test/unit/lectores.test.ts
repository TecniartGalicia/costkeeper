import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { leerDesde } from '../../core/lectores/lineas';
import { leerFichero } from '../../core/lectores/claude';
import { leerRollout } from '../../core/lectores/codex';
import { mensajeClaude, rolloutCodex, tokenCount } from '../fixtures/generar';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const escribir = (nombre: string, contenido: string): string => {
  const p = path.join(dir, nombre);
  fs.writeFileSync(p, contenido);
  return p;
};
const stat = (p: string) => fs.statSync(p);
const BR = String.fromCharCode(10);

describe('leerDesde', () => {
  it('cuenta el offset en bytes con LF', async () => {
    const p = escribir('a.jsonl', 'uno\ndos\n');
    const trozos = [];
    for await (const t of leerDesde(p)) trozos.push(t);
    assert.deepEqual(trozos.map((t) => t.linea), ['uno', 'dos']);
    assert.equal(trozos[1].finOffset, stat(p).size);
  });

  it('P-04b · cuenta el offset en bytes con CRLF', async () => {
    const p = escribir('b.jsonl', 'uno\r\ndos\r\n');
    const trozos = [];
    for await (const t of leerDesde(p)) trozos.push(t);
    assert.equal(trozos.length, 2);
    assert.equal(trozos[trozos.length - 1].finOffset, stat(p).size, 'el offset debe coincidir con el tamaño del fichero');
  });

  it('cuenta el offset en bytes con caracteres multibyte', async () => {
    const p = escribir('c.jsonl', 'ñандемоji😀\nsegunda\n');
    const trozos = [];
    for await (const t of leerDesde(p)) trozos.push(t);
    assert.equal(trozos[1].finOffset, stat(p).size);
    assert.equal(trozos[0].linea, 'ñандемоji😀');
  });

  it('P-04c · no entrega la cola sin salto final', async () => {
    const p = escribir('d.jsonl', 'completa\nincompl');
    const trozos = [];
    for await (const t of leerDesde(p)) trozos.push(t);
    assert.deepEqual(trozos.map((t) => t.linea), ['completa']);
  });

  it('reanuda desde un offset sin partir líneas', async () => {
    const p = escribir('e.jsonl', 'uno\ndos\n');
    let offset = 0;
    for await (const t of leerDesde(p)) {
      offset = t.finOffset;
      break;
    }
    const resto = [];
    for await (const t of leerDesde(p, offset)) resto.push(t.linea);
    assert.deepEqual(resto, ['dos']);
  });
});

describe('lector de Claude Code', () => {
  it('P-04 · una línea ilegible no aborta el fichero', async () => {
    const p = escribir(
      'f.jsonl',
      [mensajeClaude({ id: 'a', salida: 10 }), '{"message":{"usage":roto', '', '{"type":"assistant","message":{"usage":{"input_tokens":1}}}', mensajeClaude({ id: 'b', salida: 20 })].join('\n') + '\n',
    );
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros.length, 2);
    assert.equal(r.ilegibles, 1, 'solo cuenta las líneas con usage que no parsean');
  });

  it('P-03 · separa la escritura de caché por TTL', async () => {
    const p = escribir('g.jsonl', mensajeClaude({ id: 'a', cache1h: 500, cache5m: 200 }) + '\n');
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros[0].cacheEscritura1h, 500);
    assert.equal(r.registros[0].cacheEscritura5m, 200);
    assert.equal(r.registros[0].cacheDerivada, undefined);
  });

  it('P-03 · el formato antiguo se imputa a 5 m y se marca derivado', async () => {
    const linea = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-08-24T10:00:00.000Z',
      cwd: '/proy',
      sessionId: 's',
      message: { id: 'v', model: 'claude-opus-5', usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 999 } },
    });
    const p = escribir('h.jsonl', linea + '\n');
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros[0].cacheEscritura5m, 999);
    assert.equal(r.registros[0].cacheEscritura1h, 0);
    assert.equal(r.registros[0].cacheDerivada, true);
  });

  it('P-05 · la segunda pasada solo lee lo nuevo', async () => {
    const p = escribir('i.jsonl', [mensajeClaude({ id: 'm1' }), mensajeClaude({ id: 'm2' })].join('\n') + '\n');
    const a1 = await leerFichero(p, undefined, stat(p));
    assert.equal(a1.registros.length, 2);
    assert.equal(a1.marca.offset, stat(p).size);

    fs.appendFileSync(p, mensajeClaude({ id: 'm3' }) + '\n');
    const a2 = await leerFichero(p, a1.marca, stat(p));
    assert.deepEqual(a2.registros.map((r) => r.id), ['m3']);
  });

  it('P-06 · un fichero truncado se relee entero', async () => {
    const p = escribir('j.jsonl', [mensajeClaude({ id: 'z1' }), mensajeClaude({ id: 'z2' })].join('\n') + '\n');
    const a1 = await leerFichero(p, undefined, stat(p));
    fs.writeFileSync(p, mensajeClaude({ id: 'z9' }) + '\n');
    const a2 = await leerFichero(p, a1.marca, stat(p));
    assert.deepEqual(a2.registros.map((r) => r.id), ['z9']);
    assert.equal(a2.marca.offset, stat(p).size);
  });

  it('materializa entera una línea gigante partida en muchos trozos', async () => {
    const relleno = 'x'.repeat(3_000_000);
    const p = escribir('gigante.jsonl', '{"basura":"' + relleno + '"}' + BR + mensajeClaude({ id: 'tras-gigante' }) + BR);
    const r = await leerFichero(p, undefined, stat(p));
    assert.deepEqual(r.registros.map((x) => x.id), ['tras-gigante']);
    assert.equal(r.ilegibles, 0);
    assert.equal(r.marca.offset, stat(p).size);
  });

  it('reconoce la aguja aunque aparezca al final de una línea larga', async () => {
    const relleno = 'y'.repeat(200_000);
    const linea = JSON.stringify({ type: 'assistant', relleno, message: { id: 'largo', model: 'claude-opus-5', usage: { input_tokens: 7, output_tokens: 3 } } });
    const p = escribir('largo.jsonl', linea + BR);
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros.length, 1, 'la línea debe materializarse entera, no solo su último trozo');
    assert.equal(r.registros[0].entrada, 7);
  });

  it('ignora campos que faltan sin romperse', async () => {
    const linea = JSON.stringify({ type: 'assistant', message: { id: 'x', usage: { output_tokens: 5 } } });
    const p = escribir('k.jsonl', linea + '\n');
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros.length, 1);
    assert.equal(r.registros[0].proyecto, '(desconocido)');
    assert.equal(r.registros[0].modelo, '');
    assert.equal(r.registros[0].ts, '');
  });

  it('descarta valores negativos o no numéricos', async () => {
    const linea = JSON.stringify({ type: 'assistant', message: { id: 'y', model: 'claude-opus-5', usage: { input_tokens: -5, output_tokens: 'muchos', cache_read_input_tokens: null } } });
    const p = escribir('l.jsonl', linea + '\n');
    const r = await leerFichero(p, undefined, stat(p));
    assert.equal(r.registros[0].entrada, 0);
    assert.equal(r.registros[0].salida, 0);
    assert.equal(r.registros[0].cacheLectura, 0);
  });
});

describe('lector de Codex', () => {
  it('P-07 · usa el último acumulado, no la suma de los eventos', async () => {
    const p = escribir('rollout-a.jsonl', rolloutCodex({ sesion: 's1', cwd: '/proy', eventos: [tokenCount(100), tokenCount(500), tokenCount(1200)] }));
    const r = await leerRollout(p, undefined, stat(p));
    assert.equal(r.registros.length, 1);
    assert.equal(r.registros[0].entrada, 1200);
    assert.equal(r.registros[0].id, 'codex:s1');
  });

  it('P-07 · un reinicio de contexto suma los tramos', async () => {
    const p = escribir('rollout-b.jsonl', rolloutCodex({ sesion: 's2', eventos: [tokenCount(100), tokenCount(900), tokenCount(50), tokenCount(300)] }));
    const r = await leerRollout(p, undefined, stat(p));
    assert.equal(r.registros[0].entrada, 900 + 300);
  });

  it('P-07 · reanudar conserva el acumulado y los tramos', async () => {
    const p = escribir('rollout-c.jsonl', rolloutCodex({ sesion: 's3', eventos: [tokenCount(100), tokenCount(900)] }));
    const a1 = await leerRollout(p, undefined, stat(p));
    assert.equal(a1.registros[0].entrada, 900);

    // Reinicio de contexto después de la primera pasada.
    fs.appendFileSync(p, [tokenCount(50), tokenCount(400)].join('\n') + '\n');
    const a2 = await leerRollout(p, a1.marca, stat(p));
    assert.equal(a2.registros[0].entrada, 900 + 400, 'el tramo anterior no se puede perder al reanudar');
  });

  it('lee cuota, proyecto y modelo', async () => {
    const p = escribir('rollout-d.jsonl', rolloutCodex({ sesion: 's4', cwd: 'C:/Proy', modelo: 'gpt-5.6-sol', eventos: [tokenCount(10, { usadoPorCiento: 69, ventanaMinutos: 10080, reiniciaEn: 1787860920, plan: 'plus' })] }));
    const r = await leerRollout(p, undefined, stat(p), 'win32');
    assert.equal(r.cuota?.usadoPorCiento, 69);
    assert.equal(r.cuota?.ventanaMinutos, 10080);
    assert.equal(r.cuota?.plan, 'plus');
    assert.equal(r.cuota?.confianza, 'exacto');
    assert.equal(r.registros[0].proyecto, 'c:/proy');
    assert.equal(r.registros[0].modelo, 'gpt-5.6-sol');
  });

  it('un rollout sin session_meta ni consumo no genera registro', async () => {
    const p = escribir('rollout-e.jsonl', '{"type":"otro"}\n');
    const r = await leerRollout(p, undefined, stat(p));
    assert.equal(r.registros.length, 0);
  });
});
