import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import * as vscode from 'vscode';

const ID = 'argalla.costkeeper';

async function extension(): Promise<vscode.Extension<unknown>> {
  const ext = vscode.extensions.getExtension(ID);
  assert.ok(ext, `la extensión ${ID} no está cargada`);
  if (!ext!.isActive) await ext!.activate();
  return ext!;
}

describe('CostKeeper · integración', () => {
  it('la extensión activa sin abrir nada', async () => {
    const ext = await extension();
    assert.equal(ext.isActive, true);
  });

  it('los comandos están registrados', async () => {
    await extension();
    const todos = await vscode.commands.getCommands(true);
    for (const id of [
      'costkeeper.abrir',
      'costkeeper.indexar',
      'costkeeper.exportar',
      'costkeeper.etiquetarCliente',
      'costkeeper.presupuesto',
      'costkeeper.introducirLicencia',
      'costkeeper.quitarLicencia',
      'costkeeper.reconstruir',
    ]) {
      assert.ok(todos.includes(id), `falta el comando ${id}`);
    }
  });

  it('indexa las transcripciones de prueba y deduplica', async function () {
    this.timeout(60_000);
    await extension();
    await vscode.commands.executeCommand('costkeeper.indexar');

    const home = process.env.COSTKEEPER_HOME!;
    assert.ok(home && fs.existsSync(home), 'la suite debe correr sobre un home de prueba');

    // El índice vive en el globalStorage del host; se localiza por nombre.
    const encontrado = buscarIndice();
    assert.ok(encontrado, 'no se ha escrito el índice');
    const texto = zlib.gunzipSync(fs.readFileSync(encontrado!)).toString('utf8');
    const filas = texto.split('\n').filter(Boolean).map((l) => JSON.parse(l));

    const claude = filas.filter((f) => f.proveedor === 'claude');
    assert.equal(claude.length, 2, 'un mensaje repetido tres veces se cobra una vez');
    const uno = claude.find((f) => f.id === 'msg-uno');
    assert.equal(uno.salida, 400, 'gana la aparición de mayor salida');

    const codex = filas.filter((f) => f.proveedor === 'codex');
    assert.equal(codex.length, 1);
    assert.equal(codex[0].entrada, 900, 'el acumulado de Codex no se suma evento a evento');

    assert.ok(!texto.includes('CANARIO-INTEGRACION'), 'el índice no puede contener texto de los prompts');
  });

  it('el panel se abre sin errores', async function () {
    this.timeout(30_000);
    await extension();
    await vscode.commands.executeCommand('costkeeper.abrir');
    // Si el webview lanzara al construirse, el comando habría rechazado.
    assert.ok(true);
  });

  it('reindexar dos veces no duplica', async function () {
    this.timeout(60_000);
    await extension();
    await vscode.commands.executeCommand('costkeeper.indexar');
    const antes = filasIndice().length;
    await vscode.commands.executeCommand('costkeeper.indexar');
    assert.equal(filasIndice().length, antes);
  });
});

function raizGlobalStorage(): string | undefined {
  const datos = process.env.COSTKEEPER_IT_USERDATA;
  return datos ? path.join(datos, 'User', 'globalStorage', 'argalla.costkeeper') : undefined;
}

function buscarIndice(): string | undefined {
  const dir = raizGlobalStorage();
  if (!dir) return undefined;
  const f = path.join(dir, 'registros.ndjson.gz');
  return fs.existsSync(f) ? f : undefined;
}

function filasIndice(): unknown[] {
  const f = buscarIndice();
  if (!f) return [];
  return zlib
    .gunzipSync(fs.readFileSync(f))
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}
