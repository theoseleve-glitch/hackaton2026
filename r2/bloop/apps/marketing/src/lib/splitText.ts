export function splitChars(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const spans: HTMLElement[] = [];
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'char';
    s.style.display = 'inline-block';
    s.style.whiteSpace = 'pre';
    s.textContent = ch;
    el.appendChild(s);
    spans.push(s);
  }
  return spans;
}
