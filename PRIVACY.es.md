# Privacidad

CostKeeper es software local. No recoge telemetría, no tiene cuenta y no hace ninguna petición de red salvo la comprobación de licencia que se describe abajo.

## Qué lee

Las transcripciones que tus agentes ya escriben en este equipo:

- `~/.claude/projects/**/*.jsonl`
- `~/.codex/sessions/**/rollout-*.jsonl`
- las carpetas adicionales que pongas en `costkeeper.rutasExtra`

Siempre en solo lectura. CostKeeper no modifica ni borra nada de Claude Code ni de Codex.

## Qué guarda

Un índice dentro del almacenamiento global de la extensión. Cada entrada es un mensaje y contiene **solo**:

id del mensaje · proveedor · marca de tiempo · ruta del proyecto · nombre de la rama · id de sesión · si es subagente · nombre del modelo · seis contadores de tokens · el fichero del que salió.

No hay ningún campo de texto libre. Los prompts, las respuestas, el contenido de los ficheros y los nombres de los ficheros editados se leen para localizar los contadores y se descartan. Hay una prueba que siembra una cadena marcada en el prompt de un fixture y falla si aparece en el índice o en una exportación.

## Qué sale de tu equipo

Nada, salvo que compres Pro. Al introducir una clave de licencia, a Polar (el vendedor registrado) se envía, para activarla y validarla:

- la clave de licencia,
- el nombre de este equipo, como etiqueta de la activación,
- tu sistema operativo y la versión de la extensión.

Ni un nombre de proyecto, ni una ruta, ni una cifra de tu histórico. La validación se repite como mucho una vez al día y funciona sin conexión durante 14 días.

## Exportaciones

El CSV que exportas lleva agregados: la clave de agrupación (proyecto, cliente, modelo, día, rama o sesión) y cifras. Si agrupas por proyecto, el CSV lleva rutas de proyecto, porque es lo que has pedido.

## Diagnóstico

El canal de salida de CostKeeper registra recuentos y rutas acortadas. Nunca registra contenido de las transcripciones ni claves de licencia.

Dudas: info@tecniartgalicia.com
