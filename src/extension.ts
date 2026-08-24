import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { diaHace, fechaLocal, type Eje } from './core/consulta/agregar';
import { Estado } from './vscode/estado';
import { log } from './vscode/registro';
import { Panel } from './ui/panel';
import { BarraEstado } from './ui/barraEstado';
import { avisarPresupuestos, etiquetarCliente, exportarCsv, ponerPresupuesto, recorteGratis } from './pro/features';
import { activateLicenseCommand, isPro, deactivateLicenseCommand } from './pro/licenseService';
import { PRO_ACTIVO } from './pro/polarConfig';
import { leerAjustes } from './vscode/ajustes';

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  // Mientras la extensión sea gratis, los comandos de licencia no salen en la paleta.
  void vscode.commands.executeCommand('setContext', 'costkeeper.proDisponible', PRO_ACTIVO);

  const estado = new Estado(ctx.globalStorageUri.fsPath);
  const barra = new BarraEstado(estado);
  ctx.subscriptions.push(estado, barra);

  const registrar = (id: string, fn: () => Promise<void> | void) =>
    ctx.subscriptions.push(vscode.commands.registerCommand(id, () => Promise.resolve(fn()).catch(fallo)));

  registrar('costkeeper.abrir', async () => {
    await estado.asegurarCargado();
    Panel.mostrar(ctx, estado); // se abre con lo que ya hay: nadie espera once segundos
    if (leerAjustes().indexarAlAbrir) {
      await estado.actualizar(false);
      await avisarPresupuestos(ctx, estado);
    }
  });

  registrar('costkeeper.indexar', async () => {
    await estado.actualizar(true);
    await avisarPresupuestos(ctx, estado);
    const r = estado.ultimoIndexado;
    if (r) {
      void vscode.window.showInformationMessage(
        l10n.t('CostKeeper: {0} messages indexed from {1} files in {2} s.', String(r.registros), String(r.ficheros), (r.ms / 1000).toFixed(1)),
      );
    }
  });

  registrar('costkeeper.exportar', async () => {
    await estado.asegurarCargado();
    const ejes: { label: string; eje: Eje }[] = [
      { label: l10n.t('By project'), eje: 'proyecto' },
      { label: l10n.t('By client'), eje: 'cliente' },
      { label: l10n.t('By model'), eje: 'modelo' },
      { label: l10n.t('By day'), eje: 'dia' },
      { label: l10n.t('By branch'), eje: 'rama' },
      { label: l10n.t('By session'), eje: 'sesion' },
    ];
    const eje = await vscode.window.showQuickPick(ejes, { title: l10n.t('Group the report by…') });
    if (!eje) return;
    const rangos = [
      { label: l10n.t('This month'), dias: new Date().getDate() },
      { label: l10n.t('Last 30 days'), dias: 30 },
      { label: l10n.t('Last 90 days'), dias: 90 },
      { label: l10n.t('Everything'), dias: 3650 },
    ];
    const rango = await vscode.window.showQuickPick(rangos, { title: l10n.t('Which range?') });
    if (!rango) return;
    const pro = await isPro(ctx);
    const filtro = recorteGratis({ desde: diaHace(rango.dias - 1), hasta: fechaLocal(new Date()) }, pro, new Date());
    await exportarCsv(ctx, estado, eje.eje, filtro);
  });

  registrar('costkeeper.etiquetarCliente', async () => {
    await estado.asegurarCargado();
    await etiquetarCliente(ctx, estado);
  });

  registrar('costkeeper.presupuesto', async () => {
    await estado.asegurarCargado();
    await ponerPresupuesto(ctx, estado);
  });

  registrar('costkeeper.introducirLicencia', () => activateLicenseCommand(ctx));
  registrar('costkeeper.quitarLicencia', () => deactivateLicenseCommand(ctx));

  registrar('costkeeper.reconstruir', async () => {
    const si = l10n.t('Rebuild');
    const pick = await vscode.window.showWarningMessage(
      l10n.t('Rebuild the index from scratch?'),
      { modal: true, detail: l10n.t('Reads every transcript again. Nothing is deleted from your agents; only CostKeeper’s own index is rewritten.') },
      si,
    );
    if (pick !== si) return;
    await estado.reconstruir();
  });

  log('CostKeeper activado');
}

export function deactivate(): void {
  /* el índice se guarda en cada actualización */
}

function fallo(e: unknown): void {
  const mensaje = e instanceof Error ? e.message : String(e);
  log(`Error en comando: ${mensaje}`);
  void vscode.window.showErrorMessage(l10n.t('CostKeeper: {0}', mensaje));
}
