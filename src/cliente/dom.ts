// Utilidades de DOM compartidas por el panel y la pestaña «Instalación».

export type Hijo = Node | string | null | undefined | false;
/** Crea un elemento: h('p', { class: 'x', onclick: … }, 'texto', otroNodo). */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, unknown> = {}, ...hijos: Hijo[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of hijos) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}
