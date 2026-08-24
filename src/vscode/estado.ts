import * as os from 'os';
import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { borrar, cargar, guardar, indiceVacio, type Indice } from '../core/indice/almacen';
import { indexar, type ResultadoIndexado } from '../core/indice/indexador';
import { cuotasCodexVigentes } from '../core/cuota';
import type { Cuota } from '../core/tipos';
import { leerAjustes } from './ajustes';
import { log, rutaCorta } from './registro';

/**
 * Carpeta de inicio de la que cuelgan `.claude` y `.codex`. La variable de
 * entorno existe para que la suite de integración corra sobre transcripciones
 * de prueba en vez de sobre las del usuario.
 */
export function hogar(): string {
  return process.env.COSTKEEPER_HOME || os.homedir();
}

/**
 * Índice en memoria compartido por el panel, la barra de estado y los comandos.
 * Un solo indexado a la vez: los demás se enganchan al que ya corre.
 */
export class Estado {
  private indice: Indice = indiceVacio();
  private cargado = false;
  private enCurso: Promise<ResultadoIndexado | undefined> | undefined;
  private cuotasCodex: Cuota[] = [];
  private ultimo: ResultadoIndexado | undefined;
  private readonly emisor = new vscode.EventEmitter<void>();

  /** Se dispara cuando el índice cambia: el panel y la barra se refrescan solos. */
  readonly alCambiar = this.emisor.event;

  constructor(private readonly dir: string) {}

  get registros(): Iterable<import('../core/tipos').Registro> {
    return this.indice.registros.values();
  }

  get numeroRegistros(): number {
    return this.indice.registros.size;
  }

  get ultimoIndexado(): ResultadoIndexado | undefined {
    return this.ultimo;
  }

  cuotas(ahora: Date): Cuota[] {
    return cuotasCodexVigentes(this.cuotasCodex, ahora);
  }

  async asegurarCargado(): Promise<void> {
    if (this.cargado) return;
    this.indice = await cargar(this.dir);
    this.cargado = true;
    log(`Índice cargado: ${this.indice.registros.size} registros, ${this.indice.marcas.size} ficheros`);
    this.emisor.fire();
  }

  /**
   * Actualiza el índice. `visible` decide si el progreso va en notificación o
   * en la barra de estado. Cancelar guarda igualmente lo ya leído: la marca de
   * agua de cada fichero terminado es válida.
   */
  async actualizar(visible: boolean): Promise<ResultadoIndexado | undefined> {
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.hacerActualizacion(visible).finally(() => {
      this.enCurso = undefined;
    });
    return this.enCurso;
  }

  private async hacerActualizacion(visible: boolean): Promise<ResultadoIndexado | undefined> {
    await this.asegurarCargado();
    const ajustes = leerAjustes();
    return vscode.window.withProgress(
      {
        location: visible ? vscode.ProgressLocation.Notification : vscode.ProgressLocation.Window,
        title: l10n.t('CostKeeper: reading agent history'),
        cancellable: true,
      },
      async (progreso, token) => {
        let ultimoPct = 0;
        let resultado: ResultadoIndexado | undefined;
        try {
          resultado = await indexar(this.indice, {
            home: hogar(),
            extra: ajustes.rutasExtra,
            cancelado: () => token.isCancellationRequested,
            progreso: (hechos, total) => {
              const pct = total ? Math.floor((hechos / total) * 100) : 100;
              // Por punto porcentual, no por fichero: cientos de avisos por
              // segundo bloquean la interfaz más que la propia lectura.
              if (pct === ultimoPct) return;
              progreso.report({ increment: pct - ultimoPct, message: `${pct} %` });
              ultimoPct = pct;
            },
          });
          if (resultado.cuotas.length) this.cuotasCodex = resultado.cuotas;
          this.ultimo = resultado;
          log(
            `Indexado: ${resultado.leidos}/${resultado.ficheros} ficheros nuevos o cambiados, ` +
              `${resultado.registros} mensajes, ${resultado.ilegibles} líneas ilegibles, ${resultado.ms} ms` +
              (resultado.cancelado ? ' (cancelado)' : ''),
          );
        } catch (e) {
          log(`Indexado fallido: ${e instanceof Error ? e.message : String(e)}`);
          void vscode.window.showErrorMessage(l10n.t('CostKeeper could not read the agent history. See the CostKeeper output channel.'));
        }
        try {
          await guardar(this.dir, this.indice);
        } catch (e) {
          log(`No se pudo guardar el índice en ${rutaCorta(this.dir)}: ${e instanceof Error ? e.message : String(e)}`);
        }
        this.emisor.fire();
        return resultado;
      },
    );
  }

  /** Tira el índice y lo reconstruye: para cuando cambia el formato de origen. */
  async reconstruir(): Promise<void> {
    await borrar(this.dir);
    this.indice = indiceVacio();
    this.cargado = true;
    this.cuotasCodex = [];
    await this.actualizar(true);
  }

  dispose(): void {
    this.emisor.dispose();
  }
}
