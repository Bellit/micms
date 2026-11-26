// Secretos y variables del servidor, con la API de Astro (`astro:env/server`): funciona con cualquier adaptador
// (Cloudflare, Node, Netlify, Vercel). En Cloudflare son los secretos del Worker (`npx wrangler secret put`);
// en los demás, las variables de entorno del servidor.
import { getSecret } from 'astro:env/server';

export const secreto = (nombre: string): string | undefined => getSecret(nombre) || undefined;
