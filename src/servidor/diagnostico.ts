// Comprobación de la instalación (pestaña «Instalación» del panel): qué está bien, qué falta y cómo arreglarlo.
// No muestra nunca el valor de los secretos, solo si están.
import { ESQUEMAS_JSON, FICHEROS, OPCIONES, validar } from 'virtual:micms/config';
import paquete from '../../package.json';
import { recorrerImagenes } from '../comun/esquema';
import { ajustes, configurado, ErrorGitHub, infoRama, leerTexto, listar } from './github';
import { claveConfigurada } from './sesion';

export type Nivel = 'ok' | 'aviso' | 'error' | 'info';
export type Comprobacion = { titulo: string; nivel: Nivel; detalle: string };

const DIA = 86_400_000;

export async function diagnostico() {
  const c: Comprobacion[] = [];
  const add = (nivel: Nivel, titulo: string, detalle: string) => c.push({ titulo, nivel, detalle });
  const gh = ajustes();
  let commit: string | null = null;

  // 1. Acceso.
  if (OPCIONES.acceso === 'web') add('info', 'Acceso', 'Lo protege el login de la web (acceso: \'web\'). Comprueba que cubre esta dirección y su /api.');
  else add(claveConfigurada() ? 'ok' : 'error', 'Acceso', claveConfigurada() ? 'Clave propia del gestor (MICMS_CLAVE).' : 'Falta el secreto MICMS_CLAVE (mínimo 12 caracteres).');

  // 2. Secretos de GitHub.
  if (!gh.token) add('error', 'Token de GitHub', 'Falta el secreto GITHUB_TOKEN: token de grano fino, solo para el repositorio de la web, con «Contents: Read and write».');
  else add('ok', 'Token de GitHub', 'Guardado (el valor no se muestra).');
  if (!gh.repo) add('error', 'Repositorio', 'Falta el secreto GITHUB_REPO, con la forma usuario/repositorio.');
  else if (!configurado()) add('error', 'Repositorio', `GITHUB_REPO no tiene la forma usuario/repositorio («${gh.repo}»).`);
  else add('ok', 'Repositorio', `${gh.repo}, rama ${gh.rama}.`);
  if (gh.apiPropia) add('aviso', 'API de GitHub', 'GITHUB_API está definida: solo debe usarse en pruebas.');

  // 3. Conexión, rama y caducidad del token.
  if (configurado()) {
    try {
      const info = await infoRama();
      commit = info.commit;
      add('ok', 'Conexión con GitHub', `Rama ${gh.rama} encontrada. Último commit: ${commit.slice(0, 7)}.`);
      if (info.caduca) {
        const fecha = new Date(info.caduca.replace(' UTC', 'Z').replace(' ', 'T'));
        const dias = Math.floor((fecha.getTime() - Date.now()) / DIA);
        const texto = Number.isNaN(dias) ? info.caduca : fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
        add(dias < 30 ? 'aviso' : 'ok', 'Caducidad del token', dias < 30 ? `Caduca el ${texto} (en ${dias} días). Crea uno nuevo y cambia GITHUB_TOKEN.` : `Caduca el ${texto}.`);
      } else add('info', 'Caducidad del token', 'GitHub no indica caducidad (token sin fecha de caducidad).');
      add('info', 'Permiso de escritura', 'No se puede comprobar sin escribir: lo confirma la primera publicación. Si falla, el token necesita «Contents: Read and write».');
    } catch (e) {
      const estado = e instanceof ErrorGitHub ? e.estado : 0;
      add(
        'error',
        'Conexión con GitHub',
        estado === 401
          ? 'GitHub no acepta el token: está mal copiado, caducado o revocado.'
          : estado === 404 || estado === 403
            ? `No se encuentra el repositorio ${gh.repo} o la rama ${gh.rama}, o el token no tiene acceso a ese repositorio.`
            : 'No se ha podido hablar con GitHub. Prueba otra vez en un momento.',
      );
    }
  }

  // 4. Contenido: cada fichero existe, es JSON y cumple su esquema; las fotos que usa existen.
  if (commit) {
    const imagenes = await listar(`${OPCIONES.carpeta}/imagenes`, commit).catch(() => [] as string[]);
    const usadas = new Set<string>();
    const faltan: string[] = [];
    for (const f of FICHEROS) {
      const ruta = `${OPCIONES.carpeta}/${f}`;
      let datos: unknown;
      try {
        datos = JSON.parse(await leerTexto(ruta, commit));
      } catch (e) {
        add('error', f, e instanceof ErrorGitHub && e.estado === 404 ? `No está en el repositorio (${ruta}). ¿Se ha subido?` : `${ruta} no es un JSON válido.`);
        continue;
      }
      const errores = validar(f, datos);
      recorrerImagenes(ESQUEMAS_JSON[f], datos, (archivo) => {
        usadas.add(archivo);
        if (!imagenes.includes(archivo)) faltan.push(`${archivo} (${f})`);
      });
      if (errores.length) add('error', f, `No cumple su esquema: ${errores.slice(0, 3).map((e) => `${e.ruta.join('.') || 'raíz'}: ${e.mensaje}`).join(' · ')}${errores.length > 3 ? ` · y ${errores.length - 3} más` : ''}.`);
      else add('ok', f, 'En el repositorio y cumple su esquema.');
    }
    if (faltan.length) add('error', 'Fotos', `Faltan en ${OPCIONES.carpeta}/imagenes/: ${faltan.join(', ')}.`);
    else add('ok', 'Fotos', `${usadas.size} en uso${imagenes.length > usadas.size ? `; ${imagenes.length - usadas.size} más en la carpeta que el contenido no usa` : ''}.`);
  }

  // 5. Ajustes de la web.
  if (!OPCIONES.sitio) add('aviso', 'Dirección de la web', 'astro.config no tiene «site»: la vista previa de Google no puede mostrar el dominio.');

  return {
    comprobaciones: c,
    commit,
    ajustes: {
      version: paquete.version,
      ruta: OPCIONES.ruta,
      base: OPCIONES.base || '/',
      carpeta: OPCIONES.carpeta,
      acceso: OPCIONES.acceso,
      repo: gh.repo,
      rama: gh.rama,
      ficheros: FICHEROS,
    },
  };
}
