# Correos de autenticación

- Invitación: asunto `Bienvenido al equipo avansa`, plantilla `invite.html`.
- Recuperación: asunto `Restablece tu contraseña de avansa`, plantilla `recovery.html`.
- Enlace mágico: asunto `Entra a avansa`, plantilla `magic-link.html`.
- Las tres plantillas usan `SiteURL` y `TokenHash` para que el callback SSR
  convierta el token en una cookie antes de mostrar una página privada.
- `SiteURL` debe ser `https://dashboard.somosavansa.com`; el redirect permitido
  debe incluir `https://dashboard.somosavansa.com/**`.
- El envío a destinatarios externos requiere SMTP transaccional configurado en Supabase Auth.
