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
5. Programación, despliegue y verificación operativa.

## Estado

- Chunk 1 completado: base, reglas y herramientas. Tipos, lint, formato, prueba de superficie pública y empaquetado verificados.
- Envío real y programación desactivados hasta completar las verificaciones.
- Dominio existente con correo Zoho: no modificar sus MX ni trasladar DNS para esta herramienta.
