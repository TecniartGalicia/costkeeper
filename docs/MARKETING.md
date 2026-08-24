# CostKeeper · posicionamiento y borradores de lanzamiento

Los publica una persona. Yo redacto.

## Posicionamiento

**Una frase:** «Cuenta mensajes, no líneas: las demás extensiones de consumo se equivocan más del doble».

**Cuña (lo que nadie más tiene):** la deduplicación por `message.id`. Es la única afirmación del producto que es a la vez cierta, verificable en una captura y sorprendente. Todo lo demás —multiproveedor, caché por TTL, cuota real— refuerza esa idea: *aquí las cifras están bien*.

**Lo que se vende:** el reparto por cliente y la exportación para facturar. El contador va gratis porque compite con veinticinco gratuitos; lo que se paga es lo que un autónomo recupera la primera vez que factura un mes.

**Público, por orden:**

1. Quien deja agentes trabajando sin mirar (usuarios de TaskKeeper).
2. Autónomos y consultoras que imputan el gasto de IA a clientes.
3. Quien ya usa un contador y sospecha que la cifra no cuadra.

**Lo que NO se dice nunca:** que es tu factura. Es coste equivalente de API, y decirlo mal en el lanzamiento sería regalar la primera reseña de una estrella.

## Datos que se pueden citar

Todos medidos el 24 de agosto de 2026 sobre un histórico real de 2,52 GB de Claude Code y 1,72 GB de Codex:

| Dato | Cifra |
|---|---|
| Líneas con `usage` frente a mensajes reales | 192.262 → 92.666 |
| Coste contando líneas frente a contando mensajes | 66.006 $ → 29.087 $ (**127 % de más**) |
| Efecto de no separar la caché por TTL | −10,3 % |
| Indexado completo · reindexado | 7 s · 28 ms |
| Tamaño del índice | 3,4 MB comprimidos |

## Título y primer párrafo (Reddit, r/ClaudeAI)

> **Most Claude Code usage trackers overcount by more than 2x. Here's why.**
>
> I was building a cost tracker and could not make my numbers match anyone else's. Turns out a single assistant message is written to the transcript once per content block, and every copy carries the full `usage` object. `--resume`, forks and worktrees copy messages between files on top of that.
>
> On my own history: 192,262 lines with a `usage` object, but only 92,666 real messages. Counting lines gives $66,006. Counting messages gives $29,087.
>
> If you dedupe by `message.id` you get the right number. I did that, plus pricing 1-hour cache writes at 2x instead of lumping them with 5-minute ones (another 10.3 %), and put it in a free extension: [link]
>
> It reads `~/.claude/projects` and `~/.codex/sessions` locally — no account, no telemetry. Happy to be told I'm wrong about the dedupe, that's the part I'd most like a second opinion on.

Ese último párrafo es deliberado: invita a la corrección en vez de vender, que es lo que funciona en ese subreddit.

## X (hilo de 3)

1. Most Claude Code cost trackers overcount by more than 2×. A message is written to the transcript once per content block, and every copy repeats the full usage object. 192,262 lines → 92,666 actual messages on my history.
2. Counting lines: $66,006. Counting messages: $29,087. Same data. Dedupe by message.id and the number is right. 1-hour cache writes also cost 2× the 5-minute ones — another 10.3 % nobody splits.
3. Put it in a free VS Code extension: Claude Code + Codex in one table, cost per project, model and day, local only, no account. Pro adds client tagging and CSV for invoicing. [link]

## dev.to / Hacker News

Ángulo largo: **«Reading agent transcripts: four ways to overcount»** — duplicados por bloque, copias entre ficheros, razonamiento contado dos veces, y el acumulado de Codex sumado evento a evento (×60). Es un artículo técnico útil aunque no instales nada, y ese es el que se comparte.

Show HN: **«CostKeeper – what your coding agents actually cost, per project and per client»**.

## Después del lanzamiento

- Enlace cruzado desde la ficha de TaskKeeper: 297 instalaciones que son exactamente este público.
- awesome-lists de Claude Code: mandar el PR cuando el repo pase de ~10 estrellas; antes rinde poco.
- La comprobación que más valdría: contrastar un mes contra una factura real de pago por uso y publicarla en el README. Convierte el argumento central en un hecho verificado.
