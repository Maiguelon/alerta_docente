# Reglas de trabajo — Alerta Docente

## Alcance autorizado

- Herramienta privada para avisar por correo sobre llamados abiertos de Plástica de Tucumán, desde inicial hasta secundaria.
- Cloudflare Workers Free y servicios gratuitos. No activar planes pagos ni comprar dominios.
- El correo destinatario y las credenciales se configuran fuera del código versionado.
- No cambiar DNS, MX ni servicios de producción ajenos a esta herramienta.
- No añadir una plataforma pública, suscripciones, anuncios o más especialidades sin nueva indicación.

## Chunks y commits

- Dividir el trabajo en chunks delimitados, revisables y verificables.
- Completar la validación apropiada antes de cerrar cada chunk con un commit.
- No mezclar trabajo de chunks futuros en un commit. Registrar avances y pendientes en README.md.
- Conservar cambios del usuario. No reescribir el historial ni hacer commits de archivos ajenos.
- No hace falta detenerse para pedir permiso entre chunks autorizados.

## Programación

- TypeScript estricto. Preferir funciones pequeñas, nombres claros y dependencias justificadas.
- Separar acceso a SIME, reglas de selección, almacenamiento, envío y orquestación.
- Validar los datos externos; una respuesta inválida es un error, no una lista vacía.
- Interpretar las fechas de SIME en America/Argentina/Buenos_Aires.
- Guardar migraciones SQL versionadas y usar parámetros en consultas.
- Registrar entregas pendientes y completadas; controlar concurrencia y reintentos.
- No prometer entrega exactamente una vez: documentar el caso de resultado ambiguo del proveedor.
- Usar límites de tiempo y reintentos acotados; conservar estado ante fallos parciales.
- No incluir secretos, direcciones personales ni cuerpos completos de correo en logs o commits.
- No guardar ni consultar datos de postulantes.
- No exponer rutas que permitan enviar correos o ejecutar revisiones sin autenticación.

## Validación y operación

- Ejecutar typecheck, lint, formato y tests relevantes para cada cambio.
- Probar reglas y fallos importantes, no detalles triviales de implementación.
- Las pruebas habituales usan fixtures y proveedores simulados; no envían correos reales.
- Verificar el empaquetado con Wrangler y probar el acceso a SIME desde Cloudflare.
- Mantener documentación de configuración, despliegue, recuperación y límites gratuitos.
- Avisar al usuario de avances significativos y de bloqueos concretos.
