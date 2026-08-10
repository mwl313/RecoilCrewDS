import { describe, expect, it } from 'vitest';
import { resolveClientAssetUrl, resolveWebSocketUrl } from '../src/client/urlResolution';
import { isOriginAllowed, parseAllowedOrigins } from '../src/server/originPolicy';
import { normalizeBasePath } from '../vite.config';

describe('deployment URL resolution', () => {
  it('uses same-origin WSS for HTTPS pages by default', () => {
    expect(resolveWebSocketUrl(undefined, { protocol: 'https:', host: 'play.example.com' }))
      .toBe('wss://play.example.com/ws');
  });

  it('uses same-origin WS for HTTP pages by default', () => {
    expect(resolveWebSocketUrl('', { protocol: 'http:', host: 'localhost:5173' }))
      .toBe('ws://localhost:5173/ws');
  });

  it('uses an absolute configured multiplayer endpoint', () => {
    expect(resolveWebSocketUrl(' wss://game.example.com/ws ', { protocol: 'https:', host: 'pages.example' }))
      .toBe('wss://game.example.com/ws');
  });

  it('rejects configured non-WebSocket protocols and relative URLs', () => {
    expect(() => resolveWebSocketUrl('https://game.example.com/ws', { protocol: 'https:', host: 'pages.example' }))
      .toThrow(/ws: or wss:/);
    expect(() => resolveWebSocketUrl('/ws', { protocol: 'https:', host: 'pages.example' }))
      .toThrow(/absolute/);
  });

  it('normalizes deployment bases and prefixes only root-relative assets', () => {
    expect(normalizeBasePath(undefined)).toBe('/');
    expect(normalizeBasePath('/RecoilCrewDS/')).toBe('/RecoilCrewDS/');
    expect(resolveClientAssetUrl('/assets/model.glb', '/RecoilCrewDS/'))
      .toBe('/RecoilCrewDS/assets/model.glb');
    expect(resolveClientAssetUrl('https://cdn.example/model.glb', '/RecoilCrewDS/'))
      .toBe('https://cdn.example/model.glb');
  });
});

describe('WebSocket origin policy', () => {
  const allowed = parseAllowedOrigins('https://mwl313.github.io/, https://play.example.com');

  it('matches normalized origins exactly', () => {
    expect(isOriginAllowed('https://mwl313.github.io', allowed)).toBe(true);
    expect(isOriginAllowed('https://play.example.com', allowed)).toBe(true);
    expect(isOriginAllowed('https://play.example.com.evil.invalid', allowed)).toBe(false);
  });

  it('retains wildcard and non-browser client support', () => {
    expect(isOriginAllowed('http://localhost:5173', parseAllowedOrigins('*'))).toBe(true);
    expect(isOriginAllowed(undefined, allowed)).toBe(true);
  });
});
