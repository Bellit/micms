// Tipos de los módulos virtuales que crea index.mjs y de los módulos de Astro que usa micms.
declare module 'virtual:micms/config' {
  export const OPCIONES: {
    carpeta: string;
    ruta: string;
    acceso: 'propio' | 'web';
    sitio: string | null;
    base: string;
    barra: boolean;
  };
  export const MARCADORES: Record<string, string>;
  export const FICHEROS: string[];
  export const ESQUEMAS_JSON: Record<string, Record<string, unknown>>;
  export function validar(fichero: string, datos: unknown): { ruta: (string | number)[]; mensaje: string }[];
}

declare module 'virtual:micms/layout' {
  const Layout: (props: { title: string; actual?: string }) => unknown;
  export default Layout;
}

declare module 'astro:env/server' {
  export function getSecret(key: string): string | undefined;
}

declare module '*.md?raw' {
  const texto: string;
  export default texto;
}
