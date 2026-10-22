# Operación

## Alcance

Plástica, Educación Plástica, Artes Visuales y Educación Visual; niveles inicial, primario y secundario. Se consultan las cuatro juntas porque una junta puede contener varios niveles. Se excluyen superior, universidad y niveles desconocidos. Dibujo técnico y Educación Artística sin especialidad no se incluyen automáticamente.

Cobertura inicial: todas las localidades de Tucumán. El remitente y la destinataria se configuran fuera del repositorio.

## Despliegue

1. Crear la base D1 del proyecto en la cuenta de Cloudflare y colocar su ID en `wrangler.jsonc`.
2. Aplicar migraciones: `npx wrangler d1 migrations apply alerta-docente --remote`.
3. Configurar `.dev.vars` siguiendo `.env.example`. Generar un ADMIN_TOKEN aleatorio de al menos 32 caracteres.
4. Publicar: `npm run deploy`.
5. Subir secretos: `npm run secrets:upload`.
6. Mantener `EMAIL_PROVIDER=disabled` hasta disponer de una clave Resend propia y remitente verificado.
7. Probar con `npm run scan` y consultar `npm run status`.
8. Activar correo estableciendo `EMAIL_PROVIDER=resend` y volver a publicar.

Si Wrangler carece del permiso D1, las migraciones pueden ejecutarse en la consola de la base creada exclusivamente para esta herramienta. Registrar los nombres aplicados en la tabla estándar `d1_migrations` para que futuras migraciones no se repitan.

## Programación y presupuesto

Un cron revisa los cuatro listados cada diez minutos, todo el día. Usa hora UTC para la programación y UTC-3 para interpretar SIME y el presupuesto diario.

Se procesan los detalles de hasta dos publicaciones candidatas por ciclo, con rotación para no postergar siempre las mismas. Para acotar solicitudes, se consulta la dirección de la primera escuela de cada publicación. Los demás establecimientos siguen figurando y se enlaza el detalle oficial. Una dirección ausente no cambia la identidad de una novedad.

Se entregan hasta dos novedades por ejecución y se permiten hasta cincuenta intentos diarios propios. La cuota del proveedor se comparte con los demás proyectos de la cuenta. Resend Free y Workers/D1 Free deben mantenerse en sus planes gratuitos.

## Diagnóstico

- `GET /healthz`: última consulta completa exitosa, estado del monitor y si el envío está habilitado. Una consulta exitosa de hace más de treinta minutos devuelve 503.
- `GET /admin/status`: informe privado, requiere Bearer ADMIN_TOKEN.
- `POST /admin/run`: revisión manual, requiere el mismo token.
- No hay una ruta pública de envío ni una aplicación de registro.

Una falla parcial conserva las publicaciones de la junta afectada. Solo se intentan enviar eventos cuyos detalles se revalidaron en el ciclo actual. El informe incluye errores acotados sin direcciones ni claves.

## Entrega y recuperación

`pending`: espera intento; `sending`: intento con lease; `sent`: aceptado por Resend; `expired`: vencido, retirado o sustituido antes de enviarse; `failed`: fallo permanente o intentos agotados; `uncertain`: requiere reconciliar manualmente con Resend.

La aceptación por Resend no confirma llegada a Gmail ni lectura humana. Revisar el historial de Resend si un correo no llega. No reactivar un envío incierto sin comprobar antes si ya fue aceptado. Las claves de idempotencia duran 24 horas; la herramienta deja de reintentar automáticamente a las 23 horas desde el primer intento.

No se prometen alertas de fallo si el propio programador o el proveedor de correo se caen: el endpoint de salud y los registros permiten detectar esa situación. Un servicio externo de vigilancia puede agregarse posteriormente.

## Pausa y ajustes

- Pausar consultas: `MONITOR_ENABLED=false` y publicar.
- Pausar correos conservando consultas: `EMAIL_PROVIDER=disabled` y publicar.
- Cambiar destinataria o remitente: editar los secretos; los intentos ya iniciados conservan su sobre original.
- Cambiar especialidad o niveles: ajustar reglas, agregar casos relevantes y pasar `npm run check` antes de publicar.
- Cada chunk terminado se cierra con su commit; las credenciales no se versionan.

## Limitaciones de la fuente

La API es la misma que utiliza la web pública de SIME, no un contrato oficial de integración. Se valida su estructura, pero cambios en nombres de materias o niveles pueden necesitar un ajuste. Siempre se remite a la publicación oficial para requisitos y horarios.
