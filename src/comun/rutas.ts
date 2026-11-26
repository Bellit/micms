// Direcciones del gestor teniendo en cuenta `base` y `trailingSlash` de la web
// (p. ej. base '/mi-web' y trailingSlash 'always' → /mi-web/admin/contenido/api/estado/).
export type Rutas = { base: string; ruta: string; barra: boolean };

const fin = (p: string, barra: boolean) => (barra && !p.endsWith('/') ? `${p}/` : p);

/** Dirección del panel. */
export const urlPanel = (o: Rutas) => fin(`${o.base}${o.ruta}`, o.barra);
/** Dirección de una acción de la API. */
export const urlApi = (o: Rutas, accion: string) => fin(`${o.base}${o.ruta}/api/${accion}`, o.barra);
/** Ruta de la cookie de sesión: el panel y su API, nada más. */
export const rutaCookie = (o: Rutas) => `${o.base}${o.ruta}`;
/** Portada de la web y fichero con el commit publicado. */
export const urlWeb = (o: Rutas) => `${o.base}/`;
export const urlVersion = (o: Rutas) => `${o.base}/_micms/version.json`;
