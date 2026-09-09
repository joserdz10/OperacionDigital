# AI Media Network Operator v0.5.2

Esta versión está enfocada en branding y formatos de Norte En Alerta.

## Formatos fijos
- `fb`, `ig`, `post`, `breaking`, `quote`, `carousel`: 1080x1350
- `story`, `reel`: 1080x1920
- `square`: 1080x1080

## Assets incorporados
- `assets/nea-logo-full.png`
- `assets/nea-isotipo.png`
- `assets/nea-fallback-monterrey.jpg`

## Prueba después del deploy
No hace falta volver a correr Discovery. Con una Story que ya tenga content bundle:

```text
/pieza 22 story
/pieza 22 fb
```

Si una Story todavía no tiene contenido visual generado, ejecutar antes:

```text
/generar 22 todo
```
