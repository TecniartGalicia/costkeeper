import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { agregar, diaHace, fechaLocal, resumir, serieDiaria, SIN, type Eje, type Filtro } from '../core/consulta/agregar';
import { nombreCortoProyecto } from '../core/normalizar';
import { FECHA_TARIFAS } from '../core/precios/coste';
import { ventanaClaude } from '../core/cuota';
import { decimalesPara, formatearImporte, leerAjustes } from '../vscode/ajustes';
import type { Estado } from '../vscode/estado';
import { clientes, DIAS_GRATIS, etiquetarCliente, exportarCsv, recorteGratis } from '../pro/features';
import { isPro } from '../pro/licenseService';

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
     color: var(--vscode-descriptionForeground); margin: 0 0 8px; }
.cabecera { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-end; justify-content: space-between; margin-bottom: 14px; }
.total { font-size: 2rem; font-weight: 600; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sub { color: var(--vscode-descriptionForeground); font-size: .82rem; }
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
svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.rejilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 18px; }
.tarjeta { border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.25)); border-radius: 6px; padding: 12px 14px; min-width: 0; }
table { width: 100%; border-collapse: collapse; font-size: .84rem; }
td { padding: 3px 0; vertical-align: baseline; }
td.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 10px; }
td.clave { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 1px; width: 100%; }
tr.fila:hover { background: var(--vscode-list-hoverBackground); }
.barra { height: 3px; border-radius: 2px; background: var(--vscode-charts-blue, #4a9eff); opacity: .55; margin-top: 2px; }
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
.aviso { border-left: 2px solid var(--vscode-charts-yellow, #cca700); padding: 6px 10px; margin: 12px 0;
  background: var(--vscode-textBlockQuote-background, rgba(128,128,128,.08)); font-size: .82rem; }
.vacio { color: var(--vscode-descriptionForeground); font-size: .84rem; padding: 6px 0; }
a { color: var(--vscode-textLink-foreground); }
`;

export const SCRIPT = `
const vscodeApi = acquireVsCodeApi();
let datos = null;

function fmtEntero(n) { return n.toLocaleString(undefined); }

function tabla(filas, total, alPulsar) {
  if (!filas.length) return '<p class="vacio">' + datos.textos.sinDatos + '</p>';
  const t = document.createElement('table');
  for (const f of filas) {
    const tr = document.createElement('tr');
    tr.className = 'fila';
    if (alPulsar) { tr.style.cursor = 'pointer'; tr.title = f.titulo || f.etiqueta; }
    const td1 = document.createElement('td');
    td1.className = 'clave';
    td1.textContent = f.etiqueta;
    if (f.titulo) td1.title = f.titulo;
    const barra = document.createElement('div');
    barra.className = 'barra';
    barra.style.width = (total > 0 ? Math.max(1, (f.usd / total) * 100) : 0) + '%';
    td1.appendChild(barra);
    const td2 = document.createElement('td');
    td2.className = 'n';
    td2.textContent = f.importe;
    const td3 = document.createElement('td');
    td3.className = 'n sub';
    td3.textContent = fmtEntero(f.mensajes);
    tr.append(td1, td2, td3);
    if (alPulsar) tr.addEventListener('click', () => alPulsar(f));
    t.appendChild(tr);
  }
  return t.outerHTML;
}

function pintar() {
  if (!datos) return;
  document.getElementById('total').textContent = datos.resumen.importe;
  document.getElementById('sub').textContent = datos.resumen.subtitulo;
  document.getElementById('rango').textContent = datos.resumen.rango;

  for (const b of document.querySelectorAll('button[data-dias]')) {
    b.classList.toggle('activo', Number(b.dataset.dias) === datos.dias);
  }

  document.getElementById('proyectos').innerHTML = tabla(datos.proyectos, datos.resumen.usd);
  document.getElementById('modelos').innerHTML = tabla(datos.modelos, datos.resumen.usd);
  document.getElementById('clientes').innerHTML = tabla(datos.clientes, datos.resumen.usd);
  document.getElementById('tituloClientes').textContent = datos.textos.clientes;

  const serie = document.getElementById('serie');
  serie.innerHTML = '';
  const max = Math.max(...datos.serie.map((d) => d.usd), 0.000001);
  for (const d of datos.serie) {
    const barra = document.createElement('div');
    barra.style.height = Math.max(2, (d.usd / max) * 100) + '%';
    barra.title = d.dia + ' · ' + d.importe;
    serie.appendChild(barra);
  }

  const cuotas = document.getElementById('cuotas');
  cuotas.innerHTML = '';
  for (const c of datos.cuotas) {
    const linea = document.createElement('div');
    const cabecera = document.createElement('div');
    cabecera.className = 'linea';
    const izq = document.createElement('span');
    izq.textContent = c.nombre;
    const der = document.createElement('span');
    der.innerHTML = '<span class="etiqueta">' + c.confianza + '</span>';
    cabecera.append(izq, der);
    const detalle = document.createElement('div');
    detalle.className = 'sub';
    detalle.textContent = c.detalle;
    linea.append(cabecera, detalle);
    if (c.porCiento !== null) {
      const medidor = document.createElement('div');
      medidor.className = 'medidor';
      const relleno = document.createElement('i');
      relleno.style.width = Math.min(100, c.porCiento) + '%';
      medidor.appendChild(relleno);
      linea.appendChild(medidor);
    }
    cuotas.appendChild(linea);
  }
  if (!datos.cuotas.length) cuotas.innerHTML = '<p class="vacio">' + datos.textos.sinCuota + '</p>';

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
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.dias) vscodeApi.postMessage({ tipo: 'rango', dias: Number(b.dataset.dias) });
  else if (b.dataset.accion) vscodeApi.postMessage({ tipo: b.dataset.accion });
});

vscodeApi.postMessage({ tipo: 'listo' });
`;

const ICONOS = {
  refrescar: '<svg viewBox="0 0 16 16"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M12.4 1.6v3h-3"/></svg>',
  exportar: '<svg viewBox="0 0 16 16"><path d="M8 10.5V2"/><path d="M4.8 5.2 8 2l3.2 3.2"/><path d="M2.5 11v2.5h11V11"/></svg>',
  etiqueta: '<svg viewBox="0 0 16 16"><path d="M2.5 2.5h5l6 6-5 5-6-6z"/><circle cx="5.4" cy="5.4" r=".9"/></svg>',
};

interface Estadillo {
  etiqueta: string;
  titulo?: string;
  usd: number;
  importe: string;
  mensajes: number;
}

export class Panel {
  private static actual: Panel | undefined;
  private dias = 30;
  private readonly desechables: vscode.Disposable[] = [];

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
    );
  }

  private dispose(): void {
    Panel.actual = undefined;
    for (const d of this.desechables) d.dispose();
  }

  private async mensaje(m: { tipo?: string; dias?: number }): Promise<void> {
    switch (m?.tipo) {
      case 'listo':
        await this.enviar();
        break;
      case 'rango':
        this.dias = typeof m.dias === 'number' && m.dias > 0 ? m.dias : 30;
        await this.enviar();
        break;
      case 'reindexar':
        await this.estado.actualizar(true);
        break;
      case 'exportar':
        await exportarCsv(this.ctx, this.estado, 'proyecto', await this.filtro());
        break;
      case 'etiquetar':
        await etiquetarCliente(this.ctx, this.estado);
        await this.enviar();
        break;
    }
  }

  private async filtro(): Promise<Filtro> {
    const pro = await isPro(this.ctx);
    return recorteGratis({ desde: diaHace(this.dias - 1), hasta: fechaLocal(new Date()) }, pro, new Date());
  }

  private async enviar(): Promise<void> {
    const ahora = new Date();
    const pro = await isPro(this.ctx);
    const ajustes = leerAjustes();
    const mapaClientes = clientes(this.ctx);
    const opciones = { tarifasExtra: ajustes.tarifasExtra, clientes: mapaClientes };
    const filtro = recorteGratis({ desde: diaHace(this.dias - 1), hasta: fechaLocal(ahora) }, pro, ahora);

    const registros = [...this.estado.registros];
    const resumen = resumir(registros, filtro, opciones);
    // Los decimales se fijan con el total de la vista para que la columna cuadre.
    const decimales = decimalesPara(resumen.usd);
    const dinero = (usd: number) => formatearImporte(usd, ajustes, decimales);

    const fila = (f: { clave: string; usd: number; mensajes: number }, corto = false): Estadillo => ({
      etiqueta: corto ? nombreCortoProyecto(traducirClave(f.clave)) : traducirClave(f.clave),
      titulo: corto ? f.clave : undefined,
      usd: f.usd,
      importe: dinero(f.usd),
      mensajes: f.mensajes,
    });

    const top = (eje: Eje, corto = false): Estadillo[] =>
      agregar(registros, eje, filtro, opciones)
        .slice(0, 8)
        .map((f) => fila(f, corto));

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

    const cuotas = this.cuotas(registros, ahora, dinero);

    await this.vista.webview.postMessage({
      tipo: 'datos',
      datos: {
        dias: this.dias,
        resumen: {
          usd: resumen.usd,
          importe: dinero(resumen.usd),
          subtitulo: l10n.t('{0} messages · {1} tokens · API-equivalent cost, not your invoice', resumen.mensajes.toLocaleString(), resumen.tokens.toLocaleString()),
          rango: resumen.desde ? `${resumen.desde} → ${resumen.hasta}` : l10n.t('no data'),
        },
        proyectos: top('proyecto', true),
        modelos: top('modelo'),
        clientes: top('cliente'),
        serie: serieDiaria(registros, filtro, opciones).map((d) => ({ dia: d.dia, usd: d.usd, importe: dinero(d.usd) })),
        cuotas,
        avisos,
        textos: {
          sinDatos: l10n.t('Nothing in this range.'),
          sinCuota: l10n.t('No open window. Codex publishes its real limits; Claude Code does not.'),
          clientes: Object.keys(mapaClientes).length ? l10n.t('By client') : l10n.t('By client (untagged)'),
          pie: l10n.t('Rates dated {0}. {1} messages indexed in total.', FECHA_TARIFAS, String(this.estado.numeroRegistros)),
        },
      },
    });
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
  porProyecto: string;
  porModelo: string;
  porCliente: string;
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
    porProyecto: l10n.t('By project'),
    porModelo: l10n.t('By model'),
    porCliente: l10n.t('By client'),
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
  </div>
  <div class="controles">
    <button data-dias="7">${escapar(t.dias7)}</button>
    <button data-dias="30">${escapar(t.dias30)}</button>
    <button data-dias="90">${escapar(t.dias90)}</button>
    <button data-dias="3650">${escapar(t.todo)}</button>
    <button class="icono" data-accion="reindexar">${ICONOS.refrescar}${escapar(t.actualizar)}</button>
    <button class="icono" data-accion="etiquetar">${ICONOS.etiqueta}${escapar(t.cliente)}</button>
    <button class="icono" data-accion="exportar">${ICONOS.exportar}${escapar(t.csv)}</button>
  </div>
</div>
<div id="avisos"></div>
<div class="rejilla">
  <section class="tarjeta"><h2>${escapar(t.porProyecto)}</h2><div id="proyectos"></div></section>
  <section class="tarjeta"><h2>${escapar(t.porModelo)}</h2><div id="modelos"></div></section>
  <section class="tarjeta"><h2 id="tituloClientes">${escapar(t.porCliente)}</h2><div id="clientes"></div></section>
  <section class="tarjeta"><h2>${escapar(t.cuota)}</h2><div class="cuota" id="cuotas"></div></section>
  <section class="tarjeta"><h2>${escapar(t.porDia)}</h2><div class="serie" id="serie"></div></section>
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
