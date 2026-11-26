// Lectura de los esquemas JSON (los genera Zod con z.toJSONSchema). Lo usan el panel y el servidor.
// Metadatos propios en cada nodo (los pone `.meta()` en esquemas.ts de la web):
//   etiqueta, ayuda, tipo ('linea' | 'parrafo' | 'titular' | 'email' | 'telefono' | 'url' | 'imagen'),
//   imagen { proporcion, minAncho, transparente }, google { titulo, descripcion } (plantillas con {campo}).

export type Esquema = {
  type?: string | string[];
  properties?: Record<string, Esquema>;
  required?: string[];
  items?: Esquema;
  anyOf?: Esquema[];
  const?: unknown;
  enum?: unknown[];
  opciones?: Record<string, string>;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  format?: string;
  etiqueta?: string;
  ayuda?: string;
  tipo?: string;
  imagen?: { proporcion?: number; minAncho?: number; transparente?: boolean };
  google?: { titulo?: string; descripcion?: string };
  [k: string]: unknown;
};

export type Ruta = (string | number)[];

const META = ['etiqueta', 'ayuda', 'tipo', 'imagen', 'google', 'opciones'] as const;

/** Copia los metadatos del padre que el hijo no tenga (Zod los deja en el nodo exterior de .nullable() y uniones). */
const conMeta = (hijo: Esquema, padre: Esquema): Esquema => {
  const r = { ...hijo };
  for (const k of META) if (padre[k] !== undefined && r[k] === undefined) (r as Record<string, unknown>)[k] = padre[k];
  return r;
};

/**
 * Simplifica las uniones que generan los esquemas habituales:
 *   T | null           → { ...T, anulable: true }
 *   texto | ''         → texto que admite quedar vacío
 */
export function normalizar(e: Esquema): Esquema & { anulable?: boolean; vacioPermitido?: boolean } {
  if (!e.anyOf) return e;
  const opciones = e.anyOf.filter((o) => o.type !== 'null');
  const anulable = opciones.length < e.anyOf.length;
  const vacio = opciones.some((o) => o.const === '');
  const resto = opciones.filter((o) => o.const !== '');
  if (resto.length === 1) return { ...conMeta(normalizar(resto[0]), e), ...(anulable && { anulable }), ...(vacio && { vacioPermitido: true }) };
  return e; // unión que no sabemos pintar: el panel la muestra como JSON
}

export const tipoDe = (e: Esquema) => (Array.isArray(e.type) ? e.type.find((t) => t !== 'null') : e.type);

/** Recorre los datos siguiendo el esquema y llama a `visita` en cada campo de tipo imagen. */
export function recorrerImagenes(e: Esquema, valor: unknown, visita: (archivo: string, ruta: Ruta) => void, ruta: Ruta = []) {
  const n = normalizar(e);
  if (valor === null || valor === undefined) return;
  const t = tipoDe(n);
  if (t === 'object' && n.properties && typeof valor === 'object')
    for (const [k, sub] of Object.entries(n.properties)) recorrerImagenes(sub, (valor as Record<string, unknown>)[k], visita, [...ruta, k]);
  else if (t === 'array' && n.items && Array.isArray(valor)) valor.forEach((v, i) => recorrerImagenes(n.items!, v, visita, [...ruta, i]));
  else if (t === 'string' && n.tipo === 'imagen' && typeof valor === 'string' && valor) visita(valor, ruta);
}

/** Valor vacío para un elemento nuevo de una lista. */
export function vacio(e: Esquema): unknown {
  const n = normalizar(e);
  if (n.anulable) return null;
  switch (tipoDe(n)) {
    case 'object':
      return Object.fromEntries((n.required ?? []).map((k) => [k, vacio(n.properties![k])]));
    case 'array':
      return Array.from({ length: n.minItems ?? 0 }, () => vacio(n.items!));
    case 'number':
    case 'integer':
      return n.minimum ?? 0;
    case 'boolean':
      return false;
    default:
      return '';
  }
}

/** Patrón de los nombres de las fotos (el mismo que en esquemas.ts de la Plantilla). */
export const NOMBRE_FOTO = /^[a-z0-9-]+\.(jpe?g|png|webp|avif)$/;

export const TIPO_FOTO: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };
