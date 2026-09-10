# AI Media Network Operator v0.6.1

## Cambio principal
Se corrige el flujo de producción para que **Google Drive reciba solo piezas aprobadas**.

## Nuevo flujo
1. `/generar <story> todo`
2. `/pieza <story> <formato>`
3. El bot envía una **preview** por Telegram con el **copy propuesto**.
4. El operador decide:
   - ✅ Aprobar y enviar a Drive
   - 🔁 Regenerar pieza
   - ✍️ Regenerar copy
   - ❌ Descartar
5. Solo al aprobar:
   - se guarda la pieza en la carpeta `PENDIENTES`
   - se crea `copy_*.txt`
   - se crea `info_*.json`
   - se registra la fila en `COLA_DE_PUBLICACION`

## Estados operativos usados
- `content_ready`
- `in_review`
- `approved`
- `discarded`

## Ajustes incluidos
- `/drive` ahora informa que **solo las piezas aprobadas** se envían a Drive.
- `/pieza` ya no guarda automáticamente en Google Drive.
- Nueva interfaz de revisión con botones inline en Telegram.
- `help` y versión actualizados a `v0.6.1`.

## Variables
No requiere variables nuevas en Railway.
