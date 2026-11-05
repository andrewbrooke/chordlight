export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<{ className: string; text: string; title: string }> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.title) node.title = props.title;
  node.append(...children);
  return node;
}

/** A row of buttons under a name: beside it where there's room, above it where there isn't. */
export function group(label: string, items: HTMLElement[]): HTMLElement {
  return el('div', { className: 'group' }, [
    el('span', { className: 'sub', text: label }),
    el('div', { className: 'chips' }, items),
  ]);
}

export function options(select: HTMLSelectElement, items: [value: string, label: string][]): void {
  const current = select.value;
  select.replaceChildren(...items.map(([value, label]) => new Option(label, value)));
  if (items.some(([v]) => v === current)) select.value = current;
}

/** Blurs a select after a pick, so keyboard focus returns to the page. */
export function onPick(select: HTMLSelectElement, fn: (value: string) => void): void {
  select.addEventListener('change', () => {
    fn(select.value);
    select.blur();
  });
}

/** Hands the browser a file to save. */
export function download(name: string, type: string, data: BlobPart): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = el('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function onToggle(input: HTMLInputElement, fn: (on: boolean) => void): void {
  input.addEventListener('change', () => {
    fn(input.checked);
    input.blur();
  });
}
