export const commandMenu = [
  { command: 'corrida', description: 'Buscar y clasificar noticias' },
  { command: 'inbox', description: 'Ver Story Inbox' },
  { command: 'story', description: 'Abrir una Story por numero' },
  { command: 'generar', description: 'Generar contenido de una Story' },
  { command: 'pieza', description: 'Generar pieza y guardar en Drive' },
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

export const helpText = `AI MEDIA NETWORK OPERATOR v0.6.0

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

Cuando Drive está conectado, /pieza guarda automáticamente imagen + copy + metadata en PENDIENTES y registra la fila en COLA_DE_PUBLICACION.`;
