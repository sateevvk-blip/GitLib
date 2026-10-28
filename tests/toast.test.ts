import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cssDuration } from '../src/client/lib/motion';
import { dismissToast, peekToasts, toast } from '../src/client/lib/toast';

const EXIT = cssDuration('--dur-quick');

describe('тосты: уход с анимацией', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
  });

  it('вне браузера длительности токенов — значения по умолчанию', () => {
    expect(cssDuration('--dur-quick')).toBe(150);
    expect(cssDuration('--dur-base')).toBe(250);
    expect(cssDuration('--dur-slow')).toBe(350);
  });

  it('закрытый тост сначала уходит, потом исчезает из списка', () => {
    toast('success', 'Сохранено');
    const { id } = peekToasts().at(-1)!;

    dismissToast(id);
    const leaving = peekToasts().find((t) => t.id === id);
    expect(leaving?.leaving).toBe(true);

    vi.advanceTimersByTime(EXIT - 1);
    expect(peekToasts().some((t) => t.id === id)).toBe(true);
    vi.advanceTimersByTime(1);
    expect(peekToasts().some((t) => t.id === id)).toBe(false);
  });

  it('повторное закрытие уходящего тоста ничего не ломает', () => {
    toast('info', 'Раз');
    toast('info', 'Два');
    const [first, second] = peekToasts().slice(-2);

    dismissToast(first!.id);
    dismissToast(first!.id);
    vi.advanceTimersByTime(EXIT);
    expect(peekToasts().map((t) => t.id)).toContain(second!.id);
    expect(peekToasts().some((t) => t.id === first!.id)).toBe(false);
  });

  it('по истечении срока тост уходит сам', () => {
    toast('error', 'Сбой');
    const { id } = peekToasts().at(-1)!;
    vi.advanceTimersByTime(7000);
    expect(peekToasts().find((t) => t.id === id)?.leaving).toBe(true);
    vi.advanceTimersByTime(EXIT);
    expect(peekToasts().some((t) => t.id === id)).toBe(false);
  });
});
