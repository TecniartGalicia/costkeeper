import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { agregar, resumir, type Eje, type Filtro } from '../core/consulta/agregar';
import { DIAS_GRATIS, recorteGratis } from '../core/plan';
import { filasACsv, resumenACsv } from '../core/exportar';
import { FECHA_TARIFAS } from '../core/precios/coste';
import { claveAviso, comprobarPresupuestos, type Presupuesto } from '../core/presupuesto';
import { normalizarProyecto, nombreCortoProyecto } from '../core/normalizar';
import type { Estado } from '../vscode/estado';
import { leerAjustes } from '../vscode/ajustes';
import { log } from '../vscode/registro';
import { ensurePro, isPro } from './licenseService';

const ESTADO_CLIENTES = 'costkeeper.clientes';
const ESTADO_PRESUPUESTOS = 'costkeeper.presupuestos';
const ESTADO_AVISOS = 'costkeeper.avisosMostrados';

export function clientes(ctx: vscode.ExtensionContext): Record<string, string> {
  return ctx.globalState.get<Record<string, string>>(ESTADO_CLIENTES) ?? {};
}

export function presupuestos(ctx: vscode.ExtensionContext): Presupuesto[] {
  return ctx.globalState.get<Presupuesto[]>(ESTADO_PRESUPUESTOS) ?? [];
}

// --- Etiquetas de cliente ---------------------------------------------------

export async function etiquetarCliente(ctx: vscode.ExtensionContext, estado: Estado, proyectoSugerido?: string): Promise<void> {
  if (!(await ensurePro(ctx, l10n.t('Client tagging')))) return;

  const filas = agregar(estado.registros, 'proyecto');
  if (!filas.length) {
    void vscode.window.showInformationMessage(l10n.t('Nothing indexed yet. Run "CostKeeper: Update index" first.'));
    return;
  }
  const actuales = clientes(ctx);
  const proyecto =
    proyectoSugerido ??
    (
      await vscode.window.showQuickPick(
        filas.map((f) => ({
          label: nombreCortoProyecto(f.clave),
          description: actuales[f.clave] ? l10n.t('client: {0}', actuales[f.clave]) : undefined,
          detail: f.clave,
          proyecto: f.clave,
        })),
        { title: l10n.t('Which project?'), matchOnDetail: true },
      )
    )?.proyecto;
  if (!proyecto) return;

  const cliente = await vscode.window.showInputBox({
    title: l10n.t('Client for {0}', nombreCortoProyecto(proyecto)),
    prompt: l10n.t('Used to group cost by client in the panel and in the CSV. Leave empty to remove the tag.'),
    value: actuales[proyecto] ?? '',
    ignoreFocusOut: true,
  });
  if (cliente === undefined) return;

  const siguiente = { ...actuales };
  if (cliente.trim()) siguiente[proyecto] = cliente.trim();
  else delete siguiente[proyecto];
  await ctx.globalState.update(ESTADO_CLIENTES, siguiente);
  log(`Cliente de un proyecto ${cliente.trim() ? 'asignado' : 'quitado'}`);
}

// --- Presupuestos -----------------------------------------------------------

export async function ponerPresupuesto(ctx: vscode.ExtensionContext, estado: Estado): Promise<void> {
  if (!(await ensurePro(ctx, l10n.t('Budgets')))) return;

  const filas = agregar(estado.registros, 'proyecto');
  const opciones = [
    { label: l10n.t('All projects on this computer'), proyecto: '*' },
    ...filas.map((f) => ({ label: nombreCortoProyecto(f.clave), detail: f.clave, proyecto: f.clave })),
  ];
  const elegido = await vscode.window.showQuickPick(opciones, { title: l10n.t('Monthly budget for…'), matchOnDetail: true });
  if (!elegido) return;

  const actuales = presupuestos(ctx);
  const previo = actuales.find((p) => p.proyecto === elegido.proyecto);
  const texto = await vscode.window.showInputBox({
    title: l10n.t('Monthly budget in USD of API-equivalent cost'),
    prompt: l10n.t('You get a notice at 50, 80 and 100 %. Leave empty to remove the budget.'),
    value: previo ? String(previo.usdMes) : '',
    ignoreFocusOut: true,
    validateInput: (v) => (v.trim() === '' || Number(v) > 0 ? undefined : l10n.t('Enter a number greater than zero')),
  });
  if (texto === undefined) return;

  const resto = actuales.filter((p) => p.proyecto !== elegido.proyecto);
  const siguiente = texto.trim() ? [...resto, { proyecto: elegido.proyecto, usdMes: Number(texto) }] : resto;
  await ctx.globalState.update(ESTADO_PRESUPUESTOS, siguiente);
  void vscode.window.showInformationMessage(texto.trim() ? l10n.t('Budget saved.') : l10n.t('Budget removed.'));
}

/** Avisa una sola vez por umbral y mes. */
export async function avisarPresupuestos(ctx: vscode.ExtensionContext, estado: Estado, ahora = new Date()): Promise<void> {
  const lista = presupuestos(ctx);
  if (!lista.length || !(await isPro(ctx))) return;

  const ajustes = leerAjustes();
  const avisos = comprobarPresupuestos(estado.registros, lista, ahora, { tarifasExtra: ajustes.tarifasExtra, clientes: clientes(ctx) });
  const mostrados = ctx.globalState.get<string[]>(ESTADO_AVISOS) ?? [];
  const nuevos: string[] = [];

  for (const a of avisos) {
    const clave = claveAviso(a, ahora);
    if (mostrados.includes(clave)) continue;
    nuevos.push(clave);
    const donde = a.proyecto === '*' ? l10n.t('this computer') : nombreCortoProyecto(a.proyecto);
    const mensaje =
      a.umbral === 100
        ? l10n.t('CostKeeper: {0} has gone over its monthly budget ({1} of {2} USD API-equivalent).', donde, a.usd.toFixed(2), String(a.limite))
        : l10n.t('CostKeeper: {0} is at {1} % of its monthly budget ({2} of {3} USD API-equivalent).', donde, String(a.umbral), a.usd.toFixed(2), String(a.limite));
    void vscode.window.showWarningMessage(mensaje);
  }
  if (nuevos.length) {
    // Se guardan solo las claves del mes en curso: la lista no crece sin fin.
    const delMes = [...mostrados, ...nuevos].filter((c) => c.startsWith(claveAviso(avisos[0]!, ahora).split('|')[0]));
    await ctx.globalState.update(ESTADO_AVISOS, delMes);
  }
}

// --- Exportación ------------------------------------------------------------

export async function exportarCsv(ctx: vscode.ExtensionContext, estado: Estado, eje: Eje, filtro: Filtro): Promise<void> {
  if (!(await ensurePro(ctx, l10n.t('CSV export')))) return;

  const ajustes = leerAjustes();
  const opciones = { tarifasExtra: ajustes.tarifasExtra, clientes: clientes(ctx) };
  const filas = agregar(estado.registros, eje, filtro, opciones);
  if (!filas.length) {
    void vscode.window.showInformationMessage(l10n.t('Nothing to export for that range.'));
    return;
  }
  const resumen = resumir(estado.registros, filtro, opciones);
  const nombre = `costkeeper-${eje}-${resumen.desde || 'inicio'}-${resumen.hasta || 'hoy'}.csv`;
  const destino = await vscode.window.showSaveDialog({
    title: l10n.t('Export CostKeeper report'),
    defaultUri: vscode.Uri.file(path.join(os.homedir(), nombre)),
    filters: { CSV: ['csv'] },
  });
  if (!destino) return;

  await fs.writeFile(destino.fsPath, resumenACsv(resumen, filas, eje, FECHA_TARIFAS), 'utf8');
  log(`Exportadas ${filas.length} filas por ${eje}`);
  const abrir = l10n.t('Open');
  const pick = await vscode.window.showInformationMessage(
    l10n.t('Report exported. It contains aggregates only: no prompts, no code.'),
    abrir,
  );
  if (pick === abrir) await vscode.commands.executeCommand('vscode.open', destino);
}

/** Solo para el CSV rápido del panel, sin diálogo de eje. */
export function proyectoDelWorkspace(): string | undefined {
  const carpeta = (vscode.workspace.workspaceFolders ?? []).find((f) => f.uri.scheme === 'file');
  return carpeta ? normalizarProyecto(carpeta.uri.fsPath) : undefined;
}

export { filasACsv, DIAS_GRATIS, recorteGratis };
