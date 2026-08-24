# Privacidad

CostKeeper es software local. No recoge telemetría, no tiene cuenta y no hace ninguna petición de red.

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

Nada. Esta versión es gratuita y no hace ninguna petición de red; el código de licencias está presente pero apagado. Si algún día se activa una versión de pago, esta sección dirá exactamente qué se envía y cuándo, antes de que se envíe.

## Exportaciones

El CSV que exportas lleva agregados: la clave de agrupación (proyecto, cliente, modelo, día, rama o sesión) y cifras. Si agrupas por proyecto, el CSV lleva rutas de proyecto, porque es lo que has pedido.

## Diagnóstico

El canal de salida de CostKeeper registra recuentos y rutas acortadas. Nunca registra contenido de las transcripciones ni claves de licencia.

Dudas: info@tecniartgalicia.com
