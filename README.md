# Alerta Docente

Alertas privadas por correo sobre llamados abiertos de Plástica publicados en SIME Tucumán, desde educación inicial hasta secundaria.

## Stack

TypeScript estricto, Cloudflare Workers con Cron Triggers, D1, Vitest, Wrangler, ESLint y Prettier. No requiere una aplicación web ni inteligencia artificial.

## Desarrollo

- Node.js 24 LTS y npm.
- `npm ci`
- `npm run check`: tipos, lint, formato y pruebas.
- `npm run dev`: Worker local.
- `npm run build`: empaquetado de producción sin publicar.
- `npm run deploy`: publicación explícita.

Las credenciales y los datos de destinatario van en `.dev.vars` localmente y en secretos de Workers en producción. Nunca se versionan.

## Plan por chunks

1. Base, AGENTS.md y herramientas.
2. Cliente SIME validado, fixtures y pruebas.
3. Selección, fechas, cambios y persistencia D1.
4. Correo, bandeja de salida y reintentos.
5. Programación, despliegue y verificación del monitor.
6. Activación del correo y prueba real con el proveedor.

## Estado

- Chunk 1 completado: base, reglas y herramientas. Tipos, lint, formato, prueba de superficie pública y empaquetado verificados.
- Chunk 2 completado: cliente SIME con validación, límites de tiempo y reintentos acotados. Siete pruebas pasan; fixtures de datos públicos del 22/10/2026.
- Chunk 3 completado: selección hasta secundaria, fechas argentinas, eventos y bloqueo de concurrencia en D1. Quince pruebas pasan dentro del entorno de Workers.
- Chunk 4 completado: correo HTML/texto, proveedor Resend, cuerpo inmutable y reintentos con clave estable. Veintitrés pruebas pasan; aún no se hicieron envíos reales.
- Chunk 5 completado: monitor desplegado y acceso desde Cloudflare confirmado (cuatro juntas y 147 publicaciones en la prueba del 22/10/2026). Última comprobación completa sin coincidencias dentro del alcance.
- Chunk 6 completado: clave propia restringida al dominio verificado, correo de prueba enviado desde Cloudflare y marcado Delivered por Resend el 22/10/2026 a las 18:18 de Argentina. Una segunda solicitud de prueba reutilizó la aceptación sin otro envío.
- Programación y correo activos cada diez minutos. Ejecución automática comprobada a las 18:20 del 22/10/2026. Treinta y siete pruebas automáticas pasan.
- Dominio existente con correo Zoho: no modificar sus MX ni trasladar DNS para esta herramienta.

## Envío de correo

Proveedor: Resend Free, aprovechando el subdominio remitente existente y verificado en el ecosistema Aramis. La herramienta necesita su propia clave restringida a envío, `EMAIL_FROM` y `ALERT_RECIPIENT`.

Se envían hasta dos novedades por ejecución y se limita a cincuenta intentos por día argentino. Los correos conservan su destinatario y contenido desde el primer intento. Resend conserva las claves de idempotencia durante 24 horas: las recuperaciones se detienen a las 23 horas para revisión manual, sin arriesgar un reenvío después de esa ventana. Un estado `sent` significa aceptación por el proveedor, no lectura ni llegada confirmada a la bandeja de entrada.

Operación y recuperación: [guía de operación](docs/operations.md). Servicio de salud: https://alerta-docente.miguel-carretero.workers.dev/healthz.

El correo existente de Zoho y el dominio raíz quedan fuera de los cambios de esta herramienta.
