# avansa · Sistema Integral

Sistema interno de **avansa · Gestión Patrimonial**: CRM de expedientes,
desempeño de la pauta de Meta y panel financiero, sobre una sola base de datos
compartida con el sitio público.

> **Aviso permanente.** El trámite ante Infonavit es gratuito y cualquier
> persona puede realizarlo por su cuenta. avansa es una empresa privada e
> independiente de acompañamiento y gestión documental: no es Infonavit, no
> forma parte del Gobierno y no sustituye sus canales oficiales.

---

## Qué resuelve

Cuatro cosas que normalmente viven en cuatro herramientas distintas, aquí
conectadas por los mismos datos:

| Módulo | Qué hace |
|---|---|
| **Solicitudes** | Bandeja de lo que llega del formulario de somosavansa.com. Un clic la convierte en expediente. |
| **CRM** | Pipeline de siete etapas con clasificación A/B/C/D, expediente documental y bitácora de cada contacto. |
| **Marketing** | Campañas de Meta con su métrica diaria; costo por solicitud calculado contra el CRM, no contra lo que reporta la plataforma. |
| **Finanzas** | Ingresos y egresos con plan de cuentas, y la cascada completa: margen bruto → EBITDA → utilidad neta. |

La conexión entre módulos es el punto: un ingreso se liga al expediente que lo
generó, un expediente a la campaña que lo trajo, y la campaña a lo que costó.
Por eso el sistema puede responder *cuánto costó traer al cliente que dejó este
margen*, que es la pregunta que ninguna de las cuatro herramientas por separado
contesta.

---

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # y llena NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3100
```

La primera persona que se registre queda como **administradora**. A partir de
ahí, el alta es sólo por invitación desde el módulo de Equipo.

---

## Arquitectura

```
src/
  app/
    entrar/            acceso y alta de la primera cuenta
    (panel)/           todo lo que exige sesión
      page.tsx           Resumen
      solicitudes/       bandeja del sitio web
      crm/               tablero, lista, ficha y alta manual
      marketing/         campañas y métricas de Meta
      finanzas/          movimientos y captura
      reportes/          estado de resultados
      equipo/            personas, roles e invitaciones
      ajustes/           plan de cuentas, metas y conexiones
  components/
    ui/                tarjetas, campos, tabla, insignias, iconos
    graficas/           línea, barras, dona, embudo y cascada — SVG puro
    panel/             barra lateral, encabezado, selector de periodo
  lib/
    finanzas.ts        la cascada del estado de resultados
    constantes.ts      etapas, clasificaciones, roles, plan de cuentas
    periodo.ts         rangos y su comparativo
    formato.ts         dinero, fechas y porcentajes en es-MX
    datos.ts           consultas compartidas
    meta/insights.ts   cliente de la Marketing API de Meta
  proxy.ts             refresca la sesión y cierra el panel
supabase/migrations/   el esquema, en orden
```

### Decisiones que conviene conocer

**Las gráficas no usan librería.** Son SVG generado en el servidor. Pesan lo
que pesan sus datos, se pintan con el primer HTML y heredan la paleta de la
marca sin pelearse con los temas de nadie. El *tooltip* es un `<title>` nativo:
lo lee también un lector de pantalla.

**La cascada financiera se define una sola vez**, en `lib/finanzas.ts`. El
tablero, el módulo de finanzas y el reporte llaman a la misma función. La vista
`v_estado_resultados_mensual` de Postgres es su espejo en SQL para
exportaciones y auditoría — pero la aplicación nunca la usa para pintar, para
que no puedan existir dos verdades sobre el mismo mes.

**La depreciación va debajo del EBITDA.** No es salida de efectivo, y sumarla
arriba haría que el EBITDA dejara de ser EBITDA.

**El embudo se calcula con `etapa_maxima`, no con la etapa actual.** Un
expediente descartado salió en algún punto del recorrido; si se cuenta sólo por
etapa actual, esa caída desaparece y salen conversiones mayores al 100 %.

**La autorización vive en la base, no en la interfaz.** El panel usa la clave
pública y la sesión de cada persona: todo lo que puede leer o escribir lo
deciden las políticas RLS. Ocultar un módulo del menú es cosmética; lo que de
verdad cierra la puerta es que Finanzas devuelva cero filas a un asesor.

**El panel no usa `service_role`.** Ni el sitio tampoco: escribe a través de
`registrar_lead`, una función que valida y escribe exactamente una fila. Una
llave que puede leer y borrar la base entera no tiene nada que hacer en un
servidor expuesto a internet.

---

## Roles

| Rol | Alcance |
|---|---|
| **Administrador** | Todo, incluidas finanzas y la administración del equipo. |
| **Asesor** | CRM, expedientes y solicitudes. No ve finanzas. |
| **Marketing** | Campañas y métricas de pauta. No ve finanzas. |
| **Finanzas** | Movimientos, estado de resultados y catálogos. |

El rol se cambia desde **Equipo**, y el cambio surte efecto en la base
inmediatamente. Nadie puede ascenderse a sí mismo: un trigger lo impide.

---

## Alta de personas

El panel no puede crear usuarios de autenticación —eso exige la clave de
servicio— así que el flujo es por invitación:

1. Un administrador captura el correo y el rol en **Equipo → Invitar**.
2. Esa persona entra a la pantalla de acceso y elige *Crear mi cuenta*.
3. El trigger de la base lee la invitación, le asigna el rol y la marca usada.

Sin invitación vigente, el alta se rechaza **en la base**, no en el formulario.

---

## Conexión con el sitio público

El sitio (`../web`) y este panel comparten proyecto de Supabase. El formulario
del sitio llama a `registrar_lead`, que escribe en `public.leads`; la solicitud
aparece en la bandeja del panel en segundos. Para que funcione, el sitio sólo
necesita:

```
NEXT_PUBLIC_SUPABASE_URL=https://vbvycgwxhsoaqionyrgc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Conexión con Meta Ads

El módulo de Marketing funciona desde el día uno con captura manual. Para que
se sincronice solo, define en el entorno del despliegue:

```
META_ACCESS_TOKEN=...        # token de sistema con ads_read
META_AD_ACCOUNT_ID=...       # con o sin el prefijo act_
META_API_VERSION=v23.0       # opcional
```

Con eso, el botón **Sincronizar con Meta** trae impresiones, alcance, clics,
gasto y leads por campaña y día. La escritura es *upsert* sobre
`(campaña, fecha)`: reimportar un rango corrige los datos en vez de
duplicarlos, que es justo lo que hace falta cuando Meta ajusta cifras con un
día de retraso.

---

## Base de datos

Las migraciones están en `supabase/migrations/`, numeradas y en orden. Se
aplican desde el SQL Editor de Supabase o con `supabase db push`.

| Archivo | Contenido |
|---|---|
| `0001` | Perfiles, roles y helpers de autorización |
| `0002` | Leads, actividades y expediente documental |
| `0003` | Campañas y métricas de pauta |
| `0004` | Plan de cuentas, movimientos y metas |
| `0005` | Vistas de tablero y estado de resultados |
| `0006` | Catálogo inicial de cuentas |
| `0007` | Invitaciones |
| `0008` | `etapa_maxima` y vista del embudo |
| `0009` | `registrar_lead`, la puerta del sitio público |

### Datos de demostración

El sistema viene con expedientes, campañas y movimientos de ejemplo para poder
recorrerlo con contenido. Todos llevan `es_demo = true`. Se borran de un golpe
desde **Ajustes → Datos de demostración**; lo que capture el equipo nunca lleva
esa marca, así que ese botón no puede llevarse datos reales por delante.

---

## Pendientes que no puedo dejar hechos

Dos ajustes viven en la consola de Supabase y necesitan tu sesión:

1. **Protección contra contraseñas filtradas.** *Authentication → Policies →
   Password protection*. Supabase compara la contraseña contra la base de
   HaveIBeenPwned y rechaza las que ya se filtraron. Un panel con datos
   personales debería tenerla encendida.
2. **Confirmación de correo.** Si está activa, cada persona invitada tiene que
   abrir el correo antes de poder entrar. Es lo recomendable; sólo conviene
   revisar que los correos salgan (Supabase trae un remitente de pruebas con
   límite bajo — para operar de verdad hay que configurar un SMTP propio).

---

## Zona horaria

El despliegue fija `TZ=America/Mexico_City`. Sin eso, el contenedor arranca en
UTC y una solicitud recibida a las 20:00 en México aparece con fecha del día
siguiente. Todo el cálculo de rangos y comparativos depende de esto.
