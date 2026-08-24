import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { mensajeClaude, rolloutCodex, tokenCount } from '../fixtures/generar';

/**
 * Ejecución hermética:
 *  - COSTKEEPER_HOME apunta a un directorio temporal con transcripciones de
 *    prueba, así que la suite nunca lee el histórico real de quien la lanza;
 *  - VS Code arranca con su propio user-data-dir y sin más extensiones.
 */
async function main(): Promise<void> {
  // Lanzado desde un terminal dentro de VS Code, el host pone ELECTRON_RUN_AS_NODE=1
  // y el VS Code de pruebas arrancaría como Node pelado.
  delete process.env.ELECTRON_RUN_AS_NODE;

  const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'costkeeper-it-'));
  const home = path.join(tmp, 'home');
  const proyecto = path.join(home, '.claude', 'projects', 'C--proyecto-demo');
  fs.mkdirSync(proyecto, { recursive: true });
  fs.writeFileSync(
    path.join(proyecto, 'sesion.jsonl'),
    [
      // El mismo mensaje tres veces: el índice debe cobrar uno.
      mensajeClaude({ id: 'msg-uno', salida: 10, cwd: 'C:\\proyecto\\demo' }),
      mensajeClaude({ id: 'msg-uno', salida: 400, cwd: 'C:\\proyecto\\demo' }),
      mensajeClaude({ id: 'msg-uno', salida: 120, cwd: 'C:\\proyecto\\demo' }),
      mensajeClaude({ id: 'msg-dos', salida: 50, cwd: 'C:\\proyecto\\demo', prompt: 'CANARIO-INTEGRACION' }),
    ].join('\n') + '\n',
  );
  const rollouts = path.join(home, '.codex', 'sessions', '2026', '08', '24');
  fs.mkdirSync(rollouts, { recursive: true });
  fs.writeFileSync(
    path.join(rollouts, 'rollout-2026-08-24T10-00-00-demo.jsonl'),
    rolloutCodex({ sesion: 'demo', cwd: 'C:/proyecto/demo', eventos: [tokenCount(100), tokenCount(900, { usadoPorCiento: 42 })] }),
  );

  const workspace = path.join(tmp, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const userData = path.join(extensionDevelopmentPath, '.vscode-test', 'user-data');

  // La misma suite contra otro host compatible (Cursor, VSCodium…).
  const vscodeExecutablePath = process.env.COSTKEEPER_VSCODE_EXE || undefined;
  if (vscodeExecutablePath) console.log(`Suite de integración en: ${vscodeExecutablePath}`);
  try {
    await runTests({
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [workspace, `--user-data-dir=${userData}`, '--disable-extensions'],
      extensionTestsEnv: { COSTKEEPER_HOME: home, COSTKEEPER_IT_TMP: tmp, COSTKEEPER_IT_USERDATA: userData },
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('Fallaron las pruebas de integración', err);
  process.exit(1);
});
