# IAFE — Administración del Instituto Azteca de Formación Empresarial

> Plataforma web para administrar alumnos, mensualidades, calificaciones y la
> emisión automática de documentos oficiales (constancias, boletas, comprobantes
> y certificados).
>
> **Stack**: HTML + Tailwind-free CSS + JavaScript (ES Modules, sin build) ·
> Supabase (Auth + Postgres + Storage + RLS) · jsPDF · GitHub Pages.

🔗 **Demo en vivo**: [institutoazteca.github.io](https://institutoazteca.github.io/InstitutoAztecaDeFormacionEmpresarial/)

---

## ✨ Características

| Módulo | Qué resuelve |
|---|---|
| **Panel** | Ingresos del mes, cartera vencida, matrícula por nivel y gráfica de 12 meses. Vista diferenciada para maestra. |
| **Alumnos** | Alta y edición de expedientes, búsqueda, filtros por nivel y estado, ficha completa por alumno. |
| **Documentos** | Subida de PDFs por alumno (INE, acta, CURP, comprobante de domicilio) a un bucket privado con URLs firmadas. |
| **Mensualidades** | Matriz alumno × mes con registro de pago (importe, método, referencia), adeudos y exportación CSV/PDF. |
| **Inscripciones y bajas** | Alta por ciclo, reinscripción y expediente de baja con adeudo final. |
| **Calificaciones** | Captura por grupo, materia y periodo (Parcial 1–3 y Final), escala 0–10, promedio automático. |
| **Documentos oficiales** | Constancia de estudios, constancia de inscripción, boleta de calificaciones, comprobante de pago y certificado de conclusión, generados con membrete y folio oficial. |
| **Estadísticas** | Ingresos mensuales, eficiencia de cobranza, distribución por nivel y tendencia. |
| **Usuarios** | Alta de cuentas (administrador / maestra), cambio de rol, activación y restablecimiento de contraseña. |
| **Configuración** | Datos de la dependencia, datos bancarios, ciclo activo, montos por nivel, grupos y **textos de las plantillas**. |

---

## 🔐 Roles

| Rol | Puede |
|---|---|
| **Administrador** | Todo: alumnos, pagos, constancias, bajas, usuarios, configuración y estadísticas. |
| **Maestra** | Consultar alumnos y **capturar calificaciones**. Sin acceso a pagos, constancias ni configuración. |

La seguridad se aplica **en la base de datos** con RLS: el rol se lee de
`iafe_personal` y cada política comprueba si quien consulta es personal
activo y de qué tipo. Ocultar un botón en la interfaz nunca es la única
protección.

---

## 🧰 Stack

| Capa | Tecnología |
|---|---|
| UI | HTML + CSS propio (`css/app.css`), sin framework |
| JS | Vanilla ES Modules, sin build step |
| Datos | Supabase Postgres + RLS + Realtime |
| Auth | Supabase Auth + Edge Function `iafe-personal` |
| Archivos | Supabase Storage (bucket privado `iafe-documentos`) |
| PDF | jsPDF + jsPDF-AutoTable (generación en el navegador) |
| Hosting | GitHub Pages (Actions) |

---

## 🚀 Puesta en marcha

### 1. Servir localmente

```bash
npx serve .
# o
python -m http.server 8080
```

Abre `http://localhost:8080`.

> ⚠️ Usa un servidor HTTP, **no** abras `index.html` con doble clic: los módulos
> ES y el SDK de Supabase necesitan un origen HTTP.

### 2. Crear la primera cuenta de administrador

Al abrir la aplicación por primera vez aparece el botón
**“Configurar cuenta de administrador”**. Necesitas el **código de arranque**:

```
IAFE-BOOT-89297EE72797
```

> El código vive en `iafe_configuracion → codigo_bootstrap`. Cámbialo en
> *Configuración → Institución* cuando la plataforma esté en producción.

La cuenta creada queda con rol **Administrador**. Desde *Usuarios* el
administrador puede crear cuentas de maestra con una contraseña temporal.

### 3. Datos iniciales

| Dato | Dónde |
|---|---|
| Nombre de la dependencia, RFC, domicilio, director | *Configuración → Institución* |
| Banco, CLABE y titular | *Configuración → Institución → Cobranza* |
| Mensualidad y cuota de inscripción | *Configuración → Niveles* |
| Grupos y docentes | *Configuración → Grupos* |
| Ciclo escolar activo | *Configuración → Institución → Ciclo escolar* |
| Texto de las constancias | *Configuración → Plantillas* |

---

## 📄 Plantillas de documentos

El cuerpo de cada documento se edita en *Configuración → Plantillas* y se
completa con marcadores:

```
{nombre_completo}  {codigo}  {curp}  {nivel}  {grupo}  {ciclo}
{promedio}  {fecha_inscripcion}  {fecha_emision}  {folio}
```

El membrete (logotipo, datos de la dependencia, folio, firma y pie) se arma
automáticamente. Cada emisión genera un PDF que se archiva en Storage y queda
listo en el expediente del alumno.

---

## 🗄️ Modelo de datos (esquema `public`, tablas `iafe_*`)

| Tabla | Contenido |
|---|---|
| `iafe_personal` | Cuentas del equipo: nombre, correo, `rol`, `activo`. |
| `iafe_niveles` | Programas: clave, nombre, mensualidad, cuota, día límite de pago. |
| `iafe_grupos` | Secciones por nivel, ciclo y docente. |
| `iafe_alumnos` | Expediente: matrícula, nombre, CURP, contacto, tutor, nivel, grupo, estado. |
| `iafe_inscripciones` | Altas y reingresos por ciclo con su monto. |
| `iafe_mensualidades` | Cobros: año, mes, concepto, monto, estado, fecha, método, referencia, folio. |
| `iafe_calificaciones` | Notas por alumno, materia y periodo (0–10). |
| `iafe_documentos_alumno` | PDFs subidos por alumno con su ruta en Storage. |
| `iafe_constancias` | Documentos emitidos: folio, tipo, snapshot de datos, PDF archivado. |
| `iafe_bajas` | Expediente de baja: fecha, tipo, motivo, adeudo final. |
| `iafe_configuracion` | Datos oficiales, plantillas, ciclo, montos y códigos. |
| `iafe_folios` | Contador oficial por tipo de documento y año. |

Funciones auxiliares en el esquema `private` (**no** expuesto en la Data API):
`rol_actual()`, `es_admin()`, `es_personal()`. Y en `public`, expuesta por RPC:
`iafe_siguiente_folio(text)` — sólo la puede invocar un administrador.

---

## 🔐 Edge Function `iafe-personal`

Permite dar de alta cuentas sin exponer la clave `service_role` y sin depender
de servidor de correo.

| Acción | Quién puede llamarla |
|---|---|
| `status` | Público (indica si ya existe un administrador). |
| `bootstrap-admin` | Público, sólo mientras no exista un administrador y con el código de arranque. |
| `create-user` | Administrador autenticado. |
| `reset-password` | Administrador autenticado. |
| `set-active` / `set-role` | Administrador autenticado. |

Código fuente: [`supabase/functions/iafe-personal/index.ts`](supabase/functions/iafe-personal/index.ts).

Para redesplegarla:

```bash
npx supabase functions deploy iafe-personal --project-ref bnonygghcgbqznikbvqt
```

---

## 🗂️ Estructura

```
.
├── index.html                      # Shell: acceso + panel
├── css/app.css                     # Sistema visual (tokens, componentes)
├── js/
│   ├── app.js                      # Router hash, sesión, navegación
│   ├── config.js                   # Proyecto Supabase y constantes
│   ├── state.js                    # Estado global
│   ├── supabase-client.js
│   ├── services/                   # auth, db, alumnos, pagos, calificaciones,
│   │                               # documentos, constancias, reportes, configuración
│   ├── utils/                      # ui (avisos, modales, iconos), dates
│   └── views/                      # panel, alumnos, ficha, pagos, calificaciones,
│                                   # documentos, estadisticas, usuarios, configuración
├── db/migrations/                  # SQL versionado de la base
├── supabase/functions/iafe-personal/
├── tools/                          # Scripts de apoyo
└── .github/workflows/deploy.yml    # Publicación en GitHub Pages
```

---

## 🛠️ Comandos

| Acción | Comando |
|---|---|
| Servir en local | `npx serve .` |
| Aplicar migraciones | `npx supabase db push` (o pegar el SQL en el editor) |
| Redesplegar la función | `npx supabase functions deploy iafe-personal` |
| Ver advisors de seguridad | `npx supabase db advisors` |
| Publicar | `git push origin main` (Actions despliega) |

---

## 🔐 Notas de seguridad

- La clave publicable (`sb_publishable_…`) es pública por diseño: la
  protección vive en las políticas RLS, no en la clave.
- La clave `service_role` **nunca** va en el cliente; sólo la usa la Edge
  Function, en el servidor.
- `admin.security_definer_function_executable` aparece como aviso del linter
  para `iafe_siguiente_folio` e `iafe_registrar_personal`: es intencional, ambas
  verifican el rol de quien llama antes de ejecutar.

---

## 📜 Licencia

Uso interno del Instituto Azteca de Formación Empresarial.
