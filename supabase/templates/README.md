# Correo de invitación

- Asunto: `Bienvenido al equipo avansa`
- Plantilla: `invite.html`
- La plantilla usa `RedirectTo` y `TokenHash`; el redirect permitido debe incluir el dominio del dashboard y la ruta `/auth/confirm`.
- El envío a destinatarios externos requiere SMTP transaccional configurado en Supabase Auth.
