const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'em',
  'b',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'span',
  'a',
]);

const BLOCKED_TAGS = new Set([
  'script',
  'iframe',
  'object',
  'embed',
  'style',
  'link',
  'meta',
]);

function isSafeHref(href: string): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;

  try {
    const parsed = new URL(trimmed, 'https://example.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'mailto:' || parsed.protocol === 'tel:';
  } catch {
    return false;
  }
}

function sanitizeNode(node: Node, outDoc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) {
    return [outDoc.createTextNode(node.textContent ?? '')];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();

  if (BLOCKED_TAGS.has(tag)) {
    return [];
  }

  const sanitizedChildren = Array.from(element.childNodes).flatMap((child) => sanitizeNode(child, outDoc));

  if (!ALLOWED_TAGS.has(tag)) {
    return sanitizedChildren;
  }

  const safeElement = outDoc.createElement(tag);

  if (tag === 'a') {
    const href = element.getAttribute('href');
    if (href && isSafeHref(href)) {
      safeElement.setAttribute('href', href);
    }

    const target = element.getAttribute('target');
    if (target === '_blank') {
      safeElement.setAttribute('target', '_blank');
      safeElement.setAttribute('rel', 'noopener noreferrer');
    }
  }

  sanitizedChildren.forEach((child) => safeElement.appendChild(child));
  return [safeElement];
}

export function sanitizeRichText(input: string | null | undefined): string {
  if (!input) return '';

  const parser = new DOMParser();
  const sourceDocument = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  const sourceRoot = sourceDocument.body.firstElementChild;

  if (!sourceRoot) return '';

  const outDoc = document.implementation.createHTMLDocument('sanitized');
  const wrapper = outDoc.createElement('div');

  Array.from(sourceRoot.childNodes)
    .flatMap((node) => sanitizeNode(node, outDoc))
    .forEach((sanitized) => wrapper.appendChild(sanitized));

  return wrapper.innerHTML;
}
