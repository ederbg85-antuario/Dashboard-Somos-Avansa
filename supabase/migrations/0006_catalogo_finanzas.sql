-- ============================================================
-- avansa · Sistema Integral — 0006 · plan de cuentas
-- ============================================================
-- Catálogo real de operación, no datos de prueba. Está pensado para el
-- negocio de avansa: gestión documental del Crédito Mejoravit. Se puede
-- editar desde Configuración; esta migración sólo siembra el arranque.
-- ============================================================

insert into public.categorias_finanzas (nombre, tipo, naturaleza, color, descripcion, orden) values
  -- ingresos
  ('Honorarios de gestión',        'ingreso', 'ingreso', '#2FB6A3', 'Cobro por integrar y acompañar el expediente.', 10),
  ('Diagnóstico y asesoría',       'ingreso', 'ingreso', '#2FB6A3', 'Servicios de diagnóstico y clasificación.', 20),
  ('Trámites complementarios',     'ingreso', 'ingreso', '#2FB6A3', 'Cadena de actas, regularización, apoyo notarial.', 30),
  ('Otros ingresos',               'ingreso', 'ingreso', '#2FB6A3', 'Ingresos que no corresponden al servicio principal.', 40),

  -- costo directo del servicio (afecta el margen bruto)
  ('Comisiones a asesores',        'egreso', 'costo_directo', '#FF4D6D', 'Comisión variable por expediente cerrado.', 100),
  ('Gestoría y trámites externos', 'egreso', 'costo_directo', '#FF4D6D', 'Notaría, actas, certificados pagados por expediente.', 110),
  ('Mensajería y traslados',       'egreso', 'costo_directo', '#FF4D6D', 'Envíos y visitas ligados a un expediente.', 120),
  ('Papelería de expedientes',     'egreso', 'costo_directo', '#FF4D6D', 'Impresión, copias y carpetas del expediente.', 130),

  -- marketing
  ('Pauta Meta Ads',               'egreso', 'gasto_marketing', '#E63A58', 'Inversión publicitaria en Facebook e Instagram.', 200),
  ('Producción de contenido',      'egreso', 'gasto_marketing', '#E63A58', 'Fotografía, video, diseño y locución.', 210),
  ('Herramientas de marketing',    'egreso', 'gasto_marketing', '#E63A58', 'Suscripciones de creación, edición y medición.', 220),

  -- operación
  ('Sueldos de operación',         'egreso', 'gasto_operativo', '#0F2D3D', 'Nómina del equipo de asesoría y expedientes.', 300),
  ('Telefonía e internet',         'egreso', 'gasto_operativo', '#0F2D3D', 'Líneas, datos y conectividad.', 310),
  ('Software y suscripciones',     'egreso', 'gasto_operativo', '#0F2D3D', 'CRM, hospedaje, correo y respaldos.', 320),
  ('Capacitación',                 'egreso', 'gasto_operativo', '#0F2D3D', 'Formación del equipo.', 330),

  -- administración
  ('Renta de oficina',             'egreso', 'gasto_administrativo', '#6B7785', 'Arrendamiento y mantenimiento del inmueble.', 400),
  ('Servicios e insumos',          'egreso', 'gasto_administrativo', '#6B7785', 'Luz, agua, limpieza y consumibles.', 410),
  ('Contabilidad y legal',         'egreso', 'gasto_administrativo', '#6B7785', 'Despacho contable y asesoría jurídica.', 420),
  ('Sueldos administrativos',      'egreso', 'gasto_administrativo', '#6B7785', 'Nómina de dirección y administración.', 430),

  -- por debajo del EBITDA
  ('Depreciación de equipo',       'egreso', 'depreciacion', '#D9AE83', 'Equipo de cómputo, mobiliario y vehículos.', 500),
  ('Comisiones bancarias',         'egreso', 'financiero', '#D9AE83', 'Comisiones, terminal punto de venta y transferencias.', 510),
  ('Intereses de financiamiento',  'egreso', 'financiero', '#D9AE83', 'Costo financiero de créditos o arrendamientos.', 520),
  ('ISR y provisiones',            'egreso', 'impuestos', '#D9AE83', 'Impuesto sobre la renta y provisiones fiscales.', 530),
  ('Impuestos sobre nómina',       'egreso', 'impuestos', '#D9AE83', 'Contribuciones estatales sobre nómina.', 540)
on conflict (nombre) do nothing;
