// Lo que hace el gestor en el servidor: leer el contenido de GitHub, validarlo con los esquemas de la web
// y publicarlo en un solo commit.
import { ESQUEMAS_JSON, FICHEROS, MARCADORES, OPCIONES, validar } from 'virtual:micms/config';
import { NOMBRE_FOTO, recorrerImagenes } from '../comun/esquema';
import { guardar, leerTexto, listar, ultimoCommit, type Cambio } from './github';

const C = OPCIONES.carpeta;
const IMAGENES = `${C}/imagenes`;
export const MAX_FOTO = 5 * 1024 * 1024; // bytes por foto
const MAX_FOTOS = 20 * 1024 * 1024; // bytes por publicación

/** Todo lo que necesita el panel: commit, esquemas, datos y fotos que hay. */
export async function estado() {
  const commit = await ultimoCommit();
  const [textos, imagenes] = await Promise.all([Promise.all(FICHEROS.map((f) => leerTexto(`${C}/${f}`, commit))), listar(IMAGENES, commit)]);
  const ficheros = Object.fromEntries(FICHEROS.map((f, i) => [f, { esquema: ESQUEMAS_JSON[f], datos: JSON.parse(textos[i]) }]));
  return { commit, ficheros, imagenes, marcadores: MARCADORES, sitio: OPCIONES.sitio };
}

export type ErrorCampo = { fichero?: string; ruta?: (string | number)[]; mensaje: string };
type Resultado = { ok: true; commit: string | null } | { ok: false; estado: number; errores: ErrorCampo[] };

/** Fotos usadas en los datos de todos los ficheros. */
function fotosUsadas(datos: Record<string, unknown>) {
  const usadas: { archivo: string; fichero: string; ruta: (string | number)[] }[] = [];
  for (const f of FICHEROS) recorrerImagenes(ESQUEMAS_JSON[f], datos[f], (archivo, ruta) => usadas.push({ archivo, fichero: f, ruta }));
  return usadas;
}

/** Comprueba por los primeros bytes que el fichero es de verdad una imagen del formato que dice su nombre. */
function esImagen(nombre: string, b: Uint8Array) {
  const ext = nombre.split('.').pop();
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if (ext === 'jpg' || ext === 'jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === 'png') return txt(1, 3) === 'PNG';
  if (ext === 'webp') return txt(0, 4) === 'RIFF' && txt(8, 4) === 'WEBP';
  if (ext === 'avif') return txt(4, 4) === 'ftyp';
  return false;
}

const base64Bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Publica los cambios del panel.
 * `base`: commit con el que se abrió el panel · `ficheros`: datos de cada fichero · `fotos`: fotos nuevas en base64.
 */
export async function publicar(cuerpo: unknown): Promise<Resultado> {
  const mal = (mensaje: string, estado = 400): Resultado => ({ ok: false, estado, errores: [{ mensaje }] });
  if (!cuerpo || typeof cuerpo !== 'object') return mal('Petición no válida');
  const { base, ficheros, fotos = {} } = cuerpo as { base?: unknown; ficheros?: unknown; fotos?: unknown };
  if (typeof base !== 'string' || !/^[0-9a-f]{40}$/.test(base)) return mal('Falta el commit de partida');
  if (!ficheros || typeof ficheros !== 'object' || !fotos || typeof fotos !== 'object') return mal('Petición no válida');
  const nuevos = ficheros as Record<string, unknown>;
  const subidas = fotos as Record<string, unknown>;
  for (const f of Object.keys(nuevos)) if (!FICHEROS.includes(f)) return mal(`Fichero desconocido: ${f}`);

  // 1. Esquemas.
  const errores: ErrorCampo[] = [];
  for (const f of Object.keys(nuevos)) for (const e of validar(f, nuevos[f])) errores.push({ fichero: f, ...e });

  // 2. Fotos subidas: nombre, formato real y tamaño.
  const bytes: Record<string, Uint8Array> = {};
  let total = 0;
  for (const [nombre, b64] of Object.entries(subidas)) {
    if (!NOMBRE_FOTO.test(nombre) || typeof b64 !== 'string') return mal(`Foto no válida: ${nombre}`);
    try {
      bytes[nombre] = base64Bytes(b64);
    } catch {
      return mal(`Foto no válida: ${nombre}`);
    }
    total += bytes[nombre].length;
    if (bytes[nombre].length > MAX_FOTO) return mal(`La foto ${nombre} pesa más de ${MAX_FOTO / 1024 / 1024} MB`, 413);
    if (!esImagen(nombre, bytes[nombre])) return mal(`${nombre} no es una imagen válida`);
  }
  if (total > MAX_FOTOS) return mal('Demasiadas fotos a la vez: publica en dos veces', 413);
  if (errores.length) return { ok: false, estado: 422, errores };

  // 3. Comparar con lo que hay en GitHub. Si alguien ha publicado después de abrir el panel, no se pisa.
  const actual = await ultimoCommit();
  if (actual !== base) return mal('Se han publicado cambios después de abrir el panel. Recarga la página para verlos (perderás lo que no hayas publicado).', 409);
  const [textosBase, existentes] = await Promise.all([Promise.all(FICHEROS.map((f) => leerTexto(`${C}/${f}`, base))), listar(IMAGENES, base)]);
  const datosBase = Object.fromEntries(FICHEROS.map((f, i) => [f, JSON.parse(textosBase[i])]));
  const datos = { ...datosBase, ...nuevos };

  // 4. Cada foto usada tiene que existir ya o venir en esta publicación.
  const usadas = fotosUsadas(datos);
  for (const u of usadas)
    if (!existentes.includes(u.archivo) && !bytes[u.archivo]) errores.push({ fichero: u.fichero, ruta: u.ruta, mensaje: `No existe la foto ${u.archivo}` });
  if (errores.length) return { ok: false, estado: 422, errores };

  // 5. Cambios: ficheros que cambian, fotos nuevas que se usan y fotos que dejan de usarse (solo las que usaba el contenido).
  const cambios: Cambio[] = [];
  const cambiados: string[] = [];
  for (const f of FICHEROS)
    if (f in nuevos && !igual(nuevos[f], datosBase[f])) {
      cambios.push({ ruta: `${C}/${f}`, texto: JSON.stringify(nuevos[f], null, 2) + '\n' });
      cambiados.push(f);
    }
  const enUso = new Set(usadas.map((u) => u.archivo));
  const nuevas = Object.keys(bytes).filter((n) => enUso.has(n) && !existentes.includes(n));
  for (const n of nuevas) cambios.push({ ruta: `${IMAGENES}/${n}`, base64: subidas[n] as string });
  const sobran = [...new Set(fotosUsadas(datosBase).map((u) => u.archivo))].filter((n) => !enUso.has(n) && existentes.includes(n));
  for (const n of sobran) cambios.push({ ruta: `${IMAGENES}/${n}`, borrar: true });
  if (!cambios.length) return { ok: true, commit: null };

  const resumen = [
    cambiados.length && cambiados.join(', '),
    nuevas.length && `${nuevas.length} foto${nuevas.length > 1 ? 's' : ''} nueva${nuevas.length > 1 ? 's' : ''}`,
    sobran.length && `${sobran.length} foto${sobran.length > 1 ? 's' : ''} retirada${sobran.length > 1 ? 's' : ''}`,
  ].filter(Boolean);
  const commit = await guardar(base, cambios, `Contenido: ${resumen.join(' · ')}\n\nPublicado desde el gestor de contenido (micms).`);
  return { ok: true, commit };
}
