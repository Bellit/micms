// Qué se puede editar y con qué límites. micms genera el formulario a partir de aquí.
import { z } from 'astro/zod';

export const Portada = z
  .object({
    titulo: z.string().min(1).max(40).meta({ etiqueta: 'Titular', ayuda: 'Lo primero que se lee.' }),
    texto: z.string().max(200).meta({ etiqueta: 'Texto', tipo: 'parrafo' }),
    estado: z
      .enum(['abierto', 'vacaciones', 'reformas'])
      .meta({ etiqueta: 'Aviso en la portada', opciones: { abierto: 'Ninguno (abierto)', vacaciones: 'Cerrado por vacaciones', reformas: 'Cerrado por reformas' } }),
    foto: z
      .object({
        archivo: z.string().meta({ etiqueta: 'Foto', tipo: 'imagen', imagen: { proporcion: 4 / 3, minAncho: 800 } }),
        alt: z.string().min(1).max(120).meta({ etiqueta: 'Descripción de la foto', ayuda: 'Para quien no la ve y para Google.' }),
      })
      .meta({ etiqueta: 'Foto principal' }),
  })
  .meta({ etiqueta: 'Portada', google: { titulo: '{titulo}', descripcion: '{texto}' } });

export const ESQUEMAS = { 'portada.json': Portada };
