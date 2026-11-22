# IAFE Administración — TODO

> **Stack**: HTML + CSS propio + Vanilla ES Modules + Supabase (Auth/Postgres/Storage/RLS) + jsPDF
> **Deploy**: GitHub Pages (Actions)
> **Supabase**: `bnonygghcgbqznikbvqt`

---

## 📁 Fase 0 — Base del proyecto
- [x] Estructura de carpetas (`js/views`, `js/services`, `js/utils`, `db/migrations`, `supabase/functions`)
- [x] `index.html` con shell de acceso + panel y router por hash
- [x] Sistema visual en `css/app.css` (tokens IAFE: azul institucional + oro)
- [x] `js/config.js` con URL y clave publicable de Supabase
- [x] `js/supabase-client.js` con sesión persistente

## 🔥 Fase 1 — Base de datos
- [x] `001_schema.sql`: 12 tablas `iafe_*` con índices y restricciones
- [x] `002_rls.sql`: helpers `private.*`, políticas por rol, función de folios
- [x] `003_storage.sql`: bucket privado `iafe-documentos` + políticas
- [x] `004_bootstrap.sql`: código de arranque de la primera cuenta
- [x] Migraciones aplicadas vía MCP y verificadas (`list_tables`, advisors)

## 🔐 Fase 2 — Cuentas y roles
- [x] Edge Function `iafe-personal` (status, bootstrap, create-user, reset-password, set-active, set-role)
- [x] Formulario de acceso con visibilidad de contraseña
- [x] Arranque de la primera cuenta de administrador
- [x] Pantalla *Usuarios*: alta, rol, activación y contraseña

## 👥 Fase 3 — Alumnos
- [x] Listado con búsqueda, filtros por nivel y estado
- [x] Alta y edición de expediente
- [x] Ficha del alumno con pestañas (datos, documentos, pagos, calificaciones, oficiales)
- [x] Baja con adeudo final y reingreso
- [x] Matrícula automática por nivel

## 📁 Fase 4 — Documentos
- [x] Subida de PDFs por alumno a Storage (validación de tipo y tamaño)
- [x] Enlaces firmados para descarga
- [x] Eliminación de archivo + registro

## 💰 Fase 5 — Mensualidades
- [x] Matriz alumno × mes con estado por periodo
- [x] Registro de pago (monto, método, fecha, referencia)
- [x] Estados: pagada, pendiente, becado, condonado
- [x] Exportación CSV y PDF

## 📊 Fase 6 — Calificaciones
- [x] Captura por grupo, materia y periodo
- [x] Guardado automático de la nota
- [x] Promedio por materia y general, estado aprobado/reprobado

## 📜 Fase 7 — Documentos oficiales
- [x] Membrete con logotipo, datos y folio
- [x] Constancia de estudios
- [x] Constancia de inscripción
- [x] Boleta de calificaciones (AutoTable)
- [x] Comprobante de pago
- [x] Certificado de conclusión
- [x] Archivo en Storage + expediente del alumno
- [x] Plantillas editables con marcadores

## 📈 Fase 8 — Panel y estadísticas
- [x] KPIs del panel (admin y maestra)
- [x] Gráfica de recaudado vs. esperado
- [x] Cartera con mensualidad pendiente
- [x] Distribución por nivel, tendencia y detalle mensual

## ⚙️ Fase 9 — Configuración
- [x] Datos de la dependencia y datos bancarios
- [x] Ciclo activo y escala mínima
- [x] Niveles (mensualidad, cuota, día límite)
- [x] Grupos (nivel, docente, ciclo, horario)
- [x] Plantillas de los documentos oficiales

## 🚀 Fase 10 — Publicación
- [x] Workflow de GitHub Pages
- [x] README con instrucciones
- [ ] Verificar el despliegue en producción
- [ ] Revisión visual en móvil

---

## 📌 Decisiones de negocio
- Escala de calificación: **0–10**, mínima aprobatoria **6** (configurable).
- El pago se registra internamente; la transferencia se referencia con la CLABE
  que aparece en Configuración (no hay pasarela en línea).
- La constancia exige **folio oficial** con formato `IAFE-<TIPO>-<AÑO>-<CONSECUTIVO>`.
- El documento se archiva en Storage y queda registrado en `iafe_constancias`.
- Un alumno con **baja** conserva su historial; deja de contar como matrícula activa.
