import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const output = join(root, 'docs/final-patch-batch/workstream-01-localization-settings/PLAYER_FACING_LITERAL_INVENTORY.json');
const scanRoots = [
  'content/scenes',
  'content/hud',
  'content/relics',
  'content/upgrade-categories',
  'content/enemies',
  'src/client/ui',
  'src/client/presentation/sceneFlowPresenter.ts',
  'src/client/hud.ts',
  'src/client/hud',
  'src/client/progression',
  'src/client/tactical',
  'src/client/audio.ts',
];

interface LiteralEntry {
  file: string;
  line: number;
  field: string;
  value: string;
  localizationKey?: string;
}

function filesAt(path: string): string[] {
  const absolute = join(root, path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute).flatMap((name) => {
    const child = join(absolute, name);
    return statSync(child).isDirectory() ? filesAt(relative(root, child)) : [child];
  });
}

const authored: LiteralEntry[] = [];
for (const file of scanRoots.flatMap(filesAt).filter((path) => /\.(json|ts|css)$/.test(path))) {
  const source = readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  const displayFile = relative(root, file).replaceAll('\\', '/');
  if (file.endsWith('.json')) {
    const document = JSON.parse(source) as unknown;
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      const props = record.props && typeof record.props === 'object' ? record.props as Record<string, unknown> : {};
      for (const field of ['text', 'label', 'description', 'placeholder', 'title'] as const) {
        const literal = typeof record[field] === 'string' ? record[field] : typeof props[field] === 'string' ? props[field] : null;
        if (literal === null) continue;
        const encoded = JSON.stringify(literal);
        const line = Math.max(1, lines.findIndex((candidate) => candidate.includes(encoded)) + 1);
        const localizationKey = typeof record[`${field}Key`] === 'string' ? record[`${field}Key`] as string : undefined;
        authored.push({ file: displayFile, line, field, value: literal, ...(localizationKey ? { localizationKey } : {}) });
      }
      for (const [key, child] of Object.entries(record)) {
        if (key !== 'props') walk(child);
      }
    };
    walk(document);
    continue;
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    for (const match of line.matchAll(/(?:textContent|innerText|placeholder|title)\s*=\s*['"]([^'"]+)['"]/g)) {
      authored.push({
        file: displayFile,
        line: index + 1,
        field: 'sourceLiteral',
        value: match[1]!,
      });
    }
  }
}

const readCatalog = (locale: 'en' | 'ko'): Record<string, string> =>
  Object.assign({}, ...readdirSync(join(root, `content/locales/${locale}`))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(root, `content/locales/${locale}/${name}`), 'utf8')) as Record<string, string>));
const en = readCatalog('en');
const ko = readCatalog('ko');

const inventory = {
  schemaVersion: 1,
  baseSha: '4fd9af32605b04d8ff95f7d11bffc4c72885a988',
  generatedBy: 'npm run audit:localization',
  catalog: Object.keys(en).sort().map((key) => ({ key, en: en[key], ko: ko[key] ?? null })),
  authored,
  summary: {
    catalogKeyCount: Object.keys(en).length,
    koreanKeyCount: Object.keys(ko).length,
    authoredLiteralCount: authored.length,
    authoredWithLocalizationKey: authored.filter((entry) => entry.localizationKey).length,
    missingKoreanKeys: Object.keys(en).filter((key) => !(key in ko)),
    extraKoreanKeys: Object.keys(ko).filter((key) => !(key in en)),
  },
};

writeFileSync(output, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
console.log(`Wrote ${relative(root, output)} (${inventory.summary.catalogKeyCount} keys, ${authored.length} authored literals)`);
