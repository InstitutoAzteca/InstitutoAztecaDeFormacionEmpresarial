// state.js — estado global compartido entre el shell y las vistas.

import { leerConfiguracionCompleta } from './services/configuracion.js';

export const estado = {
  sesion: null,
  usuario: null,
  perfil: null,
  config: null,
  datos: {
    alumnos: [],
    niveles: [],
    grupos: [],
    pagos: [],
  },
  cargando: true,
};

/** Actualiza el estado global. */
export function setEstado(parcial) {
  Object.assign(estado, parcial);
}

/** Carga la configuración institucional (plantillas, ciclo, datos oficiales). */
export async function cargarConfig() {
  if (estado.config) return estado.config;
  const config = await leerConfiguracionCompleta();
  setEstado({ config });
  return config;
}

/** Espera a que el shell haya resuelto la sesión. */
export function cuandoListo() {
  return new Promise((resolver) => {
    const revisar = () => {
      if (!estado.cargando) resolver(estado);
      else setTimeout(revisar, 40);
    };
    revisar();
  });
}

/** Refleja el ciclo escolar activo en la barra superior. */
export function pintarCiclo() {
  const chip = document.getElementById('ciclo-valor');
  if (chip) chip.textContent = estado.config?.ciclo_activo || 'Sin definir';
}
