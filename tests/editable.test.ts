import { describe, expect, it } from 'vitest';
import { decideSave, parseListInput, sameValue, toDraft } from '../src/client/lib/editable';

describe('правка полей сводки: список', () => {
  it('режет по строкам, убирает маркеры и пустые строки', () => {
    expect(parseListInput('- один\n• два\n\n  * три  \r\nчетыре-пять\n-')).toEqual(['один', 'два', 'три', 'четыре-пять', '-']);
  });

  it('черновик списка — по пункту на строку', () => {
    expect(toDraft(['а', 'б'])).toBe('а\nб');
    expect(toDraft('текст')).toBe('текст');
    expect(toDraft(null)).toBe('');
  });
});

describe('правка полей сводки: решение при «Сохранить»', () => {
  it('текст, равный версии AI после trim, — сброс, а не правка', () => {
    expect(decideSave('text', '  Сводка модели \n', 'Сводка модели')).toEqual({ type: 'reset' });
  });

  it('другой текст сохраняется обрезанным', () => {
    expect(decideSave('text', '  своё  ', 'Сводка модели')).toEqual({ type: 'save', value: 'своё' });
    expect(decideSave('text', 'своё', null)).toEqual({ type: 'save', value: 'своё' });
  });

  it('пустой текст при наличии версии AI не сохраняется, без неё — снимает правку', () => {
    expect(decideSave('text', '   ', 'Сводка модели')).toEqual({ type: 'blocked', reason: 'empty' });
    expect(decideSave('text', '   ', null)).toEqual({ type: 'reset' });
  });

  it('список, равный версии AI, — сброс; пустой список при непустой версии AI — правка «пунктов нет»', () => {
    expect(decideSave('list', '- а\nб', ['а', 'б'])).toEqual({ type: 'reset' });
    expect(decideSave('list', '', ['а'])).toEqual({ type: 'save', value: [] });
    expect(decideSave('list', '', null)).toEqual({ type: 'reset' });
    expect(decideSave('list', 'б\nа', ['а', 'б'])).toEqual({ type: 'save', value: ['б', 'а'] });
  });

  it('слишком длинное не сохраняется: лимиты сервера', () => {
    expect(decideSave('text', 'я'.repeat(2001), null)).toEqual({ type: 'blocked', reason: 'long' });
    expect(decideSave('list', 'я'.repeat(501), null)).toEqual({ type: 'blocked', reason: 'long' });
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `п${i}`).join('\n');
    expect(decideSave('list', lines(51), null)).toEqual({ type: 'blocked', reason: 'long' });
    expect(decideSave('list', lines(50), null).type).toBe('save');
  });

  it('sameValue: пустой список равен отсутствию, текст сравнивается без пробелов по краям', () => {
    expect(sameValue([], null)).toBe(true);
    expect(sameValue(' a ', 'a')).toBe(true);
    expect(sameValue(['a'], ['a', 'b'])).toBe(false);
  });
});
