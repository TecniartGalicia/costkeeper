import * as vscode from 'vscode';

export const NOMBRE_CANAL = 'CostKeeper';

let canal: vscode.OutputChannel | undefined;

export function salida(): vscode.OutputChannel {
  if (!canal) {
    const creado = vscode.window.createOutputChannel(NOMBRE_CANAL);
    canal = creado;
    // La suite de integración activa dos veces en el mismo host: al desecharlo
    // hay que soltar la referencia para no escribir en un canal muerto.
    const desechar = creado.dispose.bind(creado);
    creado.dispose = () => {
      canal = undefined;
      desechar();
    };
  }
  return canal;
}

/**
 * Nunca se registra contenido de transcripciones: solo rutas recortadas y
 * cifras. Las rutas se acortan a las dos últimas carpetas.
 */
export function log(linea: string): void {
  salida().appendLine(`[${new Date().toISOString()}] ${linea}`);
}

export function rutaCorta(ruta: string): string {
  const partes = ruta.split(/[\/]/).filter(Boolean);
  return partes.length <= 2 ? ruta : `…/${partes.slice(-2).join('/')}`;
}
