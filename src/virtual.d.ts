// Tipos de los módulos virtuales que crea index.mjs y del entorno de Cloudflare.
declare module 'virtual:micms/config' {
  export const OPCIONES: { carpeta: string; ruta: string; sitio: string | null };
  export const MARCADORES: Record<string, string>;
  export const FICHEROS: string[];
  export const ESQUEMAS_JSON: Record<string, Record<string, unknown>>;
  export function validar(fichero: string, datos: unknown): { ruta: (string | number)[]; mensaje: string }[];
}

declare module 'virtual:micms/layout' {
  const Layout: (props: { title: string; actual?: string }) => unknown;
  export default Layout;
}

declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
