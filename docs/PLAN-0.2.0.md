# CostKeeper 0.2.0 — plan auditado

Argalla · Tecniart Galicia, S.L. · 24 de agosto de 2026

La 0.1.x demostró que las cifras están bien. Esta versión va de que **se puedan mirar**: con 288 proyectos en el histórico real, el panel enseña ocho y no deja pinchar ninguno.

Convenciones: **[medido]** comprobado sobre el histórico real de esta máquina (824 ficheros, 4,25 GB, 91.184 mensajes) el 24 de agosto de 2026.

---

## 1. Sondas previas, y lo que cambiaron

| Sonda | Pregunta | Resultado | Consecuencia |
|---|---|---|---|
| S-1 | ¿Sirve para algo el eje «rama»? | **$28.148 de $29.127 caen en una fila llamada `HEAD`**; `main` se queda en $253 | No es detached HEAD: los repos están en `main`. `HEAD` es el valor que escribe Claude Code cuando no resuelve la rama → **D1** |
| S-2 | ¿Se arregla actualizando Claude Code? | No. En 2.1.237: 7.434 `HEAD` frente a 3 ramas reales. La rama real solo aparece cuando la sesión arranca **dentro** del repo (o en un worktree) | La vista no se retira; se cuenta aparte lo que no trae dato → **D1** |
| S-3 | ¿Cuánto tapa el top 8 de proyectos? | El 71,1 %. **280 filas invisibles con $8.203** | Hacen falta «ver todas» y buscador → **D3** |
| S-4 | ¿Cuánta de esa cola es ruido? | 96 proyectos gastan **menos de 1 $** y suman $35; 52 son scratchpads o worktrees efímeros ($459) | Fila «otros» plegable y exclusión por patrón → **D8** |
| S-5 | ¿Cuánto cuesta repintar el panel? | **30 ms** con 91.184 registros y cuatro agregaciones | No se optimiza nada. Se documenta para no volver a sospechar |
| S-6 | ¿Hay algo que enganche y no se vea? | 30 días: $15.074 · los 30 anteriores: $10.262 → **+47 %** | Comparación de periodos en la cabecera → **D4** |
| S-7 | ¿Y las sesiones? | 159 sesiones; la más cara **$5.409 en 21.071 mensajes** | Tarjeta de sesiones caras → **D5** |

---

## 2. Decisiones

| # | Decisión | Motivo | Alternativa descartada | Prueba |
|---|---|---|---|---|
| **D1** | `gitBranch === 'HEAD'` se trata como **sin dato**, no como una rama. La tarjeta de ramas dice cuántos mensajes no lo traen | S-1 y S-2: no es una rama, es el hueco que deja Claude Code. Agruparlo con `main` sería inventar | Quitar el eje rama; dejarlo como está | P-01 |
| **D2** | El panel tiene **estado de filtro** (proyecto, modelo, cliente, sesión) que se pone pinchando una fila y se quita con un botón | Es la interacción que ya esperaba el usuario: el manejador estaba escrito y sin conectar | Abrir una vista nueva por proyecto | P-02 |
| **D3** | Cada tarjeta enseña 8 filas y ofrece **ver todas** con buscador; el buscador filtra sobre la clave completa, no sobre la etiqueta corta | S-3: si no, el 29 % del gasto no existe para el usuario | Scroll infinito; subir el tope a 50 | P-03 |
| **D4** | La cabecera compara con el **periodo inmediatamente anterior de la misma duración** | S-6. Es el número que hace volver al panel | Comparar con el mes natural anterior (rompe con rangos de 7 o 90 días) | P-04 |
| **D5** | Tarjeta de **sesiones más caras**, identificadas por proyecto y fecha, no por UUID | S-7. Un identificador de sesión no le dice nada a nadie | Enseñar el UUID | P-05 |
| **D6** | El índice se **refresca solo**: cada 5 minutos con el panel visible, y al recuperar el foco de la ventana | Una cifra congelada en pantalla es peor que no tenerla | Vigilar el sistema de ficheros (miles de ficheros, ruido) | P-06 |
| **D7** | Interruptor de **subagentes** en el panel, encendido por defecto | El núcleo ya sabe filtrarlos y son 10.117 mensajes tuyos | Excluirlos siempre; no ofrecerlo | P-07 |
| **D8** | Las filas por debajo del **1 % del total** se pliegan en «otros (N)», y hay un ajuste `costkeeper.excluirProyectos` con patrones | S-4: 96 filas de polvo. Plegar es reversible y no oculta dinero; excluir es decisión explícita del usuario | Umbral en dinero absoluto; excluir por heurística automática | P-08 |
| **D9** | Comando **poner tarifa a un modelo**, que escribe en `costkeeper.tarifasExtra` | Hoy hay que redactar un JSON a mano; son 57 sesiones de Codex sin precio | Traer tarifas de OpenAI incluidas (no verificables) | P-09 |
| **D10** | Todo el estado del panel vive en la **extensión**, no en el webview: el webview solo pinta lo que recibe | Un webview con estado propio se desincroniza en cuanto llega una actualización de índice | Estado en el `postMessage` de ida y vuelta | P-02 |

---

## 3. Contrato nuevo

```ts
// src/core/consulta/agregar.ts
export interface Filtro {
  desde?: string;
  hasta?: string;
  proyecto?: string;
  modelo?: string;      // nuevo
  cliente?: string;     // nuevo
  sesion?: string;      // nuevo
  proveedor?: Proveedor;
  incluirSubagentes?: boolean;
}

/** Una fila con un representante, para poder enseñar algo legible de una sesión. */
export interface FilaConMuestra extends Fila {
  proyecto: string;
  desde: string;
  hasta: string;
}

export function sesiones(registros: Iterable<Registro>, filtro?: Filtro, opciones?: Opciones): FilaConMuestra[];

/** Pliega en «otros» lo que no llegue al umbral. Nunca esconde dinero: lo suma. */
export function plegar(filas: Fila[], umbralPorCiento: number, tope: number): { filas: Fila[]; otros?: Fila };

/** Periodo inmediatamente anterior, de la misma duración. */
export function periodoAnterior(f: Filtro): Filtro;
```

`Registro.rama` sigue guardando lo que venga; la traducción de `HEAD` a «sin rama» ocurre en `claveDe`, para que el índice ya escrito siga sirviendo sin reconstruirse.

---

## 4. Pruebas

| # | Prueba | Cierra |
|---|---|---|
| **P-01** | `HEAD` cae en la misma cubeta que la rama vacía, y el resumen cuenta cuántos mensajes no traen rama | D1 |
| **P-02** | Filtrar por proyecto reduce el total; combinar proyecto y modelo aplica los dos; quitar el filtro devuelve el total original | D2, D10 |
| **P-03** | El buscador casa sobre la ruta completa aunque la etiqueta visible sea la carpeta final | D3 |
| **P-04** | El periodo anterior de un rango de 7 días son los 7 días justo antes, sin solaparse ni dejar hueco; con un rango abierto no hay comparación | D4 |
| **P-05** | Las sesiones salen ordenadas por coste y cada una trae proyecto y fechas; una sesión sin fecha no rompe | D5 |
| **P-06** | El refresco automático no lanza dos indexados a la vez ni se dispara con el panel cerrado | D6 |
| **P-07** | Apagar los subagentes baja el total exactamente en lo que suman | D7 |
| **P-08** | Plegar conserva el total al céntimo; el umbral 0 no pliega nada; los patrones de exclusión no dejan pasar una ruta parecida | D8 |
| **P-09** | Una tarifa puesta por comando se usa por delante de la incluida; un valor no numérico se rechaza | D9 |

---

## 5. Riesgos

| Riesgo | Control |
|---|---|
| El estado del panel se desincroniza al llegar una reindexación | El webview no guarda estado: cada `postMessage` trae el estado completo (D10), P-02 |
| «Otros» oculta gasto y alguien cuadra mal una factura | «Otros» aparece siempre como fila con su importe, y la exportación **nunca** pliega. P-08 |
| El refresco automático come batería o dispara indexados solapados | Solo con el panel visible; `Estado.actualizar` ya es reentrante y devuelve el indexado en curso. P-06 |
| Tratar `HEAD` como «sin rama» esconde un dato que alguien esperaba | La tarjeta dice el número exacto de mensajes sin rama, y el motivo está en el README |
| Un patrón de exclusión mal escrito borra medio panel | Es un ajuste explícito, se aplica solo a la vista, y el índice conserva todo: quitar el patrón lo devuelve |

## 6. Lo que este plan no toca

Proveedores nuevos, panel de equipo, sincronización entre máquinas, gráficas más allá de la serie diaria, y la reconstrucción del índice: todos los cambios son de consulta y de interfaz, así que el índice de la 0.1.1 sigue valiendo sin reindexar.
