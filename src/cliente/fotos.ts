// Prepara una foto en el navegador antes de subirla: comprueba el formato y el tamaño, la recorta al centro
// con la proporción que pide el diseño y la reduce si es enorme. Así no se sube nada que rompa la maqueta.

export type Foto = { base64: string; url: string; ext: 'jpg' | 'png'; ancho: number; alto: number };
type Requisitos = { proporcion?: number; minAncho?: number; transparente?: boolean };

const MAX_ANCHO = 2000; // px: más no se ve mejor y pesa mucho
const MAX_ORIGINAL = 25 * 1024 * 1024;
const MAX_FINAL = 4.5 * 1024 * 1024; // el servidor admite 5 MB

/** Proporción legible: 1.333 → «4:3». */
export function proporcionLegible(p: number) {
  for (let alto = 1; alto <= 20; alto++) {
    const ancho = p * alto;
    if (Math.abs(ancho - Math.round(ancho)) < 0.01) return `${Math.round(ancho)}:${alto}`;
  }
  return p.toFixed(2);
}

export async function prepararFoto(fichero: File, r: Requisitos = {}): Promise<Foto> {
  if (!/^image\/(jpeg|png|webp)$/.test(fichero.type)) throw new Error('Usa una foto JPG, PNG o WebP.');
  if (r.transparente && fichero.type !== 'image/png') throw new Error('Esta foto tiene que ser un PNG con el fondo transparente.');
  if (fichero.size > MAX_ORIGINAL) throw new Error('La foto pesa demasiado (más de 25 MB).');

  let img: ImageBitmap;
  try {
    img = await createImageBitmap(fichero);
  } catch {
    throw new Error('No se puede abrir la foto. Prueba con otra o guárdala de nuevo como JPG.');
  }

  // Recorte centrado a la proporción pedida.
  let [sx, sy, sw, sh] = [0, 0, img.width, img.height];
  if (r.proporcion) {
    if (sw / sh > r.proporcion) {
      const nw = sh * r.proporcion;
      sx = (sw - nw) / 2;
      sw = nw;
    } else {
      const nh = sw / r.proporcion;
      sy = (sh - nh) / 2;
      sh = nh;
    }
  }
  if (r.minAncho && sw < r.minAncho)
    throw new Error(`La foto es pequeña: ${Math.round(sw)} px de ancho${r.proporcion ? ' una vez recortada' : ''}. Hace falta al menos ${r.minAncho} px.`);

  const escala = Math.min(1, MAX_ANCHO / sw);
  const [ancho, alto] = [Math.round(sw * escala), Math.round(sh * escala)];
  const lienzo = document.createElement('canvas');
  [lienzo.width, lienzo.height] = [ancho, alto];
  const ctx = lienzo.getContext('2d')!;
  const png = Boolean(r.transparente);
  if (!png) {
    ctx.fillStyle = 'white'; // un PNG con transparencia pasado a JPG quedaría con fondo negro
    ctx.fillRect(0, 0, ancho, alto);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, ancho, alto);
  img.close();

  let url = '';
  for (const calidad of [0.86, 0.75, 0.6]) {
    url = lienzo.toDataURL(png ? 'image/png' : 'image/jpeg', calidad);
    if (url.length * 0.75 < MAX_FINAL) break;
  }
  if (url.length * 0.75 >= MAX_FINAL) throw new Error('La foto sigue pesando demasiado. Prueba con una más pequeña.');
  return { base64: url.slice(url.indexOf(',') + 1), url, ext: png ? 'png' : 'jpg', ancho, alto };
}
