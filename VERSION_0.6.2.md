# AI Media Network Operator v0.6.2

## Cambio principal
Se completa el flujo humano de publicación después de la aprobación.

## Flujo de producción
1. `/generar <story> todo`
2. `/pieza <story> <formato>`
3. Telegram muestra preview + copy propuesto.
4. El operador puede aprobar, regenerar o descartar.
5. Al aprobar:
   - la pieza se guarda en `PENDIENTES`
   - se guarda el copy
   - se guarda metadata
   - se registra en `COLA_DE_PUBLICACION`
   - estado: `PENDIENTE_PUBLICACION`
6. Después de publicar manualmente en redes, el operador pulsa **Marcar como PUBLICADA** o usa:
   - `/publicada <story> <formato>`
7. El bot:
   - mueve la carpeta de la pieza de `PENDIENTES` a `PUBLICADAS`
   - cambia el estado en `COLA_DE_PUBLICACION` a `PUBLICADA`
   - registra fecha/hora de publicación
   - actualiza `production_exports` a `published`

## Cambio de estructura
Las nuevas exportaciones aprobadas usan una carpeta independiente por Story + formato, por ejemplo:

`PENDIENTES/STORY_22_story`

Esto permite mover una pieza a `PUBLICADAS` sin arrastrar otros formatos de la misma Story.

## Variables
No agrega variables nuevas. Requiere que ya exista:

- `GOOGLE_DRIVE_PUBLISHED_FOLDER_ID`

La v0.6.2 valida esa variable cuando Google Drive está habilitado.
