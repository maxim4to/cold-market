// Structural clean-up of legacy Joomla/JoomShopping description HTML, run after sanitize-html.
import { parseDocument, DomUtils } from 'htmlparser2';
import { Element, Text, type AnyNode, type ParentNode } from 'domhandler';

const BLOCKS = new Set(['p', 'div', 'h3', 'h4', 'ul', 'ol', 'li', 'table', 'dl', 'dt', 'dd', 'x-h']);
const EMPTYABLE = new Set(['p', 'div', 'span', 'strong', 'b', 'em', 'i', 'u', 'sup', 'sub', 'a', 'h3', 'h4', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'x-h']);
const EDGE_TRIM = new Set(['p', 'div', 'li', 'td', 'th', 'dt', 'dd', 'h3', 'h4', 'x-h']);
const BOLD = new Set(['strong', 'b']);
const INVISIBLE = /[\u200b\u200c\u200d\u2060\ufeff\u00ad]/g;

const isEl = (n: AnyNode | undefined): n is Element => !!n && n.type === 'tag';
const isText = (n: AnyNode | undefined): n is Text => !!n && n.type === 'text';
const textOf = (n: AnyNode | AnyNode[]) => DomUtils.textContent(n);
const blank = (s: string) => !s.replace(/[\s\u00a0]/g, '');
const blankNode = (n: AnyNode) => (isText(n) && blank(n.data)) || (n.type !== 'tag' && n.type !== 'text');
const els = (root: AnyNode[], name: string | ((e: Element) => boolean)) =>
  DomUtils.findAll((e) => (typeof name === 'string' ? e.name === name : name(e)), root);

function setChildren(parent: ParentNode, children: AnyNode[]) {
  parent.children = children;
  children.forEach((c, i) => {
    c.parent = parent;
    c.prev = children[i - 1] ?? null;
    c.next = children[i + 1] ?? null;
  });
}
function replaceWith(node: AnyNode, nodes: AnyNode[]) {
  const p = node.parent!;
  const i = p.children.indexOf(node as never);
  setChildren(p, [...p.children.slice(0, i), ...nodes, ...p.children.slice(i + 1)]);
}
const remove = (node: AnyNode) => replaceWith(node, []);
function wrap(node: AnyNode, name: string, attribs: Record<string, string> = {}) {
  const p = node.parent!;
  const i = p.children.indexOf(node as never);
  const el = make(name, [node], attribs);
  setChildren(p, [...p.children.slice(0, i), el, ...p.children.slice(i + 1)]);
}
const unwrap = (el: Element) => replaceWith(el, el.children);
function make(name: string, children: AnyNode[], attribs: Record<string, string> = {}) {
  const el = new Element(name, attribs);
  setChildren(el, children);
  return el;
}
function postOrder(node: ParentNode, fn: (el: Element) => void) {
  for (const c of [...node.children]) {
    if (isEl(c)) {
      postOrder(c, fn);
      fn(c);
    }
  }
}
// Text that is not inside <strong>/<b>
function nonBoldText(n: AnyNode): string {
  if (isText(n)) return n.data;
  if (isEl(n)) return BOLD.has(n.name) ? '' : n.children.map(nonBoldText).join('');
  return '';
}
const hasBlock = (el: Element) => els(el.children, (e) => BLOCKS.has(e.name) || e.name === 'table').length > 0;

// Non-breaking spaces glue whole sentences together in the old texts (which overflow on phones).
// Keep them only where they are typographic: after 1–2 letter words and inside numbers / before units.
function normalizeText(s: string): string {
  s = s.replace(INVISIBLE, '').replace(/[-–—_=*]{5,}/g, '');
  return s.replace(/\u00a0/g, (_m, off: number, all: string) => {
    const prev = all.slice(0, off).match(/\S*$/)![0];
    const next = all.slice(off + 1).match(/^\S*/)![0];
    if (!prev || !next) return ' ';
    if (/^[^\d\s]{1,2}$/.test(prev)) return '\u00a0';
    if (/\d$/.test(prev) && (/^\d/.test(next) || next.length <= 4)) return '\u00a0';
    return ' ';
  }).replace(/ {2,}/g, ' ');
}

function trimEdge(el: Element, side: 'start' | 'end') {
  for (;;) {
    const kids = el.children;
    const n = side === 'start' ? kids[0] : kids[kids.length - 1];
    if (!n) return;
    if ((isEl(n) && n.name === 'br') || (isText(n) && blank(n.data)) || (n.type !== 'tag' && n.type !== 'text')) {
      remove(n);
      continue;
    }
    if (isText(n)) {
      n.data = side === 'start' ? n.data.replace(/^[\s\u00a0]+/, '') : n.data.replace(/[\s\u00a0]+$/, '');
      return;
    }
    if (isEl(n) && !BLOCKS.has(n.name) && n.name !== 'table') trimEdge(n, side);
    return;
  }
}

function collapseBreaks(el: Element) {
  let lastBr = false;
  const out: AnyNode[] = [];
  const pending: AnyNode[] = [];
  for (const c of el.children) {
    if (isEl(c) && c.name === 'br') {
      if (!lastBr) out.push(...pending, c);
      pending.length = 0;
      lastBr = true;
    } else if (blankNode(c)) {
      pending.push(c);
    } else {
      out.push(...pending, c);
      pending.length = 0;
      lastBr = false;
    }
  }
  out.push(...pending);
  if (out.length !== el.children.length) setChildren(el, out);
}

const isEmpty = (el: Element) => EMPTYABLE.has(el.name) && blank(textOf(el));

function tidyElements(root: ParentNode) {
  postOrder(root, (el) => {
    if (!el.parent) return;
    collapseBreaks(el);
    if (EDGE_TRIM.has(el.name)) {
      trimEdge(el, 'start');
      trimEdge(el, 'end');
    }
    if (isEmpty(el)) return remove(el);
    // <li><p>…</p></li>, <td><p>…</p></td>
    if (['li', 'td', 'th', 'dd'].includes(el.name)) {
      const kids = el.children.filter((c) => !blankNode(c));
      if (kids.length === 1 && isEl(kids[0]) && kids[0].name === 'p') unwrap(kids[0]);
    }
  });
  collapseBreaks(root as Element);
}

// <dl><dt>…paragraphs…</dt></dl> used as a layout wrapper
function unwrapLayoutLists(root: ParentNode) {
  for (const dl of els(root.children, 'dl')) {
    if (!dl.parent) continue;
    const parts = dl.children.filter(isEl);
    const count = (name: string) => parts.filter((p) => p.name === name).length;
    const short = parts.every((p) => textOf(p).trim().length <= 150);
    if (!parts.some(hasBlock) && short && count('dt') > 0 && count('dt') === count('dd')) continue;
    for (const part of parts) {
      if (part.name === 'dt' || part.name === 'dd') {
        if (hasBlock(part)) unwrap(part);
        else part.name = 'p';
      }
    }
    unwrap(dl);
  }
}

function tidyTables(root: ParentNode) {
  postOrder(root, (table) => {
    if (table.name !== 'table' || !table.parent) return;
    const cells = (row: Element) => row.children.filter((c): c is Element => isEl(c) && (c.name === 'td' || c.name === 'th'));
    const rows = () => els(table.children, 'tr');

    // Layout tables: a table holding another table, or a single cell
    if (els(table.children, 'table').length || rows().flatMap(cells).length <= 1) {
      const blocks = rows().flatMap(cells).map((c) => make('div', c.children));
      return replaceWith(table, blocks);
    }
    for (const row of rows()) {
      if (cells(row).every((c) => blank(textOf(c)))) remove(row);
    }
    const all = rows();
    if (!all.length) return remove(table);
    // one cell per row: a list of lines, not a table
    if (all.every((r) => cells(r).length === 1)) {
      return replaceWith(table, all.map((r) => make(hasBlock(cells(r)[0]) ? 'div' : 'p', cells(r)[0].children)));
    }

    const first = all[0];
    const head = cells(first);
    if (
      head.length > 1 && all.length > 1 && head.every((c) => c.name === 'td') &&
      head.some((c) => !blank(textOf(c))) && head.every((c) => blank(nonBoldText(c)))
    ) {
      for (const c of head) {
        c.name = 'th';
        for (const b of els(c.children, (e) => BOLD.has(e.name))) unwrap(b);
      }
    }
    const tbody = first.parent as Element;
    if (head.length > 1 && head.every((c) => c.name === 'th') && tbody.name === 'tbody' && tbody.children.filter(isEl).length > 1) {
      remove(first);
      const thead = make('thead', []);
      replaceWith(tbody, [thead, tbody]);
      setChildren(thead, [first]);
    }
    const cols = Math.max(...all.map((r) => cells(r).length));
    if (cols >= 4) table.attribs.class = 'wide';
    wrap(table, 'div', { class: 'table-wrap' });
  });
}

// Short lines that are entirely bold, or the old "font-size: 20px" divs, are sub-headings
function promoteHeadings(root: ParentNode) {
  postOrder(root, (el) => {
    // old texts also put whole paragraphs into <h1>/<h2>
    if ((el.name === 'h3' || el.name === 'h4') && (textOf(el).trim().length > 100 || els(el.children, 'br').length)) {
      el.name = 'p';
      return;
    }
    if (!el.parent || !['p', 'div', 'x-h'].includes(el.name)) return;
    const insideCell = hasAncestor(el, ['td', 'th', 'li', 'dt', 'dd']);
    const t = textOf(el).trim();
    const short = t.length >= 2 && t.length <= 80 && !hasBlock(el) && !/[.!?;,]$/.test(t);
    if (el.name === 'x-h') {
      el.name = short && !insideCell ? 'h4' : 'div';
      return;
    }
    if (insideCell || !short || !blank(nonBoldText(el))) return;
    const after = el.parent.children.slice(el.parent.children.indexOf(el) + 1);
    if (!after.some((c) => !blankNode(c))) return;
    el.name = 'h4';
    for (const b of els(el.children, (e) => BOLD.has(e.name))) unwrap(b);
  });
}
function hasAncestor(el: AnyNode, names: string[]): boolean {
  for (let p = el.parent; p; p = p.parent) if (isEl(p) && names.includes(p.name)) return true;
  return false;
}

const meaningful = (parent: ParentNode, fromEnd = false) => {
  const kids = parent.children.filter((c) => !blankNode(c) && !(isEl(c) && (c.name === 'br' || blank(textOf(c)))));
  return fromEnd ? kids[kids.length - 1] : kids[0];
};

// Spec label normalized for matching: "Охлаждаемый объём, л" -> "охлаждаемыйобъем"
const SPEC_SYNONYMS: Record<string, string> = {
  вес: 'масса', страна: 'странапроизводства', странапроизводитель: 'странапроизводства', страназначение: 'странапроизводства',
  бренд: 'производитель', марка: 'производитель', торговаямарка: 'производитель', артикул: 'модель',
};
const specKey = (s: string) => {
  const k = s.toLowerCase().replace(/ё/g, 'е').split(/[,:(]/)[0].replace(/[^a-zа-я0-9]/g, '');
  return SPEC_SYNONYMS[k] ?? k;
};
const specValue = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '');

type SpecItem = { label: string; value: string; nodes: AnyNode[] };

// Label/value items of a spec-like block; null for anything else (e.g. multi-column comparison tables)
function specItems(el: Element): SpecItem[] | null {
  if (el.name === 'table') {
    const rows = DomUtils.findAll((e) => e.name === 'tr', el.children);
    const cells = (tr: Element) => els(tr.children, (c) => c.name === 'td' || c.name === 'th');
    const pairs = rows.filter((tr) => cells(tr).length === 2);
    if (!rows.length || pairs.length / rows.length < 0.7) return null;
    return pairs.map((tr) => ({ label: textOf(cells(tr)[0]), value: textOf(cells(tr)[1]), nodes: [tr] }));
  }
  if (el.name === 'dl') {
    const items: SpecItem[] = [];
    for (const c of el.children) {
      if (isEl(c) && c.name === 'dt') items.push({ label: textOf(c), value: '', nodes: [c] });
      else if (items.length) {
        items[items.length - 1].nodes.push(c);
        if (isEl(c) && c.name === 'dd') items[items.length - 1].value += textOf(c);
      }
    }
    return items;
  }
  const lis = els(el.children, 'li');
  const pairs = lis.filter((li) => !hasBlock(li) && textOf(li).includes(':'));
  if (!lis.length || pairs.length / lis.length < 0.7) return null;
  return pairs.map((li) => { const [label, ...rest] = textOf(li).split(':'); return { label, value: rest.join(':'), nodes: [li] }; });
}

// Rows of description tables/lists that repeat the product's own spec block are removed;
// rows with extra information stay. A block left without real rows goes away entirely.
function dropSpecDuplicates(root: ParentNode, specs: { name: string; value: string }[]) {
  const keys = new Set(specs.map((f) => specKey(f.name)).filter((k) => k.length >= 3));
  // numbers are too ambiguous to match by value alone ("10" kg vs "10" l); text values like a country or brand are not
  const textValues = new Set(specs.map((f) => specValue(f.value)).filter((v) => v.length >= 3 && /[a-zа-я]/.test(v)));
  if (keys.size < 2) return;
  const matches = (i: SpecItem) => {
    const k = specKey(i.label);
    if (k.length >= 3 && [...keys].some((s) => s === k || s.startsWith(k) || k.startsWith(s))) return true;
    return textValues.has(specValue(i.value));
  };
  for (const el of els(root.children, (e) => ['table', 'ul', 'ol', 'dl'].includes(e.name))) {
    if (hasAncestor(el, ['table', 'ul', 'ol'])) continue;
    const items = specItems(el);
    if (!items || items.length < 2) continue;
    const dup = items.filter(matches);
    if (dup.length < 2) continue;
    if (items.length - dup.length < 2) remove(el);
    else dup.forEach((i) => i.nodes.forEach(remove));
  }
}

// First meaningful node, looking through wrapper divs
function leadingNode(n: AnyNode | undefined): AnyNode | undefined {
  while (isEl(n) && n.name === 'div') n = meaningful(n);
  return n;
}

// Headings that ended up with no content under them (followed by another heading or nothing)
function dropEmptySections(root: ParentNode) {
  for (const h of els(root.children, (e) => e.name === 'h3' || e.name === 'h4')) {
    let next = h.next;
    while (next && (blankNode(next) || (isEl(next) && blank(textOf(next))))) next = next.next;
    const lead = leadingNode(next);
    if (!next || (isEl(lead) && (lead.name === 'h3' || lead.name === 'h4'))) remove(h);
  }
}

// The page already has its own "Описание" heading
function dropLeadingTitle(root: ParentNode, pattern: RegExp) {
  let parent: ParentNode = root;
  for (let depth = 0; depth < 6; depth++) {
    const n = meaningful(parent);
    if (!n) return;
    if (pattern.test(textOf(n).replace(/[\s\u00a0]+/g, ' ').trim())) return remove(n);
    if (!isEl(n)) return;
    if (!hasBlock(n)) {
      // "<p><span><strong>Описание</strong><br>Text…" — look into the leading inline elements
      for (let c = meaningful(n); c; c = isEl(c) ? meaningful(c) : undefined) {
        if (pattern.test(textOf(c).trim())) return remove(c);
      }
      return;
    }
    parent = n;
  }
}

// A heading or "Label:" line with nothing after it
function dropTrailingLabels(root: ParentNode) {
  for (let guard = 0; guard < 5; guard++) {
    let parent: ParentNode = root;
    let n = meaningful(parent, true);
    while (isEl(n) && n.name === 'div' && hasBlock(n)) {
      parent = n;
      n = meaningful(parent, true);
    }
    if (!isEl(n)) return;
    const t = textOf(n).trim();
    const label = !hasBlock(n) && (['h3', 'h4'].includes(n.name) || (['p', 'div'].includes(n.name) && t.length <= 80 && (t.endsWith(':') || blank(nonBoldText(n)))));
    if (!label || blank(textOf(root).replace(textOf(n), ''))) return;
    remove(n);
  }
}

// Loose text next to blocks (left over from stripped tags) goes into its own paragraph
function wrapLooseText(root: ParentNode) {
  if (!root.children.some((c) => isEl(c) && (BLOCKS.has(c.name) || c.name === 'div'))) {
    // plain-text description: its line breaks are the paragraphs
    const lines = root.children.flatMap((c) => (isText(c) ? c.data.split(/\n+/).map((t, i) => (i ? [null, t] : [t])).flat() : [c]));
    if (!lines.includes(null)) return;
    const paras: AnyNode[][] = [[]];
    for (const l of lines) {
      if (l === null) paras.push([]);
      else paras[paras.length - 1].push(typeof l === 'string' ? new Text(l) : l);
    }
    return setChildren(root, paras.filter((p) => p.some((c) => !blankNode(c))).map((p) => make('p', p)));
  }
  const out: AnyNode[] = [];
  let run: AnyNode[] = [];
  const flush = () => {
    if (run.some((c) => !blankNode(c) && !(isEl(c) && c.name === 'br'))) out.push(make('p', run));
    else out.push(...run);
    run = [];
  };
  for (const c of root.children) {
    if (isEl(c) && (BLOCKS.has(c.name) || c.name === 'div')) {
      flush();
      out.push(c);
    } else run.push(c);
  }
  flush();
  setChildren(root, out);
}

export function tidyLegacyHtml(html: string, opts: { dropTitle?: RegExp; specs?: { name: string; value: string }[] } = {}): string {
  const doc = parseDocument(html);
  const texts: Text[] = [];
  (function collect(n: AnyNode) {
    if (isText(n)) texts.push(n);
    else if ('children' in n) n.children.forEach(collect);
  })(doc);
  for (const t of texts) t.data = normalizeText(t.data);

  unwrapLayoutLists(doc);
  tidyElements(doc);
  tidyTables(doc);
  promoteHeadings(doc);
  if (opts.specs?.length) {
    dropSpecDuplicates(doc, opts.specs);
    tidyElements(doc);
    dropEmptySections(doc);
  }
  if (opts.dropTitle) dropLeadingTitle(doc, opts.dropTitle);
  unwrapLayoutLists(doc);
  dropTrailingLabels(doc);
  wrapLooseText(doc);
  tidyElements(doc);
  const only = doc.children.filter((c) => !blankNode(c));
  if (only.length === 1 && isEl(only[0]) && (only[0].name === 'h3' || only[0].name === 'h4')) only[0].name = 'p';
  return DomUtils.getOuterHTML(doc.children, { encodeEntities: 'utf8' });
}

export function innerHtmlOf(html: string, match: (attribs: Record<string, string>) => boolean): string | null {
  const doc = parseDocument(html);
  const el = DomUtils.findOne((e) => match(e.attribs), doc.children);
  return el ? DomUtils.getInnerHTML(el, { encodeEntities: 'utf8' }) : null;
}
