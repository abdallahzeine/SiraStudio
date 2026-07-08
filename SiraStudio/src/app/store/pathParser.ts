export type PathToken =
  | { type: 'root' }
  | { type: 'prop'; value: string }
  | { type: 'index'; value: number }
  | { type: 'append' };

function createPathError(path: string, message: string): Error {
  return new Error(`Invalid path "${path}": ${message}`);
}

function isIdentifierChar(ch: string): boolean {
  return /[A-Za-z0-9_$-]/.test(ch);
}

export function parsePathTokens(path: string): PathToken[] {
  if (path === '') {
    return [{ type: 'root' }];
  }

  const tokens: PathToken[] = [];
  let i = 0;

  while (i < path.length) {
    const ch = path[i];

    if (ch === '.') {
      if (i === 0 || i === path.length - 1 || path[i + 1] === '.') {
        throw createPathError(path, 'unexpected dot');
      }
      i += 1;
      continue;
    }

    if (ch === '[') {
      const close = path.indexOf(']', i + 1);
      if (close === -1) {
        throw createPathError(path, 'missing closing bracket');
      }

      const rawIndex = path.slice(i + 1, close).trim();
      if (rawIndex === '') {
        throw createPathError(path, 'empty bracket index');
      }

      if (rawIndex === '-1') {
        tokens.push({ type: 'append' });
      } else {
        if (!/^-?\d+$/.test(rawIndex)) {
          throw createPathError(path, `invalid array index "${rawIndex}"`);
        }

        const parsed = Number.parseInt(rawIndex, 10);
        if (!Number.isInteger(parsed) || parsed < 0) {
          throw createPathError(path, `index must be >= 0 or -1, got "${rawIndex}"`);
        }

        tokens.push({ type: 'index', value: parsed });
      }

      i = close + 1;
      continue;
    }

    let end = i;
    while (end < path.length && path[end] !== '.' && path[end] !== '[') {
      if (!isIdentifierChar(path[end])) {
        throw createPathError(path, `invalid property character "${path[end]}"`);
      }
      end += 1;
    }

    if (end === i) {
      throw createPathError(path, 'expected property name');
    }

    tokens.push({ type: 'prop', value: path.slice(i, end) });
    i = end;
  }

  return tokens;
}

export function stringifyTokens(tokens: PathToken[]): string {
  if (tokens.length === 0) {
    return '';
  }

  if (tokens.length === 1 && tokens[0].type === 'root') {
    return '';
  }

  if (tokens.some((t) => t.type === 'root')) {
    throw new Error('Invalid token set: root token cannot be mixed with other tokens');
  }

  let path = '';
  for (const token of tokens) {
    if (token.type === 'prop') {
      path += path.length > 0 ? `.${token.value}` : token.value;
      continue;
    }

    if (token.type === 'index') {
      path += `[${token.value}]`;
      continue;
    }

    if (token.type === 'append') {
      path += '[-1]';
    }
  }

  return path;
}

