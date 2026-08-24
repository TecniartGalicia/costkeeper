import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { agregar, diaHace, fechaLocal } from '../core/consulta/agregar';
import { normalizarProyecto } from '../core/normalizar';
import { ventanaClaude } from '../core/cuota';
import { formatearImporte, leerAjustes } from '../vscode/ajustes';
import type { Estado } from '../vscode/estado';

/**
 * Gasto de hoy del proyecto abierto y, si hay ventana abierta, lo que queda de
 * ella. Nada de porcentajes inventados para Claude.
 */
export class BarraEstado {
  private readonly item: vscode.StatusBarItem;
  private readonly desechables: vscode.Disposable[] = [];

  constructor(private readonly estado: Estado) {
    this.item = vscode.window.createStatusBarItem('costkeeper.hoy', vscode.StatusBarAlignment.Right, 90);
    this.item.command = 'costkeeper.abrir';
    this.item.name = 'CostKeeper';
    this.desechables.push(
      this.item,
      this.estado.alCambiar(() => this.refrescar()),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('costkeeper')) this.refrescar();
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refrescar()),
    );
    this.refrescar();
  }

  refrescar(ahora = new Date()): void {
    const ajustes = leerAjustes();
    if (!ajustes.barraDeEstado) {
      this.item.hide();
      return;
    }

    const registros = [...this.estado.registros];
    if (!registros.length) {
      this.item.hide();
      return;
    }

    const hoy = fechaLocal(ahora);
    const carpeta = (vscode.workspace.workspaceFolders ?? []).find((f) => f.uri.scheme === 'file');
    const proyecto = carpeta ? normalizarProyecto(carpeta.uri.fsPath) : undefined;

    const filtro = { desde: hoy, hasta: hoy, ...(proyecto ? { proyecto } : {}) };
    const filas = agregar(registros, 'proveedor', filtro, { tarifasExtra: ajustes.tarifasExtra });
    const usdHoy = filas.reduce((s, f) => s + f.usd, 0);
    const mensajes = filas.reduce((s, f) => s + f.mensajes, 0);

    const ventana = ventanaClaude(registros, ahora);
    const importe = formatearImporte(usdHoy, ajustes, 2);
    this.item.text = ventana ? `$(pulse) ${importe} · ${duracionCorta(ventana.minutosRestantes)}` : `$(pulse) ${importe}`;

    const lineas = [
      proyecto ? l10n.t('**CostKeeper** · today in this project') : l10n.t('**CostKeeper** · today, all projects'),
      l10n.t('{0} in API-equivalent cost across {1} messages.', importe, String(mensajes)),
    ];
    if (ventana) {
      lineas.push(l10n.t('Claude window: {0} left (derived from timestamps, not published by Claude Code).', duracionCorta(ventana.minutosRestantes)));
    }
    const semana = agregar(registros, 'proveedor', { desde: diaHace(6, ahora), hasta: hoy, ...(proyecto ? { proyecto } : {}) }, { tarifasExtra: ajustes.tarifasExtra });
    lineas.push(l10n.t('Last 7 days: {0}.', formatearImporte(semana.reduce((s, f) => s + f.usd, 0), ajustes, 2)));

    const md = new vscode.MarkdownString(lineas.join('\n\n'));
    md.isTrusted = false;
    this.item.tooltip = md;
    this.item.show();
  }

  dispose(): void {
    for (const d of this.desechables) d.dispose();
  }
}

function duracionCorta(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}
