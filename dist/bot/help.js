"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.helpText = exports.commandMenu = void 0;
exports.commandMenu = [
    { command: 'corrida', description: 'Buscar y clasificar noticias' },
    { command: 'inbox', description: 'Ver Story Inbox' },
    { command: 'story', description: 'Abrir una Story por numero' },
    { command: 'generar', description: 'Generar contenido de una Story' },
    { command: 'pieza', description: 'Generar preview de pieza para revision' },
    { command: 'publicada', description: 'Marcar pieza como publicada' },
    { command: 'drive', description: 'Conectar o revisar Google Drive' },
    { command: 'elecciones', description: 'Abrir Election Desk' },
    { command: 'urgente', description: 'Ver Stories prioritarias' },
    { command: 'resumen', description: 'Brief del State Brain activo' },
    { command: 'topic', description: 'Consultar Topic' },
    { command: 'profile', description: 'Consultar Profile' },
    { command: 'watch', description: 'Seguir tema o perfil' },
    { command: 'fuentes', description: 'Ver fuentes activas' },
    { command: 'ready', description: 'Contenido generado listo' },
    { command: 'estado', description: 'Cambiar State Brain' },
    { command: 'identidad', description: 'Cambiar identidad editorial' },
    { command: 'estado_actual', description: 'Ver contexto operativo' },
    { command: 'whoami', description: 'Mostrar tu Telegram chat id' },
    { command: 'ayuda', description: 'Ver todos los comandos' }
];
exports.helpText = `AI MEDIA NETWORK OPERATOR v0.6.2

Comandos principales:
/corrida 6h - Discovery real del periodo
/inbox - Story Inbox
/story 12 - Analisis completo
/generar 12 todo - Paquete editorial
/elecciones - Election Desk
/urgente - P0/P1 y alta relevancia
/resumen - Brief ejecutivo

Contexto:
/estado Nuevo Leon
/identidad Norte En Alerta
/whoami - Mostrar tu chat id
/estado_actual

Inteligencia:
/topic Agua
/profile Samuel Garcia
/watch Metro Linea 6
/fuentes

Produccion:
/drive - conectar/revisar Google Drive
/ready
/pieza 12 - abre selector de formato
/pieza 12 fb - post Facebook/IG 1080x1350
/pieza 12 story - story 1080x1920
/pieza 12 reel - reel cover 1080x1920
/pieza 12 square - post 1080x1080
/pieza 12 breaking - urgente 1080x1350
/pieza 12 quote - cita 1080x1350
/pieza 12 carousel - carrusel 1080x1350 por slide
/publicada 12 story - marcar como publicada y mover a PUBLICADAS

NUEVO FLUJO:
1) /pieza genera una PREVIEW en Telegram
2) Revisas pieza + copy
3) Apruebas, regeneras o descartas
4) Solo las piezas APROBADAS se guardan en Drive y se agregan a COLA_DE_PUBLICACION.
5) Al marcar PUBLICADA, se mueve a PUBLICADAS y se actualiza la cola.`;
