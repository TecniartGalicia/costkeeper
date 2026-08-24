import * as vscode from 'vscode';
import { l10n } from 'vscode';
import {
  agregar,
  diaHace,
  fechaLocal,
  periodoAnterior,
  plegar,
  resumir,
  serieDiaria,
  sesiones,
  sinRama,
  SIN,
  type Eje,
  type Fila,
  type Filtro,
} from '../core/consulta/agregar';
import { nombreCortoProyecto } from '../core/normalizar';
import { FECHA_TARIFAS } from '../core/precios/coste';
import { ventanaClaude } from '../core/cuota';
import { decimalesPara, formatearImporte, leerAjustes } from '../vscode/ajustes';
import type { Estado } from '../vscode/estado';
import { clientes, DIAS_GRATIS, etiquetarCliente, exportarCsv, recorteGratis } from '../pro/features';
import { isPro } from '../pro/licenseService';

/** Filas visibles por tarjeta antes de plegar el resto en «otros». */
const TOPE = 8;
/** Por debajo de este porcentaje del total, una fila se pliega. */
const UMBRAL_OTROS = 1;
/** Cada cuánto se refresca el índice con el panel a la vista. */
const REFRESCO_MS = 5 * 60_000;

export const CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0; padding: 16px 20px 28px;
  font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
  color: var(--vscode-foreground); background: var(--vscode-editor-background);
}
h1 { font-size: 1.1rem; font-weight: 600; margin: 0 0 2px; }
h2 { font-size: .78rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em;
     color: var(--vscode-descriptionForeground); margin: 0; }
.cabecera { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-bottom: 12px; }
.total { font-size: 2rem; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sub { color: var(--vscode-descriptionForeground); font-size: .82rem; }
.tendencia { font-size: .82rem; font-variant-numeric: tabular-nums; }
.sube { color: var(--vscode-charts-red, #f14c4c); }
.baja { color: var(--vscode-charts-green, #89d185); }
.controles { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
button {
  font: inherit; font-size: .82rem; padding: 3px 10px; border-radius: 4px; cursor: pointer;
  border: 1px solid var(--vscode-button-border, transparent);
  background: var(--vscode-button-secondaryBackground, transparent);
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
}
button:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-list-hoverBackground)); }
button.activo { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
button.icono { display: inline-flex; align-items: center; gap: 6px; }
button.enlace { background: none; border: none; padding: 0 2px; color: var(--vscode-textLink-foreground); font-size: .78rem; }
svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.filtros { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 12px; min-height: 0; }
.chip { display: inline-flex; align-items: center; gap: 6px; font-size: .78rem; padding: 2px 6px 2px 9px;
  border-radius: 11px; border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); }
.chip b { font-weight: 600; }
.chip button { border: none; background: none; padding: 0 2px; font-size: .9rem; line-height: 1; color: inherit; opacity: .7; }
.chip button:hover { opacity: 1; background: none; }
.rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 18px; }
.tarjeta { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); border-radius: 6px; padding: 12px 14px; min-width: 0; }
.tarjeta header { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; font-size: .84rem; }
td { padding: 3px 0; vertical-align: baseline; }
td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 10px; }
td.clave { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 1px; width: 100%; }
tr.fila:hover { background: var(--vscode-list-hoverBackground); }
tr.pulsable { cursor: pointer; }
tr.otros td.clave { font-style: italic; color: var(--vscode-descriptionForeground); }
.barra { height: 3px; border-radius: 2px; background: var(--vscode-charts-blue, #4a9eff); opacity: .55; margin-top: 2px; }
.busca { width: 100%; font: inherit; font-size: .8rem; padding: 3px 7px; margin-bottom: 6px; border-radius: 4px;
  background: var(--vscode-input-background); color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border, var(--vscode-panel-border, rgba(128,128,128,.35))); }
.desplaza { max-height: 340px; overflow-y: auto; }
.serie { display: flex; align-items: flex-end; gap: 2px; height: 56px; margin-top: 4px; }
.serie div { flex: 1 1 auto; min-width: 2px; background: var(--vscode-charts-blue, #4a9eff); opacity: .6; border-radius: 1px 1px 0 0; }
.serie div:hover { opacity: 1; }
.cuota { display: flex; flex-direction: column; gap: 10px; }
.cuota .linea { display: flex; justify-content: space-between; gap: 12px; font-size: .84rem; }
.medidor { height: 6px; border-radius: 3px; background: var(--vscode-progressBar-background, rgba(128,128,128,.25)); overflow: hidden; margin-top: 3px; }
.medidor > i { display: block; height: 100%; background: var(--vscode-charts-blue, #4a9eff); }
.etiqueta { font-size: .7rem; text-transform: uppercase; letter-spacing: .05em; padding: 1px 5px; border-radius: 3px;
  border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.35)); color: var(--vscode-descriptionForeground); }
.nota { color: var(--vscode-descriptionForeground); font-size: .78rem; margin-top: 10px; line-height: 1.5; }
.aviso { border-left: 2px solid var(--vscode-charts-yellow, #cca700); padding: 6px 10px; margin: 10px 0;
  background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.08)); font-size: .82rem; }
.vacio { color: var(--vscode-descriptionForeground); font-size: .84rem; padding: 6px 0; }
`;

export const SCRIPT = `
const vscodeApi = acquireVsCodeApi();
let datos = null;

const entero = (n) => n.toLocaleString(undefined);

function pintarTabla(destino, tarjeta) {
  // El buscador NO se recrea al repintar: si se destruye, se pierde el foco y a
  // partir de la segunda tecla el texto ya no llega a ninguna parte.
  let caja = destino.querySelector('input.busca');
  if (tarjeta.busqueda === undefined) {
    if (caja) { caja.remove(); caja = null; }
  } else if (!caja) {
    caja = document.createElement('input');
    caja.className = 'busca';
    caja.type = 'search';
    caja.placeholder = datos.textos.buscar;
    caja.value = tarjeta.busqueda;
    caja.addEventListener('input', () => vscodeApi.postMessage({ tipo: 'buscar', eje: tarjeta.eje, texto: caja.value }));
    destino.insertBefore(caja, destino.firstChild);
  } else if (document.activeElement !== caja) {
    // Mientras se escribe manda lo que hay en pantalla, no lo que llega tarde.
    caja.value = tarjeta.busqueda;
  }

  let cuerpo = destino.querySelector('.cuerpo');
  if (!cuerpo) {
    cuerpo = document.createElement('div');
    cuerpo.className = 'cuerpo';
    destino.appendChild(cuerpo);
  }
  cuerpo.innerHTML = '';

  if (!tarjeta.filas.length) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = datos.textos.sinDatos;
    cuerpo.appendChild(p);
    return;
  }
  const marco = document.createElement('div');
  if (tarjeta.todas) marco.className = 'desplaza';
  const t = document.createElement('table');
  for (const f of tarjeta.filas) {
    const tr = document.createElement('tr');
    tr.className = 'fila' + (f.otros ? ' otros' : '') + (f.filtrable ? ' pulsable' : '');
    const td1 = document.createElement('td');
    td1.className = 'clave';
    td1.textContent = f.etiqueta;
    if (f.titulo) td1.title = f.titulo;
    const barra = document.createElement('div');
    barra.className = 'barra';
    barra.style.width = (tarjeta.mayor > 0 ? Math.max(1, (f.usd / tarjeta.mayor) * 100) : 0) + '%';
    td1.appendChild(barra);
    const td2 = document.createElement('td');
    td2.className = 'n';
    td2.textContent = f.importe;
    const td3 = document.createElement('td');
    td3.className = 'n sub';
    td3.textContent = f.detalle !== undefined ? f.detalle : entero(f.mensajes);
    tr.append(td1, td2, td3);
    if (f.filtrable) {
      tr.title = datos.textos.filtrarPor + ' ' + (f.titulo || f.etiqueta);
      tr.addEventListener('click', () => vscodeApi.postMessage({ tipo: 'filtrar', eje: tarjeta.eje, valor: f.clave }));
    }
    t.appendChild(tr);
  }
  marco.appendChild(t);
  cuerpo.appendChild(marco);

  if (tarjeta.ocultas > 0 || tarjeta.todas) {
    const b = document.createElement('button');
    b.className = 'enlace';
    b.textContent = tarjeta.todas ? datos.textos.verMenos : datos.textos.verTodas.replace('{0}', entero(tarjeta.ocultas));
    b.addEventListener('click', () => vscodeApi.postMessage({ tipo: 'verTodas', eje: tarjeta.eje, valor: !tarjeta.todas }));
    cuerpo.appendChild(b);
  }
}

function pintar() {
  if (!datos) return;
  document.getElementById('total').textContent = datos.resumen.importe;
  document.getElementById('sub').textContent = datos.resumen.subtitulo;
  document.getElementById('rango').textContent = datos.resumen.rango;

  const tend = document.getElementById('tendencia');
  tend.textContent = datos.resumen.tendencia || '';
  tend.className = 'tendencia ' + (datos.resumen.tendenciaSube ? 'sube' : datos.resumen.tendenciaSube === false ? 'baja' : '');

  for (const b of document.querySelectorAll('button[data-dias]')) {
    b.classList.toggle('activo', Number(b.dataset.dias) === datos.dias);
  }
  const sub = document.getElementById('subagentes');
  sub.classList.toggle('activo', datos.incluirSubagentes);
  sub.textContent = datos.textos.subagentes;

  const filtros = document.getElementById('filtros');
  filtros.innerHTML = '';
  for (const f of datos.filtros) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const et = document.createElement('span');
    et.innerHTML = '<b></b> ';
    et.querySelector('b').textContent = f.nombre + ':';
    const val = document.createElement('span');
    val.textContent = ' ' + f.etiqueta;
    val.title = f.valor;
    const x = document.createElement('button');
    x.textContent = '\\u00d7';
    x.title = datos.textos.quitar;
    x.addEventListener('click', () => vscodeApi.postMessage({ tipo: 'filtrar', eje: f.eje, valor: null }));
    chip.append(et, val, x);
    filtros.appendChild(chip);
  }

  for (const t of datos.tarjetas) {
    const destino = document.getElementById('t-' + t.eje);
    if (destino) pintarTabla(destino, t);
    const titulo = document.getElementById('h-' + t.eje);
    if (titulo && t.titulo) titulo.textContent = t.titulo;
  }

  const serie = document.getElementById('serie');
  serie.innerHTML = '';
  const max = Math.max(...datos.serie.map((d) => d.usd), 0.000001);
  for (const d of datos.serie) {
    const barra = document.createElement('div');
    barra.style.height = Math.max(2, (d.usd / max) * 100) + '%';
    barra.title = d.dia + ' \\u00b7 ' + d.importe;
    serie.appendChild(barra);
  }

  const cuotas = document.getElementById('cuotas');
  cuotas.innerHTML = '';
  for (const c of datos.cuotas) {
    const linea = document.createElement('div');
    const cab = document.createElement('div');
    cab.className = 'linea';
    const izq = document.createElement('span');
    izq.textContent = c.nombre;
    const der = document.createElement('span');
    const et = document.createElement('span');
    et.className = 'etiqueta';
    et.textContent = c.confianza;
    der.appendChild(et);
    cab.append(izq, der);
    const det = document.createElement('div');
    det.className = 'sub';
    det.textContent = c.detalle;
    linea.append(cab, det);
    if (c.porCiento !== null) {
      const med = document.createElement('div');
      med.className = 'medidor';
      const rel = document.createElement('i');
      rel.style.width = Math.min(100, c.porCiento) + '%';
      med.appendChild(rel);
      linea.appendChild(med);
    }
    cuotas.appendChild(linea);
  }
  if (!datos.cuotas.length) {
    const p = document.createElement('p');
    p.className = 'vacio';
    p.textContent = datos.textos.sinCuota;
    cuotas.appendChild(p);
  }

  const avisos = document.getElementById('avisos');
  avisos.innerHTML = '';
  for (const a of datos.avisos) {
    const div = document.createElement('div');
    div.className = 'aviso';
    div.textContent = a;
    avisos.appendChild(div);
  }
  document.getElementById('pie').textContent = datos.textos.pie;
}

window.addEventListener('message', (e) => {
  if (e.data && e.data.tipo === 'datos') { datos = e.data.datos; pintar(); }
});

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-dias], button[data-accion]');
  if (!b) return;
  if (b.dataset.dias) vscodeApi.postMessage({ tipo: 'rango', dias: Number(b.dataset.dias) });
  else vscodeApi.postMessage({ tipo: b.dataset.accion });
});

vscodeApi.postMessage({ tipo: 'listo' });
`;

const ICONOS = {
  refrescar: '<svg viewBox="0 0 16 16"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M12.4 1.6v3h-3"/></svg>',
  exportar: '<svg viewBox="0 0 16 16"><path d="M8 10.5V2"/><path d="M4.8 5.2 8 2l3.2 3.2"/><path d="M2.5 11v2.5h11V11"/></svg>',
  etiqueta: '<svg viewBox="0 0 16 16"><path d="M2.5 2.5h5l6 6-5 5-6-6z"/><circle cx="5.4" cy="5.4" r=".9"/></svg>',
};

/** Ejes que se pintan como tarjeta con tabla. */
const EJES: Eje[] = ['proyecto', 'modelo', 'cliente', 'rama', 'sesion'];

interface EstadoPanel {
  dias: number;
  incluirSubagentes: boolean;
  filtro: { proyecto?: string; modelo?: string; cliente?: string; sesion?: string };
  todas: Partial<Record<Eje, boolean>>;
  busqueda: Partial<Record<Eje, string>>;
}

export class Panel {
  private static actual: Panel | undefined;
  private readonly desechables: vscode.Disposable[] = [];
  private temporizador: ReturnType<typeof setInterval> | undefined;

  private estadoPanel: EstadoPanel = {
    dias: 30,
    incluirSubagentes: true,
    filtro: {},
    todas: {},
    busqueda: {},
  };

  static mostrar(ctx: vscode.ExtensionContext, estado: Estado): Panel {
    if (Panel.actual) {
      Panel.actual.vista.reveal();
      void Panel.actual.enviar();
      return Panel.actual;
    }
    const vista = vscode.window.createWebviewPanel('costkeeper.panel', l10n.t('CostKeeper'), vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [],
    });
    Panel.actual = new Panel(vista, ctx, estado);
    return Panel.actual;
  }

  private constructor(
    private readonly vista: vscode.WebviewPanel,
    private readonly ctx: vscode.ExtensionContext,
    private readonly estado: Estado,
  ) {
    this.vista.webview.html = this.html();
    this.desechables.push(
      this.vista.webview.onDidReceiveMessage((m) => void this.mensaje(m)),
      this.estado.alCambiar(() => void this.enviar()),
      this.vista.onDidDispose(() => this.dispose()),
      this.vista.onDidChangeViewState(() => this.programarRefresco()),
      // Al volver a la ventana después de un rato, lo que hay en pantalla suele
      // estar viejo: se comprueba entonces, que es cuando importa.
      vscode.window.onDidChangeWindowState((w) => {
        if (w.focused && this.vista.visible) void this.estado.actualizar(false);
      }),
    );
    this.programarRefresco();
  }

  /** El refresco automático solo corre con el panel a la vista. */
  private programarRefresco(): void {
    if (this.temporizador) {
      clearInterval(this.temporizador);
      this.temporizador = undefined;
    }
    if (!this.vista.visible) return;
    this.temporizador = setInterval(() => {
      if (this.vista.visible) void this.estado.actualizar(false);
    }, REFRESCO_MS);
  }

  private dispose(): void {
    Panel.actual = undefined;
    if (this.temporizador) clearInterval(this.temporizador);
    for (const d of this.desechables) d.dispose();
  }

  private async mensaje(m: { tipo?: string; dias?: number; eje?: Eje; valor?: string | boolean | null; texto?: string }): Promise<void> {
    const e = this.estadoPanel;
    switch (m?.tipo) {
      case 'listo':
        break;
      case 'rango':
        e.dias = typeof m.dias === 'number' && m.dias > 0 ? m.dias : 30;
        break;
      case 'filtrar': {
        if (!m.eje || m.eje === 'dia' || m.eje === 'proveedor' || m.eje === 'rama') break;
        const clave = m.eje as 'proyecto' | 'modelo' | 'cliente' | 'sesion';
        if (m.valor === null || m.valor === undefined) delete e.filtro[clave];
        else if (typeof m.valor === 'string' && m.valor !== SIN.otros) e.filtro[clave] = m.valor;
        break;
      }
      case 'verTodas':
        if (m.eje) e.todas[m.eje] = Boolean(m.valor);
        break;
      case 'buscar':
        if (m.eje) e.busqueda[m.eje] = m.texto ?? '';
        break;
      case 'subagentes':
        e.incluirSubagentes = !e.incluirSubagentes;
        break;
      case 'reindexar':
        await this.estado.actualizar(true);
        return;
      case 'exportar':
        // La exportación nunca pliega ni recorta: va con el filtro, sin más.
        await exportarCsv(this.ctx, this.estado, 'proyecto', await this.filtro());
        return;
      case 'etiquetar':
        await etiquetarCliente(this.ctx, this.estado);
        break;
    }
    await this.enviar();
  }

  private async filtro(): Promise<Filtro> {
    const pro = await isPro(this.ctx);
    const ajustes = leerAjustes();
    const base: Filtro = {
      desde: diaHace(this.estadoPanel.dias - 1),
      hasta: fechaLocal(new Date()),
      ...this.estadoPanel.filtro,
      incluirSubagentes: this.estadoPanel.incluirSubagentes,
      excluir: ajustes.excluirProyectos,
    };
    return recorteGratis(base, pro, new Date());
  }

  private async enviar(): Promise<void> {
    const ahora = new Date();
    const pro = await isPro(this.ctx);
    const ajustes = leerAjustes();
    const mapaClientes = clientes(this.ctx);
    const opciones = { tarifasExtra: ajustes.tarifasExtra, clientes: mapaClientes };
    const filtro = await this.filtro();

    const registros = [...this.estado.registros];
    const resumen = resumir(registros, filtro, opciones);
    const decimales = decimalesPara(resumen.usd);
    const dinero = (usd: number) => formatearImporte(usd, ajustes, decimales);

    // Tendencia: mismo número de días, justo antes, sin solaparse.
    const previo = periodoAnterior(filtro);
    const resumenPrevio = previo ? resumir(registros, previo, opciones) : undefined;
    let tendencia = '';
    let tendenciaSube: boolean | undefined;
    if (resumenPrevio && resumenPrevio.usd > 0) {
      const pct = (resumen.usd / resumenPrevio.usd - 1) * 100;
      tendenciaSube = pct > 0;
      tendencia = l10n.t('{0} vs the {1} days before ({2})', `${pct > 0 ? '+' : ''}${pct.toFixed(0)} %`, String(this.estadoPanel.dias), dinero(resumenPrevio.usd));
    }

    const tarjetas = EJES.map((eje) => this.tarjeta(eje, registros, filtro, opciones, dinero));

    const avisos: string[] = [];
    if (resumen.sinTarifa > 0) {
      avisos.push(l10n.t('{0} messages use a model with no known rate. They are counted apart, never estimated.', String(resumen.sinTarifa)));
    }
    if (resumen.usd > 0 && resumen.usdSinDesgloseCache < resumen.usd) {
      const dif = ((1 - resumen.usdSinDesgloseCache / resumen.usd) * 100).toFixed(1);
      avisos.push(l10n.t('Counting every cache write as 5-minute would show {0}, {1} % less. CostKeeper charges 1-hour writes at 2x.', dinero(resumen.usdSinDesgloseCache), dif));
    }
    if (!pro) {
      avisos.push(l10n.t('Free version: the last {0} days. The data is kept — a Pro licence shows all of it again.', String(DIAS_GRATIS)));
    }

    await this.vista.webview.postMessage({
      tipo: 'datos',
      datos: {
        dias: this.estadoPanel.dias,
        incluirSubagentes: this.estadoPanel.incluirSubagentes,
        // El eje viaja con su clave interna: el webview la devuelve tal cual al
        // quitar el filtro, y el nombre traducido es solo para leerlo.
        filtros: Object.entries(this.estadoPanel.filtro).map(([eje, valor]) => ({
          eje,
          nombre: this.nombreEje(eje as Eje),
          valor,
          etiqueta: eje === 'proyecto' ? nombreCortoProyecto(valor) : eje === 'sesion' ? valor.slice(0, 8) : traducirClave(valor),
        })),
        resumen: {
          usd: resumen.usd,
          importe: dinero(resumen.usd),
          subtitulo: l10n.t('{0} messages · {1} tokens · API-equivalent cost, not your invoice', resumen.mensajes.toLocaleString(), resumen.tokens.toLocaleString()),
          rango: resumen.desde ? `${resumen.desde} → ${resumen.hasta}` : l10n.t('no data'),
          tendencia,
          tendenciaSube,
        },
        tarjetas,
        serie: serieDiaria(registros, filtro, opciones).map((d) => ({ dia: d.dia, usd: d.usd, importe: dinero(d.usd) })),
        cuotas: this.cuotas(registros, ahora, dinero),
        avisos,
        textos: {
          sinDatos: l10n.t('Nothing in this range.'),
          sinCuota: l10n.t('No open window. Codex publishes its real limits; Claude Code does not.'),
          buscar: l10n.t('Search…'),
          verTodas: l10n.t('Show all ({0} more)'),
          verMenos: l10n.t('Show less'),
          filtrarPor: l10n.t('Filter by'),
          quitar: l10n.t('Remove filter'),
          subagentes: l10n.t('Subagents'),
          pie: l10n.t('Rates dated {0}. {1} messages indexed in total.', FECHA_TARIFAS, String(this.estado.numeroRegistros)),
        },
      },
    });
  }

  private nombreEje(eje: Eje): string {
    switch (eje) {
      case 'proyecto': return l10n.t('project');
      case 'modelo': return l10n.t('model');
      case 'cliente': return l10n.t('client');
      case 'sesion': return l10n.t('session');
      case 'rama': return l10n.t('branch');
      default: return eje;
    }
  }

  private tarjeta(
    eje: Eje,
    registros: import('../core/tipos').Registro[],
    filtro: Filtro,
    opciones: { tarifasExtra?: Record<string, { entrada: number; salida: number }>; clientes?: Record<string, string> },
    dinero: (n: number) => string,
  ) {
    const todas = Boolean(this.estadoPanel.todas[eje]);
    const busqueda = (this.estadoPanel.busqueda[eje] ?? '').trim().toLowerCase();

    if (eje === 'sesion') {
      let filas = sesiones(registros, filtro, opciones);
      if (busqueda) filas = filas.filter((f) => (f.proyecto + ' ' + f.clave).toLowerCase().includes(busqueda));
      const mayor = filas[0]?.usd ?? 0;
      const visibles = todas ? filas : filas.slice(0, TOPE);
      return {
        eje,
        titulo: l10n.t('Most expensive sessions'),
        mayor,
        todas,
        busqueda: filas.length > TOPE || busqueda ? busqueda : undefined,
        ocultas: Math.max(0, filas.length - visibles.length),
        filas: visibles.map((f) => ({
          clave: f.clave,
          etiqueta: nombreCortoProyecto(f.proyecto),
          titulo: `${f.proyecto} · ${f.desdeDia || '?'}${f.hastaDia && f.hastaDia !== f.desdeDia ? ' → ' + f.hastaDia : ''}`,
          usd: f.usd,
          importe: dinero(f.usd),
          mensajes: f.mensajes,
          detalle: f.desdeDia || '',
          filtrable: true,
        })),
      };
    }

    let filas: Fila[] = agregar(registros, eje, filtro, opciones);
    if (busqueda) filas = filas.filter((f) => f.clave.toLowerCase().includes(busqueda));

    const corto = eje === 'proyecto';
    const mayor = filas[0]?.usd ?? 0;
    let visibles: Fila[] = filas;
    let otros: Fila | undefined;
    let ocultas = 0;
    if (!todas) {
      const p = plegar(filas, UMBRAL_OTROS, TOPE);
      visibles = p.filas;
      otros = p.otros;
      ocultas = filas.length - visibles.length;
    }

    const filasSalida = visibles.map((f) => ({
      clave: f.clave,
      etiqueta: corto ? nombreCortoProyecto(traducirClave(f.clave)) : traducirClave(f.clave),
      titulo: corto ? f.clave : undefined,
      usd: f.usd,
      importe: dinero(f.usd),
      mensajes: f.mensajes,
      filtrable: eje !== 'rama',
    }));
    if (otros) {
      filasSalida.push({
        clave: SIN.otros,
        etiqueta: l10n.t('others ({0})', String(ocultas)),
        titulo: undefined,
        usd: otros.usd,
        importe: dinero(otros.usd),
        mensajes: otros.mensajes,
        filtrable: false,
      });
    }

    let titulo: string | undefined;
    if (eje === 'rama') {
      const sin = sinRama(registros, filtro, opciones);
      titulo = sin > 0 ? l10n.t('By branch · {0} messages without one', sin.toLocaleString()) : l10n.t('By branch');
    }

    // El buscador solo aparece donde sirve: una tarjeta de cuatro filas no lo necesita.
    const conBuscador = filas.length > TOPE || busqueda.length > 0;
    return { eje, titulo, mayor, todas, busqueda: conBuscador ? busqueda : undefined, ocultas: todas ? 0 : ocultas, filas: filasSalida };
  }

  private cuotas(registros: import('../core/tipos').Registro[], ahora: Date, dinero: (n: number) => string) {
    const salida: { nombre: string; detalle: string; confianza: string; porCiento: number | null }[] = [];

    for (const c of this.estado.cuotas(ahora)) {
      const minutos = Math.max(0, Math.round((Date.parse(c.reiniciaEn) - ahora.getTime()) / 60_000));
      salida.push({
        nombre: c.plan ? l10n.t('Codex · plan {0}', c.plan) : 'Codex',
        detalle: l10n.t('{0} % used · window of {1} · resets in {2}', c.usadoPorCiento.toFixed(0), duracion(c.ventanaMinutos), duracion(minutos)),
        confianza: l10n.t('exact'),
        porCiento: c.usadoPorCiento,
      });
    }

    const v = ventanaClaude(registros, ahora);
    if (v) {
      salida.push({
        nombre: 'Claude Code',
        detalle: l10n.t('window open, {0} left · {1} messages · {2}', duracion(v.minutosRestantes), String(v.mensajes), dinero(v.usd)),
        confianza: l10n.t('derived'),
        // A propósito sin porcentaje: Claude Code no publica su consumo.
        porCiento: null,
      });
    }
    return salida;
  }

  private html(): string {
    const nonce = nonceAleatorio();
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
    const idioma = vscode.env.language.startsWith('es') ? 'es' : 'en';
    return `<!DOCTYPE html>
<html lang="${idioma}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CostKeeper</title>
<style nonce="${nonce}">${CSS}</style>
</head>
<body>
${cuerpoHtml(etiquetas())}
<script nonce="${nonce}">${SCRIPT}</script>
</body>
</html>`;
  }
}

export interface Etiquetas {
  titulo: string;
  dias7: string;
  dias30: string;
  dias90: string;
  todo: string;
  actualizar: string;
  cliente: string;
  csv: string;
  subagentes: string;
  porProyecto: string;
  porModelo: string;
  porCliente: string;
  porRama: string;
  sesiones: string;
  cuota: string;
  porDia: string;
}

export function etiquetas(): Etiquetas {
  return {
    titulo: l10n.t('What your agents cost'),
    dias7: l10n.t('7 days'),
    dias30: l10n.t('30 days'),
    dias90: l10n.t('90 days'),
    todo: l10n.t('All'),
    actualizar: l10n.t('Update'),
    cliente: l10n.t('Client'),
    csv: l10n.t('CSV'),
    subagentes: l10n.t('Subagents'),
    porProyecto: l10n.t('By project'),
    porModelo: l10n.t('By model'),
    porCliente: l10n.t('By client'),
    porRama: l10n.t('By branch'),
    sesiones: l10n.t('Most expensive sessions'),
    cuota: l10n.t('Quota'),
    porDia: l10n.t('Per day'),
  };
}

/** El cuerpo se genera aparte para poder renderizarlo igual fuera de VS Code (capturas). */
export function cuerpoHtml(t: Etiquetas): string {
  return `<div class="cabecera">
  <div>
    <h1>${escapar(t.titulo)}</h1>
    <div class="total" id="total">&mdash;</div>
    <div class="sub" id="sub"></div>
    <div class="sub" id="rango"></div>
    <div class="tendencia" id="tendencia"></div>
  </div>
  <div class="controles">
    <button data-dias="7">${escapar(t.dias7)}</button>
    <button data-dias="30">${escapar(t.dias30)}</button>
    <button data-dias="90">${escapar(t.dias90)}</button>
    <button data-dias="3650">${escapar(t.todo)}</button>
    <button id="subagentes" data-accion="subagentes">${escapar(t.subagentes)}</button>
    <button class="icono" data-accion="reindexar">${ICONOS.refrescar}${escapar(t.actualizar)}</button>
    <button class="icono" data-accion="etiquetar">${ICONOS.etiqueta}${escapar(t.cliente)}</button>
    <button class="icono" data-accion="exportar">${ICONOS.exportar}${escapar(t.csv)}</button>
  </div>
</div>
<div class="filtros" id="filtros"></div>
<div id="avisos"></div>
<div class="rejilla">
  <section class="tarjeta"><header><h2 id="h-proyecto">${escapar(t.porProyecto)}</h2></header><div id="t-proyecto"></div></section>
  <section class="tarjeta"><header><h2 id="h-modelo">${escapar(t.porModelo)}</h2></header><div id="t-modelo"></div></section>
  <section class="tarjeta"><header><h2 id="h-sesion">${escapar(t.sesiones)}</h2></header><div id="t-sesion"></div></section>
  <section class="tarjeta"><header><h2 id="h-cliente">${escapar(t.porCliente)}</h2></header><div id="t-cliente"></div></section>
  <section class="tarjeta"><header><h2 id="h-rama">${escapar(t.porRama)}</h2></header><div id="t-rama"></div></section>
  <section class="tarjeta"><header><h2>${escapar(t.cuota)}</h2></header><div class="cuota" id="cuotas"></div></section>
  <section class="tarjeta"><header><h2>${escapar(t.porDia)}</h2></header><div class="serie" id="serie"></div></section>
</div>
<p class="nota" id="pie"></p>`;
}

/** Los marcadores del núcleo se traducen aquí, que es donde hay idioma. */
export function traducirClave(clave: string): string {
  switch (clave) {
    case SIN.cliente:
      return l10n.t('(no client)');
    case SIN.rama:
      return l10n.t('(no branch)');
    case SIN.fecha:
      return l10n.t('(no date)');
    case SIN.modelo:
      return l10n.t('(no model)');
    case SIN.sesion:
      return l10n.t('(no session)');
    case '(desconocido)':
      return l10n.t('(unknown)');
    default:
      return clave;
  }
}

function duracion(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return l10n.t('less than a minute');
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const min = Math.round(minutos % 60);
  if (dias > 0) return l10n.t('{0} d {1} h', String(dias), String(horas));
  if (horas > 0) return l10n.t('{0} h {1} min', String(horas), String(min));
  return l10n.t('{0} min', String(min));
}

function escapar(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function nonceAleatorio(): string {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let t = '';
  for (let i = 0; i < 32; i++) t += letras.charAt(Math.floor(Math.random() * letras.length));
  return t;
}
