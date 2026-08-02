import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyText, isValidRoomCode } from '../src/client/clipboard';

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

beforeEach(() => {
  const calls: string[] = [];
  const exec = (globalThis.document as { execCommand?: (c: string) => boolean } | undefined)?.execCommand;
  const clipboard = {
    writeText: (text: string) => {
      calls.push(text);
      return Promise.resolve();
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { clipboard, __calls: calls },
    configurable: true,
  });
  void exec;
});

afterEach(() => {
  Object.defineProperty(globalThis, 'navigator', { value: originalNavigator, configurable: true });
  Object.defineProperty(globalThis, 'document', { value: originalDocument, configurable: true });
});

describe('clipboard', () => {
  it('uses the secure Clipboard API and returns success', async () => {
    const nav = globalThis.navigator as unknown as { clipboard: { writeText(t: string): Promise<void> }; __calls: string[] };
    expect(await copyText('AB23CD')).toBe(true);
    expect(nav.__calls).toEqual(['AB23CD']);
  });

  it('falls back to textarea selection when the Clipboard API rejects', async () => {
    const nav = globalThis.navigator as unknown as { clipboard: { writeText(t: string): Promise<never> } };
    nav.clipboard.writeText = () => Promise.reject(new Error('denied'));
    let copied = '';
    const fakeDoc = {
      createElement: () => ({
        value: '',
        setAttribute() {},
        style: {},
        select() { copied = this.value; },
        setSelectionRange() {},
        remove() {},
      }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: (cmd: string) => cmd === 'copy',
    };
    Object.defineProperty(globalThis, 'document', { value: fakeDoc, configurable: true });
    expect(await copyText('AB23CD')).toBe(true);
    expect(copied).toBe('AB23CD');
  });

  it('falls back when the Clipboard API is missing entirely', async () => {
    const nav = globalThis.navigator as unknown as { clipboard?: unknown };
    delete nav.clipboard;
    let copied = '';
    const fakeDoc = {
      createElement: () => ({
        value: '',
        setAttribute() {},
        style: {},
        select() { copied = this.value; },
        setSelectionRange() {},
        remove() {},
      }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: (cmd: string) => cmd === 'copy',
    };
    Object.defineProperty(globalThis, 'document', { value: fakeDoc, configurable: true });
    expect(await copyText('CODE42')).toBe(true);
    expect(copied).toBe('CODE42');
  });

  it('reports failure when both paths fail', async () => {
    const nav = globalThis.navigator as unknown as { clipboard: { writeText(t: string): Promise<never> } };
    nav.clipboard.writeText = () => Promise.reject(new Error('denied'));
    const fakeDoc = {
      createElement: () => ({
        value: '',
        setAttribute() {},
        style: {},
        select() {},
        setSelectionRange() {},
        remove() {},
      }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false,
    };
    Object.defineProperty(globalThis, 'document', { value: fakeDoc, configurable: true });
    expect(await copyText('AB23CD')).toBe(false);
  });

  it('validates six-character room codes', () => {
    expect(isValidRoomCode('AB23CD')).toBe(true);
    expect(isValidRoomCode('AB12CD')).toBe(false); // alphabet excludes 0/1
    expect(isValidRoomCode('------')).toBe(false);
    expect(isValidRoomCode('AB23C')).toBe(false);
    expect(isValidRoomCode('AB23CDE')).toBe(false);
  });
});
