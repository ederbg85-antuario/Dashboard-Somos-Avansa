# avansa · Sistema Integral

Sistema interno de **avansa · Gestión Patrimonial**. Reúne las solicitudes del
sitio público, el CRM, la bandeja de WhatsApp, el desempeño de Meta Ads y el
control financiero sobre el mismo proyecto de Supabase.

> **Aviso permanente.** El trámite ante Infonavit es gratuito y cualquier
> persona puede realizarlo por su cuenta. avansa es una empresa privada e
> independiente de acompañamiento y gestión documental: no es Infonavit, no
> forma parte del Gobierno y no sustituye sus canales oficiales.

---

## Qué resuelve

| Módulo | Qué hace | Quién lo ve |
|---|---|---|
| **Solicitudes** | Recibe el formulario de somosavansa.com y conserva su atribución. | Cada asesor ve las suyas; administración ve todas. |
| **CRM** | Pipeline, clasificación, actividades y expediente documental de cada lead. | Cada asesor trabaja sólo su cartera; administración ve el conjunto. |
| **Conversaciones** | Refleja la bandeja de WhatsApp conectada mediante Chatwoot. | Cada asesor responde sólo sus conversaciones; administración puede supervisarlas todas en modo lectura. |
| **Marketing** | Campañas de Meta, GA4, Search Console, métricas diarias y calendario editorial. | Sólo administración. |
| **Finanzas y reportes** | Ingresos, egresos, plan de cuentas y estado de resultados. | Sólo administración. |
| **Equipo y perfil** | Invitaciones, acceso, reparto y datos personales del equipo. | Administración gestiona el equipo; cada persona edita su perfil. |

La relación entre lead, campaña, conversación, actividades y movimientos evita
que cada módulo tenga una versión distinta de la misma persona.

---

## Arrancar en local

```bash
npm install
cp .env.example .env.local
npm run dev
```

El dashboard abre en `http://localhost:3100`. No existe auto-registro ni un
flujo de “primer administrador”: toda cuenta necesita una invitación vigente
creada por un administrador.

Las variables mínimas son:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://vbvycgwxhsoaqionyrgc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_DASHBOARD_URL=http://localhost:3100
SUPABASE_SERVICE_ROLE_KEY=...
TZ=America/Mexico_City
```

`SUPABASE_SERVICE_ROLE_KEY` es exclusivamente de servidor. Nunca debe llevar el
prefijo `NEXT_PUBLIC_`, aparecer en componentes cliente ni enviarse al
navegador.

---

## Acceso e invitaciones

El alta es cerrada y sigue este flujo:

1. Un administrador captura nombre, apellidos, correo y rol en **Equipo**.
2. El servidor registra la invitación y, con `SUPABASE_SERVICE_ROLE_KEY`, llama
   a Supabase Auth para enviar el correo.
3. El enlace vuelve por `/auth/confirm` y lleva a `/bienvenida`.
4. La persona establece su contraseña y completa nombre, apellidos y teléfono.
5. El trigger de Auth acepta la cuenta sólo si el correo tiene una invitación
   vigente; el rol procede de esa invitación, nunca de metadatos enviados por
   el navegador.

La plantilla brandeada del correo está en `supabase/templates/invite.html` y se
debe copiar en **Supabase → Authentication → Email Templates → Invite user**.
El remitente de producción debe configurarse con SMTP propio para evitar los
límites del remitente de prueba de Supabase.

Desde **Mi perfil**, cada persona puede actualizar nombre, apellidos, teléfono
y foto. Los avatares viven en el bucket privado `avansa-avatars`; se entregan
con URL firmada y cada archivo queda dentro de la carpeta del usuario.

---

## Roles y privacidad

Sólo existen dos perfiles operativos:

| Rol | Alcance |
|---|---|
| **Administrador** | Ve todos los leads, pipelines, formularios y conversaciones; gestiona equipo, marketing, finanzas y ajustes. En la bandeja de mensajes supervisa, pero no responde. |
| **Asesor** | Ve y trabaja únicamente los leads, documentos, actividades, pipeline y conversaciones que tiene asignados. No puede consultar la cartera de otro asesor ni los módulos corporativos. |

La separación no depende del menú. Postgres aplica RLS a perfiles, leads,
actividades, documentos, conversaciones, respuestas y módulos corporativos;
además, los privilegios de columna impiden escrituras directas sobre campos
sensibles o de asignación. Un administrador no puede darse de baja a sí mismo
ni eliminar al último administrador.

### Reparto uno a uno

El formulario web y las conversaciones nuevas de WhatsApp comparten un
round-robin global y atómico. Sólo participan asesores activos con
`recibe_leads = true`, ordenados por `reparto_orden`; los administradores nunca
entran al reparto.

El turno se decide dentro de la misma transacción que crea el lead, por lo que
dos solicitudes simultáneas no pueden caer por accidente al mismo asesor. Si
el teléfono ya pertenece a un lead, se conserva su asesor y no se consume un
turno nuevo. La conversación de Chatwoot queda enlazada al lead que actúa como
fuente canónica de la asignación.

---

## Formulario del sitio público

El sitio (`../web`) y el dashboard comparten el proyecto de Supabase. El único
formulario público solicita:

- nombre, correo y teléfono/WhatsApp;
- NSS;
- si tiene crédito Infonavit activo;
- si está en buró de crédito y, cuando aplica, con qué institución;
- si conoce su ahorro para vivienda y, cuando aplica, su monto aproximado.

El navegador envía los datos a una ruta de servidor del sitio. Esa ruta valida
el contenido y llama con `SUPABASE_SERVICE_ROLE_KEY` a
`registrar_formulario_web`; `anon` no tiene permiso de ejecución. La función
aplica límite de frecuencia sin guardar la IP en claro, evita duplicados y
ejecuta el reparto antes de responder.

El NSS no se guarda en `public`: se cifra con Vault, sólo se puede leer mediante
`leer_nss` después de comprobar permisos y cada lectura queda auditada. Los
eventos de analítica no incluyen NSS, respuestas financieras ni otros datos
sensibles.

Las vistas normales del dashboard **no** usan la llave de servicio: trabajan
con la sesión de la persona y quedan sujetas a RLS.

---

## WhatsApp y Chatwoot

La integración está preparada con esta ruta:

```text
WhatsApp Cloud API (Meta) → Chatwoot → webhook del dashboard → Supabase → bandeja/CRM
```

Chatwoot recibe los mensajes del número oficial. Su webhook de cuenta llama a:

```text
POST /api/webhooks/chatwoot
```

El endpoint acepta `conversation_created` y `message_created`, verifica sobre
el cuerpo crudo la firma `X-Chatwoot-Signature` y el timestamp contra el
secreto que entrega Chatwoot, ignora cualquier bandeja distinta de
`CHATWOOT_BANDEJA_ID` y usa la llave de servicio sólo en el servidor para
registrar y repartir la conversación. La pantalla consulta
`/api/conversaciones`, que devuelve desde el servidor únicamente las filas
permitidas para la sesión actual.

Variables requeridas:

```dotenv
CHATWOOT_URL=https://chat.antuario.mx
CHATWOOT_TOKEN=...
CHATWOOT_CUENTA_ID=3
CHATWOOT_BANDEJA_ID=4
CHATWOOT_WEBHOOK_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`CHATWOOT_TOKEN` debe pertenecer a un agente técnico dedicado de la cuenta de
avansa, no a un bot ni al usuario personal de un administrador. Todas estas
variables son privadas de servidor.

Al conectar el número definitivo en Meta Developers hay que crear o seleccionar
la bandeja de WhatsApp correspondiente en Chatwoot, actualizar
`CHATWOOT_BANDEJA_ID`, registrar el webhook y verificar un mensaje entrante de
extremo a extremo. El alta y el código de verificación del número se completan
cuando el número esté disponible.

---

## Arquitectura

```text
src/
  app/
    entrar/                 acceso, sin auto-registro
    auth/confirm/           canje del enlace de invitación
    bienvenida/             contraseña y perfil inicial
    (panel)/
      solicitudes/          formulario web
      crm/                   pipeline, lista, ficha y alta manual
      conversaciones/       bandeja de WhatsApp
      marketing/             campañas, métricas, Google y calendario editorial
      finanzas/              movimientos y captura
      reportes/              estado de resultados
      equipo/                roles, acceso e invitaciones
      perfil/                datos personales y avatar
      ajustes/               catálogos, metas y conexiones
    api/
      conversaciones/       lectura filtrada de la bandeja
      webhooks/chatwoot/     entrada autenticada desde Chatwoot
  components/
    ui/                      controles compartidos
    graficas/                visualizaciones SVG
    panel/                   navegación y estructura del panel
  lib/
    supabase/                clientes público, servidor y de servicio
    chatwoot/                cliente privado de Chatwoot
    meta/                    cliente privado de Meta Ads
supabase/
  migrations/               esquema, RLS, RPC y reparto
  templates/invite.html      correo de invitación brandeado
```

### Límites de la llave de servicio

La llave de servicio se usa únicamente en puntos de integración que no tienen
una sesión humana:

- envío de invitaciones desde una acción de servidor;
- recepción del webhook de Chatwoot;
- recepción del formulario público desde el servidor web.

En esos casos sólo se llaman RPC o APIs administrativas de alcance acotado. El
resto del dashboard usa la clave pública, la sesión del usuario y RLS. La llave
de servicio tampoco autoriza a exponer secretos de Chatwoot o Meta al cliente.

---

## Meta Ads

El módulo de Marketing permite captura manual o sincronización de métricas. La
app de Meta debe pertenecer únicamente al portfolio comercial **Somos Avansa**;
su token nunca debe ser personal ni llegar al navegador. Para sincronizar
métricas define en el entorno del servidor:

```dotenv
META_ACCESS_TOKEN=...       # token de sistema con ads_read
META_AD_ACCOUNT_ID=...      # con o sin el prefijo act_
META_API_VERSION=v23.0      # opcional
```

**Sincronizar con Meta** importa impresiones, alcance, clics, gasto y leads por
campaña y día. La escritura es `upsert` sobre campaña y fecha para corregir
cifras posteriores sin duplicarlas.

El **Calendario** permite preparar publicaciones, historias y reels para
Facebook e Instagram, programarlos en horario de México y conservar el archivo
en el bucket privado `avansa-contenido`. Los borradores y su programación sí
quedan registrados desde el panel. La publicación automática no se activa hasta
que la app de Meta tenga los permisos oficiales, los activos de Avansa y un
token técnico de contenido: no se usan tokens personales ni se publica por
error al guardar un borrador.

Para esa última conexión se requieren `META_PAGE_ID`,
`META_INSTAGRAM_ACCOUNT_ID` y un token técnico exclusivo de publicación. Meta
puede exigir verificación del negocio y revisión/advanced access según el
permiso y el formato. Esta restricción es de Meta, no del dashboard. Cuando la
conexión esté aprobada se habilita el publicador; antes de lanzar una campaña o
publicar contenido se revisa el borrador, audiencia y presupuesto en el panel.

## Google Analytics y Search Console

Marketing consulta sólo lectura de la propiedad GA4 y la propiedad de Search
Console configuradas en las variables de entorno. El botón **Conectar Google**
solicita únicamente `analytics.readonly` y `webmasters.readonly`; el refresh
token se cifra como secreto operativo en `integraciones_google`, una tabla sin
acceso desde el navegador. No se incluyen formularios, NSS, teléfonos ni otros
datos personales en estas consultas.

La integración muestra usuarios, sesiones, vistas y actividad en tiempo real
de GA4, además de clics, impresiones, CTR, posición y consultas orgánicas de
Search Console. Google procesa esos datos con distinta latencia: Search Console
no es tiempo real y Meta también puede ajustar sus cifras después del cierre.

---

## Base de datos

Las migraciones viven en `supabase/migrations/`. Las primeras crean el dominio
base; las más recientes endurecen permisos y completan la operación actual:

| Migración | Contenido |
|---|---|
| `0001`–`0009` | Perfiles, CRM, marketing, finanzas, vistas, invitaciones y entrada inicial del sitio. |
| `0010` | Cierre de la superficie de funciones heredadas. |
| `0011` | Bandeja y conversaciones. |
| `20260827211020` | Sólo admin/asesor, invitación obligatoria, perfiles, NSS cifrado, formulario actual, reparto global y RLS por asesor. |
| `20260827221500` | Ajustes posteriores de privilegios, políticas e índices. |
| `20260828012858` | Conexión OAuth de Google, calendario editorial, medios privados y RLS de marketing. |
| `20260828015500` | Índices de las relaciones de las integraciones y el calendario. |

Antes de aplicar migraciones con la CLI, compara el historial local con
`supabase_migrations.schema_migrations`; no renombres ni reapliques versiones
que ya estén registradas en el proyecto remoto.

---

## Ajustes operativos de Supabase

En producción deben quedar configurados:

- la plantilla `supabase/templates/invite.html`, su asunto y el SMTP de avansa;
- la URL del dashboard y sus redirects autorizados;
- confirmación de correo para invitaciones;
- protección contra contraseñas filtradas en Authentication;
- `SUPABASE_SERVICE_ROLE_KEY` sólo en los entornos privados del dashboard y del
  sitio público.

---

## Zona horaria

El despliegue fija `TZ=America/Mexico_City`. Sin esa variable, el proceso puede
arrancar en UTC y una solicitud nocturna en México aparecer con la fecha del día
siguiente; los rangos y comparativos del tablero dependen de esta configuración.
