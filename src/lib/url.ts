const base = import.meta.env.BASE_URL.replace(/\/$/, '');

export function u(path: string): string {
  if (!path || /^(https?:|tel:|mailto:|#)/.test(path)) return path;
  return base + (path.startsWith('/') ? path : '/' + path);
}

export function abs(path: string, site: URL | undefined): string {
  return new URL(u(path), site).toString();
}
