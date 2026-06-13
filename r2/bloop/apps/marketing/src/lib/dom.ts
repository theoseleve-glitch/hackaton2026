type Attrs = Record<string, string>;
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Attrs = {}, ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v; // innerHTML sink — pass ONLY static literals, never i18n/catalog/user data
    else n.setAttribute(k, v);
  }
  for (const c of children) n.append(c);
  return n;
}
