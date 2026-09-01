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

### Recuperación de contraseña

1. Desde `/entrar`, la persona abre `/recuperar-contrasena` y solicita el correo.
2. La plantilla `supabase/templates/recovery.html` envía `TokenHash` al callback
   SSR `/auth/confirm`, que crea la cookie y redirige a
   `/restablecer-contrasena`.
3. La persona elige una contraseña nueva sin cambiar su UUID, perfil, leads ni
   posición en el reparto.

Las plantillas brandeadas están en `supabase/templates/` y se deben copiar en
su sección correspondiente de **Supabase → Authentication → Email Templates**.
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

La opción preferida verifica sobre el cuerpo crudo `X-Chatwoot-Signature` y
`X-Chatwoot-Timestamp` contra el secreto del webhook. Para instalaciones
Chatwoot 4.11.x donde esos encabezados no sean verificables, registra la misma
ruta con el secreto compartido como query param (codificado para URL):

```text
https://dashboard.somosavansa.com/api/webhooks/chatwoot?secret=<CHATWOOT_WEBHOOK_SECRET_URL_ENCODED>
```

Ese modo es sólo de compatibilidad: la URL debe usar HTTPS, no debe pegarse en
tickets ni logs y debe reemplazarse por HMAC cuando se confirme una versión sin
el desajuste. La comparación del query param es constante. En ambos modos, el
endpoint acepta únicamente `conversation_created` y `message_created`, ignora
cualquier cuenta o bandeja distinta de `CHATWOOT_CUENTA_ID` y
`CHATWOOT_BANDEJA_ID`, y usa la llave de servicio sólo en el servidor para
registrar y repartir la conversación. La pantalla consulta
`/api/conversaciones`, que devuelve desde el servidor únicamente las filas
permitidas para la sesión actual.

Variables requeridas:

```dotenv
CHATWOOT_URL=https://chat.antuario.mx
CHATWOOT_TOKEN=...
CHATWOOT_CUENTA_ID=3
CHATWOOT_BANDEJA_ID=5
CHATWOOT_WEBHOOK_SECRET=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`CHATWOOT_TOKEN` debe pertenecer a un agente técnico dedicado de la cuenta de
avansa, no a un bot ni al usuario personal de un administrador. Todas estas
variables son privadas de servidor.

Con esas mismas variables, `/rendimiento` consulta los endpoints oficiales de
resumen, series, agrupación por agente y `reporting_events`. El resumen y las
series quedan limitados a `CHATWOOT_BANDEJA_ID`. Los eventos sólo se atribuyen
a un asesor después de cruzarlos con una conversación visible por RLS y un
mensaje firmado desde el dashboard. El agrupado por agente de Chatwoot tiene
alcance de cuenta y por eso aparece únicamente a administradores, rotulado
como identidad técnica y separado del ranking comercial.

La bandeja 5 corresponde al número oficial de Avansa en WhatsApp Cloud API. Al
rotar el número o recrear la bandeja se debe actualizar `CHATWOOT_BANDEJA_ID`,
el webhook de cuenta y volver a verificar un mensaje de extremo a extremo.

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
META_API_VERSION=v26.0      # opcional; version fijada y revisable
```

**Sincronizar con Meta** importa impresiones, alcance, clics, gasto y leads por
campaña y día. La escritura es `upsert` sobre campaña y fecha para corregir
cifras posteriores sin duplicarlas.

El **Calendario** prepara publicaciones, historias y reels, los programa en
hora de México y conserva su archivo en el bucket privado
`avansa-contenido`. Guardar o elegir una fecha no publica: cada salida requiere
que un administrador marque **Autorizar envío automático** después de subir el
archivo. Las filas antiguas quedan sin autorización aunque después se conecten
credenciales.

Supabase Cron revisa cada cinco minutos únicamente piezas vencidas y
autorizadas. La URL y el bearer del endpoint viven cifrados en Vault; esto evita
la restricción diaria de Vercel Hobby. La cola usa un lease en Postgres para que
dos ejecuciones no reclamen la misma fila, conserva por plataforma el
contenedor o ID externo y no reintenta automáticamente una mutación cuyo
resultado sea ambiguo. En ese caso muestra **Revisar** para confirmar primero
en Meta y evitar duplicados.

Formatos habilitados de manera deliberada:

- Facebook: publicación de texto o una imagen JPG/PNG, y un reel MP4/MOV.
- Instagram: una imagen JPG en feed, un reel MP4/MOV o una historia JPG/MP4/MOV.
- Las historias de Instagram requieren cuenta Business. Las historias de
  Facebook y los carruseles se guardan como planeación, pero este publicador no
  los envía mientras no exista un flujo oficial implementado y probado.

Los endpoints y límites de formato se contrastaron con las colecciones
oficiales de Meta para [Facebook](https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api)
e [Instagram](https://www.postman.com/meta/instagram/documentation/6yqw8pt/instagram-api).

La conexión usa `META_PAGE_ID`, `META_INSTAGRAM_ACCOUNT_ID` y
`META_CONTENT_ACCESS_TOKEN`, un token técnico separado de Ads. Puede ser el
token permanente de un System User al que se asignaron la Page y la cuenta de
Instagram, con `pages_read_engagement`, `pages_manage_posts`,
`instagram_basic` e `instagram_content_publish`; si se obtiene mediante
Facebook Login también se usa `pages_show_list` para descubrir los activos. La
identidad necesita la tarea de Page para crear contenido. Meta puede exigir
verificación del negocio, modo Live y revisión/Advanced Access según quién use
la app.

`CRON_SECRET` protege `/api/cron/publicar-contenido`. Supabase Vault guarda
el mismo valor como `avansa_publicador_cron_secret`, y
`avansa_publicador_url` contiene la URL de producción. La migración programa
la invocación con `pg_cron` y `pg_net` si ambos secretos ya existen; si todavía
faltan, termina sin bloquear el despliegue y deja el cron apagado. Después de
guardarlos en Vault ejecuta desde SQL Editor:

```sql
select private.configurar_cron_publicacion_social();
```

El resultado debe ser `true`. Ningún secreto queda escrito en `cron.job` y los
`request_id`, códigos HTTP y timeouts quedan 90 días en
`private.solicitudes_publicador_cron`, sin URL, headers ni cuerpo. El medio
sigue privado: el servidor entrega a Meta una URL firmada de seis horas y nunca
expone el token al navegador.

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
| `20260828025916` | Aprobación explícita, lease e intentos idempotentes de la cola social. |
| `20260828034800` | Ejecución cada cinco minutos con Supabase Cron y secretos en Vault. |
| `20260828050000` | Fencing, RLS reproducible, aprobación versionada y cron observable/tolerante. |
| `20260828053000` | Invalida la aprobación si se elimina al usuario que autorizó la pieza. |

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
