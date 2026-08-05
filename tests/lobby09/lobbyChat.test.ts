import { describe, expect, it } from 'vitest';
import { LOBBY_CHAT_MAX_MESSAGES } from '../../src/shared/lobby/lobbyTypes';
import { createAndJoin, FakeSocket, makeManager } from './helpers';

describe('lobby09 chat', () => {
  it('stores room-local chat with sender identity from the server', () => {
    const { manager, a, b } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbyChatSend', text: 'hello <b>crew</b>' });
    const chat = b.last('lobbyState')!.chat as Array<{ playerId: string; displayName: string; text: string }>;
    expect(chat.length).toBe(1);
    expect(chat[0].text).toBe('hello <b>crew</b>');
    expect(chat[0].displayName).toBe('TurboToad07');
  });

  it('rejects empty and control-character messages', () => {
    const { manager, a } = createAndJoin(makeManager().manager);
    manager.handle(a, { t: 'lobbyChatSend', text: '   ' });
    manager.handle(a, { t: 'lobbyChatSend', text: 'bad\u0000text' });
    const chat = a.last('lobbyState')!.chat as unknown[];
    expect(chat.length).toBe(0);
  });

  it('rate limits bursts (burst 4, refill 1 per 2s)', () => {
    const env = makeManager();
    const { a } = createAndJoin(env.manager);
    for (let i = 0; i < 4; i++) env.manager.handle(a, { t: 'lobbyChatSend', text: `msg${i}` });
    env.manager.handle(a, { t: 'lobbyChatSend', text: 'overflow' });
    expect(a.last('error')!.code).toBe('rate_limited');
    env.advance(2000);
    env.manager.handle(a, { t: 'lobbyChatSend', text: 'refilled' });
    const chat = a.last('lobbyState')!.chat as Array<{ text: string }>;
    expect(chat.some((m) => m.text === 'refilled')).toBe(true);
  });

  it('bounds retained history', () => {
    const env = makeManager();
    const { a, b } = createAndJoin(env.manager);
    let sent = 0;
    for (let round = 0; round < LOBBY_CHAT_MAX_MESSAGES + 5; round++) {
      env.advance(2000);
      env.manager.handle(a, { t: 'lobbyChatSend', text: `m${sent++}` });
    }
    const chat = b.last('lobbyState')!.chat as unknown[];
    expect(chat.length).toBe(LOBBY_CHAT_MAX_MESSAGES);
  });
});

describe('lobby09 chat validation unit', () => {
  it('limits 200 code points', async () => {
    const { validateChatText } = await import('../../src/shared/lobby/lobbyValidation');
    expect(validateChatText('a'.repeat(200)).valid).toBe(true);
    expect(validateChatText('a'.repeat(201)).reason).toBe('too_long');
    expect(validateChatText('👾'.repeat(201)).reason).toBe('too_long');
  });
});

void FakeSocket;
