import type { InterpolationParams } from './localizationTypes';

const TOKEN = /\{([^{}]+)\}/g;

export function interpolationTokens(value: string): string[] {
  return [...value.matchAll(TOKEN)].map((match) => match[1]!).sort();
}

export function interpolate(value: string, params: InterpolationParams = {}): string {
  return value.replace(TOKEN, (token, name: string) => {
    const replacement = params[name];
    return replacement === undefined ? token : String(replacement);
  });
}
