# 12. CostKeeper — reposicionamiento de la ficha 4

Ficha escrita el 24 de agosto de 2026. Sustituye a [04-ai-cost-context-control.md](04-ai-cost-context-control.md) como especificación de trabajo: la idea es la misma, el posicionamiento y el alcance no.

Es la **apuesta recomendada** entre las siete ideas que quedan sin construir, por los datos de mercado y de tracción que se recogen abajo. La comparación completa está en el README.

---

## 1. Por qué esta y no otra

Las cifras son del Marketplace, consultadas el 24 de agosto de 2026 con la API de la galería (`extensionquery`, campo `install`).

| Idea pendiente | Demanda demostrada en la tienda | Competencia | Coste hasta publicar | ¿Alguien paga? |
|---|---|---|---|---|
| 2 · Extension Fleet Shield | Alta, pero es mercado de vendors: JFrog 93.015, Checkmarx 34.552, OpenText 25.354 | Gigantes con equipo comercial | Muy alto: extensión + agente firmado + panel multiempresa | Sí, mucho, con ciclo de venta de meses y credibilidad en seguridad que Argalla aún no tiene |
| **4 · Coste y contexto** | **Muy alta y medible: >140.000 instalaciones repartidas en ~25 extensiones** (52.219 · 14.084 · 11.882 · 10.097 · 9.849 · 7.436 · 5.689 …) | Saturada de gratuitos, pero **todos flojos**: barra de estado de un solo proveedor | **Bajo**: local, sin backend | Es la duda principal, y se aborda en §5 |
| 5 · Localization QA Studio | Media: i18n Studio 27.352, **sin actualizar desde mayo de 2025**; el resto por debajo de 1.500 | Débil y en parte abandonada | Medio-alto: cada formato es un parser y un juego de casos límite | Sí, agencias y equipos, pero son pocos y hoy piden a un agente que les traduzca el JSON |
| 6 · Agent Supervisor | **Ninguna**: copilot-remote 148, copilot-ntfy 118, PhoneCode 88, AskAway 53, NotifAI 23, TaskPing 19, agent-remote 16 | Fragmentada; siete intentos, ningún despegue | Alto: extensión + backend + push + app Android + panel | Sin demostrar |
| 7 · Repo Context Builder | Baja y decreciente: lo están absorbiendo los propios agentes y MCP | Los proveedores, gratis | Medio | Sin demostrar |
| 8 · Private AI Workspace | Alta en el discurso, baja en la compra de producto | Asistentes locales gratis de sobra | Muy alto | Sí, pero como servicio con cliente comprometido, no como extensión |
| 10 · Voice & Accessibility | Baja: el mayor es Pendant con 7.282 y vende hardware; el resto por debajo de 200 | Débil | Alto: la precisión y la latencia son el producto | Sin demostrar |

El patrón se repite en la 6, la 7 y la 10, y es el mismo que apareció con Agent Calendar antes de construir TaskKeeper: **nicho vacío no es nicho libre, muchas veces es nicho sin demanda**. La 4 es la única de las siete donde la demanda ya está demostrada por decenas de miles de instalaciones y donde lo que hay publicado es manifiestamente mejorable.

### Lo que dice la tracción propia

| Extensión | Instalaciones Marketplace | Descargas | Publicada |
|---|---:|---:|---|
| Handsfree for Claude Code | 9 | 60 | 17 ago |
| ChangeKeeper | 1 | 71 | 17 ago |
| SessionKeeper | 1 | 45 | 17 ago |
| **TaskKeeper** | **297** | **313** MP + 3.754 Open VSX | 21 ago |

TaskKeeper hizo en tres días treinta veces lo que las otras tres en una semana. La diferencia no fue la calidad del código —las tres primeras están auditadas— sino tres cosas: **nombre buscable**, **el nicho de los agentes de IA** y **lanzamiento en Reddit y X**. CostKeeper se apoya deliberadamente en las tres, y además en un público que ya está en casa: quien deja agentes corriendo de noche con TaskKeeper es exactamente quien se lleva sustos de consumo.

Ninguna de las cuatro ha vendido todavía una licencia Pro. Eso se trata en §5 y en TUS-TAREAS.md, y es más importante que la elección de idea.

## 2. Fase 0 técnica · verificada el 24 de agosto

La puerta de esta idea era si el dato existe de verdad en local. Existe, y es mejor de lo que la ficha 4 suponía.

**Claude Code** — `~/.claude/projects/<proyecto>/<sesión>.jsonl`, una línea por mensaje. Cada mensaje de asistente trae:

```
message.model                                    claude-fable-5
message.usage.input_tokens                       2
message.usage.output_tokens                      9
message.usage.cache_read_input_tokens            0
message.usage.cache_creation.ephemeral_1h_input_tokens   44834
message.usage.cache_creation.ephemeral_5m_input_tokens   0
message.usage.output_tokens_details.thinking_tokens      0
message.usage.server_tool_use.web_search_requests       0
timestamp · cwd · sessionId · gitBranch · entrypoint · version · effort · isSidechain
```

Tres consecuencias que ningún competidor explota:

- **`message.id` es la unidad de cobro, no la línea.** El mismo mensaje aparece repetido dentro del fichero y copiado entre ficheros; contar líneas infla el total un 127 % (ver el prototipo, más abajo).
- La caché viene **separada en 1 h y 5 m**, y cada una tiene precio distinto (2× y 1,25× el de entrada). Quien suma un único `cache_creation_input_tokens` da una cifra equivocada.
- `cwd`, `gitBranch`, `isSidechain` y `entrypoint` permiten repartir el gasto **por proyecto, por rama y por subagente**, que es la pregunta que de verdad se hace una consultora.

**Codex** — `~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl`, con eventos `token_count` (119 en una sola sesión) que traen consumo acumulado y del último turno, `model_context_window` y, sobre todo, los **límites reales del plan**:

```
rate_limits.primary.used_percent      69.0
rate_limits.primary.window_minutes    10080        (semana)
rate_limits.primary.resets_at         1787860920
rate_limits.plan_type                 plus
rate_limits.credits.balance           "0"
```

Claude Code **no** guarda sus límites en los jsonl: la ventana de cinco horas hay que reconstruirla por marcas de tiempo y queda como dato derivado, nunca presentado como exacto.

**Volumen real en una máquina de trabajo:** 2,4 GB en `~/.claude/projects` y 1,7 GB en `~/.codex/sessions`. Un indexador incremental con SQLite y marca de agua por fichero es un requisito, no un lujo, y es justo la barrera que ninguna extensión de barra de estado ha cruzado.

### Prototipo ejecutado sobre datos reales

`prototipos/proto3.mjs` recorre el histórico de Claude Code y calcula coste por proyecto, modelo y día. Resultado en esta máquina el 24 de agosto:

```
760 ficheros · 2,52 GB · 192.262 lineas con usage · 92.666 mensajes unicos · 9,1 s
TOTAL: $29.087 equivalente de API · 68.221 millones de tokens
Escritura de cache: 1 h 721.720.785 tok (x2) · 5 m 66.121.727 tok (x1,25)
```

Cuatro cosas quedan demostradas, no supuestas:

1. **Contar líneas es contar mal, y por mucho.** Las 192.262 líneas con `usage` corresponden a 92.666 mensajes: un mensaje con varios bloques se escribe varias veces, cada una con el `usage` completo, y `--resume` y los worktrees copian mensajes entre ficheros. Cobrar por línea da **$66.006 en vez de $29.087: un 127 % de más**. La vía obvia es la equivocada, y esa es la mejor noticia de todo el análisis, porque es la que van a haber tomado los veinticinco competidores.
2. **El desglose de caché importa.** Tratando toda la escritura como 5 m, el total sale $26.079 en lugar de $29.087: **una subestimación del 10,3 %**.
3. **Rendimiento.** 2,52 GB en 9,1 segundos, y el índice resultante ocupa 3,4 MB y carga en 114 ms. No hace falta base de datos.
4. **El reparto por proyecto funciona y es el argumento comercial.** Sale $11.083 en el proyecto principal y $3.362 en el segundo. Esa tabla es lo que una consultora necesita para imputar, y es lo que ninguna de las 25 extensiones da.

Tres cautelas que la interfaz debe respetar desde el primer día: la cifra en dólares es **coste equivalente de API**, no la factura de un plan de suscripción; hay modelos sin tarifa conocida —130 mensajes `<synthetic>`— que se cuentan aparte y se dicen; y la identidad de proyecto se normaliza antes de agrupar, porque `C:\Users\kirne` y `c:\Users\kirne` son el mismo sitio y aparecían como dos.

El plan de ejecución auditado, con el código y los cuatro fallos que la auditoría encontró en él, está en [12-PLAN-EJECUCION.md](12-PLAN-EJECUCION.md).

## 3. Producto

**Una pregunta, contestada en cinco segundos sin configurar nada:** ¿qué me han gastado mis agentes, en qué proyecto y con qué modelo?

Gratis:

- Indexado local de Claude Code y Codex, incremental, sin configuración ni cuenta.
- Panel por día, proyecto, modelo, rama y sesión.
- Coste con desglose correcto de caché 1 h / 5 m, y **dos cifras siempre separadas**: coste equivalente de API y porcentaje de cuota del plan consumida. Nunca una sola cifra que las mezcle.
- Cuota de Codex real desde `rate_limits`; ventana de Claude derivada y etiquetada como tal.
- Barra de estado con la sesión en curso y el porcentaje de ventana de contexto.
- Los últimos 30 días de histórico.

Pro, 9 € de pago único con clave Polar:

- **Etiquetas de cliente por carpeta o repositorio, e informe por cliente.** Es la función que justifica el pago y la que no tiene ninguno de los 25 competidores.
- Exportación CSV y resumen mensual listo para adjuntar a una factura.
- Presupuestos por proyecto y avisos al 50, 80 y 100 %.
- Aviso de cuota con predicción: «a este ritmo agotas la ventana a las 17:40».
- Histórico ilimitado y comparación entre proveedores y modelos.
- Informe por rama o por pull request.

Quitar Pro deja de funcionar lo que Pro añadió; nada de lo gratuito se degrada, según la regla de la guía.

## 4. Decisiones de F0

| Decisión | Elegido |
|---|---|
| Nombre | **CostKeeper**. Comprobado el 24 de agosto: `argalla.costkeeper` libre en Marketplace y Open VSX, y **cero resultados** al buscar «costkeeper» en la tienda. Igual de libres quedaron `usagekeeper`, `tokenkeeper`, `quotakeeper`, `spendkeeper` y `budgetkeeper`; se elige *cost* porque es la palabra por la que se busca y encaja con la familia |
| Modelo de negocio | Núcleo gratis + Pro de pago único 9 €. **No suscripción**: el producto es local, no hay servicio que sostener, y la suscripción de la ficha 4 no se justifica |
| Proveedores del MVP | Claude Code y Codex, los dos verificados. Copilot, Gemini CLI y OpenRouter quedan para después de publicar |
| Backend | Ninguno, salvo la validación de licencia de Polar. Sin telemetría |
| Plataformas | Windows, macOS y Linux desde el primer día: solo se leen ficheros, no hay nada específico de sistema como en TaskKeeper |
| Idiomas | Inglés y español con `vscode.l10n`, y `l10n-sync` en CI |
| Integración con la familia | Enlace cruzado en las fichas de tienda con TaskKeeper, y nada más. Sin dependencias de código |
| Precisión | Tres niveles etiquetados siempre visibles: exacto, derivado y estimado. Las tarifas viven en un fichero versionado con su fecha |

## 5. El riesgo que importa, y qué se hace con él

El riesgo no es técnico ni de demanda: es que **hay veinticinco cosas gratis que enseñan un número parecido**, y que las cuatro extensiones publicadas de Argalla no han vendido ni una licencia.

Lo que se hace al respecto, y que debe ir en el plan desde el principio:

1. **El gratis tiene que ganar por sí solo.** Deduplicación por mensaje, precisión de caché, multiproveedor de verdad y reparto por proyecto son cosas que ninguna de las 25 hace. Y la primera es demostrable en una captura: la misma máquina, dos cifras, una de ellas más del doble que la otra. Si el gratis no es claramente mejor, el Pro no importa.
2. **El Pro se dirige a quien factura.** Un autónomo que imputa a tres clientes recupera 9 € la primera vez que exporta un mes. Ese es el comprador, no el usuario curioso que quiere ver una barra.
3. **La distribución se planifica antes de escribir código**, no después: publicación en Open VSX el mismo día —de ahí salieron las 3.754 descargas de TaskKeeper—, lanzamiento en r/ClaudeAI y en X, y mención en la ficha de TaskKeeper, que ya tiene 297 instalaciones.
4. **Puerta a los 30 días de publicar.** Si el gratis no pasa de 500 instalaciones o el Pro no vende tres licencias, no se amplía a más proveedores: se para y se revisa el posicionamiento.

La regla de validación del README —15 entrevistas, 5 demos, 3 compromisos— aquí se sustituye por algo más barato y más honesto para un producto de 9 € y de público global: **publicar el gratis pronto y medir**. Las entrevistas tienen sentido cuando el compromiso son nueve semanas y el cliente es una empresa; no cuando el MVP son tres o cuatro semanas y el precio es el de dos cafés.

## 6. Métricas

- Instalaciones y proporción Open VSX / Marketplace.
- Proyectos indexados por usuario y sesiones por semana.
- Licencias Pro vendidas, y cuántas exportan un informe en el primer mes.
- Desviación entre coste calculado y factura real de API, medida sobre un mes propio.
- Tiempo de indexado inicial sobre 4 GB de histórico y tiempo incremental.

## 7. Riesgos técnicos

- Los formatos de `~/.claude` y `~/.codex` no son API pública y pueden cambiar sin aviso: el lector debe tolerar campos ausentes y no romperse nunca, con una suite de fixtures por versión.
- Las tarifas cambian: fichero versionado, fecha visible y nunca un precio incrustado en el código.
- Los ficheros son grandes: nada de leer entero en memoria; lectura por líneas y marca de agua.
- Datos personales: los jsonl contienen prompts y código. La extensión **no envía nada**, y los informes solo llevan agregados. Cualquier volcado de depuración debe ir redactado.
- VS Code puede incorporar algo parecido para Copilot; no cubriría Claude Code ni Codex, que es el público objetivo.

## 8. Documentos

- Plan de ejecución con fases y auditorías: [12-PLAN-EJECUCION.md](12-PLAN-EJECUCION.md).
- Lo que depende del titular: [TUS-TAREAS.md](TUS-TAREAS.md).
- Proceso completo de cero a publicada: [GUIA-EXTENSION-VSCODE-COMPLETA.md](GUIA-EXTENSION-VSCODE-COMPLETA.md).
