# CostKeeper

**Lo que te han costado de verdad tus agentes: por proyecto, por modelo y por cliente.**

CostKeeper lee el histórico que Claude Code y Codex ya guardan en tu disco y lo convierte en una cuenta con la que puedes hacer algo. Sin cuenta, sin telemetría y sin red: todo se calcula en local.

## Instalar

[Marketplace de VS Code](https://marketplace.visualstudio.com/items?itemName=argalla.costkeeper) · [Open VSX](https://open-vsx.org/extension/argalla/costkeeper) (Cursor, Windsurf, VSCodium) · o `code --install-extension argalla.costkeeper`

Después, ejecuta **CostKeeper: abrir el panel**. No hay nada que configurar: las transcripciones ya están ahí.

![Panel de CostKeeper](https://raw.githubusercontent.com/TecniartGalicia/costkeeper/HEAD/media/shots/panel.png)

## Por qué aquí los números salen distintos

Casi todas las extensiones de consumo cuentan una línea del transcript como un cobro. Es la lectura obvia, y es la equivocada.

Un mismo mensaje del asistente se escribe varias veces en el fichero —una por bloque de contenido— y cada copia lleva el objeto `usage` **completo**. Además, `--resume`, los forks y los worktrees de git copian mensajes entre ficheros. Sobre un histórico real de 2,5 GB:

| | |
|---|---|
| Líneas con objeto `usage` | 192.262 |
| Mensajes reales | **92.666** |
| Coste contando líneas | 66.006 $ |
| Coste de los mensajes reales | **29.087 $** |

Un **127 % de más**. CostKeeper cobra cada `message.id` una sola vez y, cuando el mismo id aparece con consumos distintos, se queda con el estado final del mensaje.

Dos cosas más que no hace nadie:

- **La escritura de caché no cuesta siempre lo mismo.** Claude cobra la de una hora al doble de la tarifa de entrada y la de cinco minutos a 1,25×. Contarlo todo junto se queda un 10,3 % corto en ese mismo histórico. CostKeeper las separa.
- **Los tokens de razonamiento ya están dentro de `output_tokens`.** Sumarlos aparte infla la cuenta por segunda vez.

## Qué incluye

**Gratis, para siempre**

- Claude Code y Codex en la misma tabla, con indexado incremental. 4 GB de histórico en unos 7 segundos; a partir de ahí, las actualizaciones son instantáneas.
- Gasto por proyecto, modelo, día, rama y sesión, con los subagentes contados aparte.
- **La cuota de Codex tal como la publica Codex**: porcentaje usado, ventana, cuándo se reinicia y plan.
- La ventana de cinco horas de Claude reconstruida a partir de las marcas de tiempo, etiquetada como deducida y a propósito sin porcentaje, porque ese dato no se puede saber.
- Barra de estado con el gasto de hoy del proyecto abierto.
- Los últimos 30 días.

**Pro — 9 €, pago único**

- **Etiquetar un proyecto con un cliente**, y agrupar y exportar por cliente. El informe está pensado para ir directo a una factura.
- Exportación a CSV con resumen mensual.
- Presupuestos mensuales por proyecto con aviso al 50, al 80 y al 100 %.
- Predicción de cuota: a este ritmo, cuándo te quedas sin ella.
- Histórico ilimitado e informes por rama.

Quitar Pro no le quita nada a la versión gratuita, y los datos no se borran nunca: la licencia solo vuelve a enseñarlos enteros.

## Dos cifras que nunca se mezclan

La cifra en dólares es el **coste equivalente de API**: lo que esos tokens habrían costado pagando por uso. Con un plan de suscripción **no** es tu factura, y CostKeeper lo dice en todos los sitios donde la enseña.

La cifra de cuota es lo que estás consumiendo de verdad de tu plan. Codex la publica; Claude Code, no.

Las tarifas viven en un fichero con fecha (`src/core/precios/tarifas.json`) y esa fecha se ve en el panel y en cada exportación. Un modelo sin tarifa conocida se cuenta aparte y se dice, nunca se estima. Codex enseña tokens y cuota pero no euros: no hay tarifa que citar, e inventarla sería justo el error que esta extensión existe para no cometer.

## Privacidad

El índice no guarda ni un texto libre: ni prompts, ni código, ni nombres de ficheros editados. Lo más sensible que almacena es la ruta del proyecto y el nombre de la rama. No sale nada de tu equipo salvo la comprobación de licencia, y solo si compras Pro. Ver [PRIVACY.es.md](PRIVACY.es.md).

## Requisitos

VS Code 1.95 o posterior, en Windows, macOS o Linux. Claude Code o Codex instalados, con algo de histórico. Nada más.

## Sin vinculación

CostKeeper es una herramienta independiente de Argalla · Tecniart Galicia, S.L. Sin vinculación con Anthropic ni con OpenAI, ni respaldo ni patrocinio suyo. Claude y Claude Code son marcas de Anthropic; Codex es marca de OpenAI.

Los formatos de transcripción que lee no son API públicas. Pueden cambiar sin aviso; cuando pase, la extensión sigue funcionando e informa de lo que no ha podido clasificar, en vez de adivinarlo.

[English](README.md) · [Cambios](CHANGELOG.md) · [Incidencias](https://github.com/TecniartGalicia/costkeeper/issues)
