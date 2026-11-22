#!/usr/bin/env node
/**
 * Semilla de demostración para IAFE Administración.
 *
 * Carga datos de ejemplo (alumnos, grupos, pagos y calificaciones) para poder
 * explorar la plataforma antes de capturar datos reales.
 *
 * Uso:
 *   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=eyJ... node tools/semilla-demo.mjs
 *
 * Para borrar la demostración:
 *   node tools/semilla-demo.mjs --limpiar
 */

const url = process.env.SUPABASE_URL ?? 'https://bnonygghcgbqznikbvqt.supabase.co';
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!clave) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY (es la clave service_role del proyecto).');
  process.exit(1);
}

const encabezados = {
  apikey: clave,
  Authorization: `Bearer ${clave}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=representation',
};

async function pedir(metodo, ruta, cuerpo) {
  const respuesta = await fetch(`${url}/rest/v1/${ruta}`, {
    method: metodo,
    headers: encabezados,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${metodo} ${ruta} → ${respuesta.status}: ${texto}`);
  return texto ? JSON.parse(texto) : null;
}

const ALUMNOS = [
  { nombre: 'Ximena', apellidos: 'Cortés Ramírez', curp: 'CORX120405MDFRMA07', telefono: '5512345678', email: 'ximena.cortes@example.com', nivel: 'bachillerato', grupo: 'Bachillerato A', mensualidad: 950, paid: 3, pending: 1 },
  { nombre: 'Diego', apellidos: 'Fuentes Hernández', curp: 'FUE D950210HDFRDA03'.replace(' ', ''), telefono: '5598765432', email: 'diego.fuentes@example.com', nivel: 'bachillerato', grupo: 'Bachillerato A', mensualidad: 950, paid: 4, pending: 0 },
  { nombre: 'Alondra', apellidos: 'Mendoza Ríos', curp: 'MEN A080911MDFRRS02'.replace(' ', ''), telefono: '5544556677', email: 'alondra.mendoza@example.com', nivel: 'secundaria', grupo: 'Secundaria A', mensualidad: 780, paid: 2, pending: 2 },
  { nombre: 'Mateo', apellidos: 'Salazar Fuentes', curp: 'SALF110320HDFRNT05', telefono: '5533221144', email: 'mateo.salazar@example.com', nivel: 'licenciatura', grupo: 'Licenciatura A', mensualidad: 1400, paid: 1, pending: 3 },
];

const MATERIAS = [
  'Matemáticas',
  'Español',
  'Historia',
  'Ciencias',
  'Computación',
];

async function limpiar() {
  console.log('Limpiando datos de demostración…');
  // PostgREST usa `*` como comodín en el filtro `like`.
  await pedir('DELETE', 'iafe_calificaciones?alumno_id=not.is.null');
  await pedir('DELETE', 'iafe_mensualidades?alumno_id=not.is.null');
  await pedir('DELETE', 'iafe_inscripciones?alumno_id=not.is.null');
  await pedir('DELETE', 'iafe_documentos_alumno?alumno_id=not.is.null');
  await pedir('DELETE', 'iafe_alumnos?codigo=like.*DEMO*');
  await pedir('DELETE', 'iafe_grupos?nombre=like.*DEMO*');
  console.log('Listo.');
}

async function sembrar() {
  console.log('Cargando datos de demostración…');

  // Configuración institucional
  const configuracion = [
    ['ciclo_activo', '2026-A'],
    ['institucion_direccion', 'Av. Teotihuacán 24, Col. Centro, Teotihuacán, Edo. Méx.'],
    ['institucion_telefono', '55 1234 5678'],
    ['institucion_email', 'contacto@institutoazteca.edu.mx'],
    ['institucion_rfc', 'IAFE240101XYZ'],
    ['director_nombre', 'Prof. Hugo Salazar Macías'],
    ['director_cargo', 'Director Académico'],
    ['coordinador_nombre', 'Lic. María Fernanda Ríos'],
    ['pago_banco', 'Banorte'],
    ['pago_clabe', '012180015012345678'],
    ['pago_titular', 'Instituto Azteca de Formación Empresarial'],
    ['pago_concepto', 'Pago de mensualidad IAFE'],
  ];

  for (const [clave, valor] of configuracion) {
    await pedir('POST', 'iafe_configuracion?on_conflict=clave', {
      clave,
      valor,
      descripcion: 'Cargado por la semilla de demostración',
      categoria: 'general',
    });
  }

  // Montos por nivel
  for (const [clave, mensualidad, cuota] of [
    ['secundaria', 780, 500],
    ['bachillerato', 950, 600],
    ['licenciatura', 1400, 900],
  ]) {
    await pedir('PATCH', `iafe_niveles?clave=eq.${clave}`, { mensualidad, cuota_inscripcion: cuota });
  }

  // Grupos y alumnos
  const grupos = new Map();
  const alumnos = [];

  for (const [indice, datos] of ALUMNOS.entries()) {
    const nombreGrupo = `DEMO ${datos.grupo}`;
    let grupo = grupos.get(datos.grupo);
    if (!grupo) {
      const [creado] = await pedir('POST', 'iafe_grupos', {
        nombre: nombreGrupo,
        nivel_id: await idNivel(datos.nivel),
        ciclo: '2026-A',
        horario: 'Lunes a viernes · 8:00 a 13:00',
      });
      grupo = creado;
      grupos.set(datos.grupo, creado);
    }

    const [alumno] = await pedir('POST', 'iafe_alumnos', {
      codigo: `DEMO-${String(indice + 1).padStart(4, '0')}`,
      nombre: datos.nombre,
      apellidos: datos.apellidos,
      curp: datos.curp,
      telefono: datos.telefono,
      email: datos.email,
      direccion: 'Calle ejemplo 123, Teotihuacán',
      tutor_nombre: `${datos.nombre} ${datos.apellidos.split(' ')[0]}`,
      tutor_telefono: datos.telefono,
      nivel_id: await idNivel(datos.nivel),
      grupo_id: grupo.id,
      ciclo: '2026-A',
      fecha_inscripcion: '2026-08-03',
      estado: 'activo',
    });
    alumnos.push({ ...alumno, ...datos });
  }

  // Inscripciones
  for (const alumno of alumnos) {
    await pedir('POST', 'iafe_inscripciones', {
      alumno_id: alumno.id,
      ciclo: '2026-A',
      nivel_id: alumno.nivel_id,
      grupo_id: alumno.grupo_id,
      tipo: 'nueva',
      fecha: '2026-08-03',
      monto: 600,
    });
  }

  // Mensualidades: de enero hasta el mes en curso
  const anio = new Date().getFullYear();
  const mesesHasta = new Date().getMonth() + 1;
  for (const alumno of alumnos) {
    for (let mes = 1; mes <= mesesHasta; mes += 1) {
      const pagada = mes <= alumno.paid;
      await pedir('POST', 'iafe_mensualidades', {
        alumno_id: alumno.id,
        anio,
        mes,
        ciclo: '2026-A',
        concepto: 'mensualidad',
        monto: alumno.mensualidad,
        estado: pagada ? 'pagada' : 'pendiente',
        fecha_pago: pagada ? `${anio}-${String(mes).padStart(2, '0')}-05` : null,
        metodo: pagada ? (mes % 2 === 0 ? 'transferencia' : 'efectivo') : null,
        referencia: pagada ? `REF-${alumno.codigo}-${mes}` : null,
      });
    }
  }

  // Calificaciones
  for (const alumno of alumnos) {
    for (const materia of MATERIAS.slice(0, 4)) {
      for (const [indice, periodo] of ['parcial_1', 'parcial_2', 'parcial_3'].entries()) {
        await pedir('POST', 'iafe_calificaciones', {
          alumno_id: alumno.id,
          grupo_id: alumno.grupo_id,
          materia,
          periodo,
          calificacion: 6.5 + ((alumno.nombre.length + indice * 3) % 35) / 10,
          fecha: '2026-09-15',
        });
      }
    }
  }

  console.log(`Listo: ${alumnos.length} alumnos, ${grupos.size} grupos, pagos y calificaciones.`);
}

async function idNivel(clave) {
  const [nivel] = await pedir('GET', `iafe_niveles?clave=eq.${clave}&select=id`);
  if (!nivel) throw new Error(`No existe el nivel ${clave}`);
  return nivel.id;
}

if (process.argv.includes('--limpiar')) await limpiar();
else await sembrar();
