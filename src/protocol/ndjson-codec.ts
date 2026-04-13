function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function convertKeys(
  obj: unknown,
  keyFn: (key: string) => string,
): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, keyFn));
  }
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[keyFn(key)] = convertKeys(value, keyFn);
    }
    return result;
  }
  return obj;
}

export function serializeToNdjsonLine(obj: Record<string, unknown>): string {
  const snaked = convertKeys(obj, camelToSnake) as Record<string, unknown>;
  return `${JSON.stringify(snaked)}\n`;
}

export function deserializeNdjsonLine(line: string): Record<string, unknown> {
  const parsed = JSON.parse(line.trim()) as Record<string, unknown>;
  return convertKeys(parsed, snakeToCamel) as Record<string, unknown>;
}
