export interface BrowserLocationLike {
  protocol: string;
  host: string;
}

/** Resolve the multiplayer endpoint without coupling URL policy to NetClient. */
export function resolveWebSocketUrl(
  configuredUrl: string | undefined,
  location: BrowserLocationLike,
): string {
  const configured = configuredUrl?.trim();
  if (!configured) {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${location.host}/ws`;
  }

  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error('VITE_GAME_SERVER_URL must be an absolute ws: or wss: URL');
  }
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
    throw new Error('VITE_GAME_SERVER_URL must use the ws: or wss: protocol');
  }
  return url.href;
}

/** Prefix root-relative public assets with Vite's configured deployment base. */
export function resolveClientAssetUrl(url: string, baseUrl: string = import.meta.env.BASE_URL): string {
  if (!url.startsWith('/') || url.startsWith('//')) return url;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${url.slice(1)}`;
}
