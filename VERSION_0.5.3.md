# AI Media Network Operator v0.5.3

Fix de webhook para grammY:

- Inicializa explícitamente el bot con `await bot.init()` antes de procesar updates por webhook.
- Evita respuestas HTTP 500 causadas por `bot.handleUpdate()` sobre un bot no inicializado.
- Mantiene webhook, renderer v0.5.2, logos, tamaños y plantillas.
- Mejora el log de errores de webhook.
