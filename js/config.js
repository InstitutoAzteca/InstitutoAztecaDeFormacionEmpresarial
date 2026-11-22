// config.js — parámetros del proyecto Supabase y constantes de la plataforma.

export const SUPABASE_URL = 'https://bnonygghcgbqznikbvqt.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_fVL5ogmknjYQs7tGlczZPw_yN-diQ66';

export const EDGE_FUNCTIONS = `${SUPABASE_URL}/functions/v1/iafe-personal`;
export const BUCKET = 'iafe-documentos';

export const TABLAS = Object.freeze({
  personal: 'iafe_personal',
  niveles: 'iafe_niveles',
  grupos: 'iafe_grupos',
  alumnos: 'iafe_alumnos',
  inscripciones: 'iafe_inscripciones',
  mensualidades: 'iafe_mensualidades',
  calificaciones: 'iafe_calificaciones',
  documentos: 'iafe_documentos_alumno',
  constancias: 'iafe_constancias',
  bajas: 'iafe_bajas',
  configuracion: 'iafe_configuracion',
  folios: 'iafe_folios',
});

export const ROL = Object.freeze({
  ADMIN: 'administrador',
  MAESTRA: 'maestra',
});

export const ETIQUETA_ROL = Object.freeze({
  administrador: 'Administrador',
  maestra: 'Maestra',
});

export const TIPOS_DOCUMENTO = Object.freeze({
  estudios: 'Constancia de estudios',
  inscripcion: 'Constancia de inscripción',
  boleta: 'Boleta de calificaciones',
  comprobante: 'Comprobante de pago',
  certificado: 'Certificado de conclusión',
});

export const TIPOS_ARCHIVO = Object.freeze({
  ine: 'Identificación oficial (INE)',
  acta: 'Acta de nacimiento',
  curp: 'Constancia de CURP',
  domicilio: 'Comprobante de domicilio',
  titulo: 'Título o certificado de estudios previos',
  otro: 'Otro documento',
});

export const PERIODOS = Object.freeze([
  { valor: 'parcial_1', etiqueta: 'Parcial 1' },
  { valor: 'parcial_2', etiqueta: 'Parcial 2' },
  { valor: 'parcial_3', etiqueta: 'Parcial 3' },
  { valor: 'final', etiqueta: 'Final' },
]);

export const METODOS_PAGO = Object.freeze([
  { valor: 'efectivo', etiqueta: 'Efectivo' },
  { valor: 'transferencia', etiqueta: 'Transferencia' },
  { valor: 'tarjeta', etiqueta: 'Tarjeta' },
  { valor: 'otro', etiqueta: 'Otro' },
]);

export const CONCEPTOS = Object.freeze([
  { valor: 'mensualidad', etiqueta: 'Mensualidad' },
  { valor: 'inscripcion', etiqueta: 'Inscripción' },
  { valor: 'materiales', etiqueta: 'Materiales' },
  { valor: 'otros', etiqueta: 'Otros' },
]);
