import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../src/shared/types.js';
import { scrollAnchor } from '../src/client/mascot/chat';

const u = (content: string): ChatMessage => ({ role: 'user', content });
const a = (content: string): ChatMessage => ({ role: 'assistant', content });

describe('чат: куда прокручивать журнал', () => {
  it('пришёл ответ — к вопросу пользователя', () => {
    expect(scrollAnchor(1, [u('что это?'), a('это…')])).toBe('question');
  });

  it('отправлен свой вопрос — в конец', () => {
    expect(scrollAnchor(0, [u('что это?')])).toBe('bottom');
    expect(scrollAnchor(2, [u('а'), a('б'), u('в')])).toBe('bottom');
  });

  it('панель открыта с готовой историей — в конец', () => {
    const history = [u('а'), a('б')];
    expect(scrollAnchor(history.length, history)).toBe('bottom');
  });

  it('история очищена — в конец', () => {
    expect(scrollAnchor(4, [])).toBe('bottom');
  });
});
