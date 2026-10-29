import { describe, expect, it } from 'vitest';
import { applyMarkdown, continueList, toggleTask } from '../src/client/lib/markdown-edit';

describe('заметки: обёртки', () => {
  it('оборачивает выделение в **…**', () => {
    expect(applyMarkdown({ text: 'hello world', start: 0, end: 5 }, 'bold')).toEqual({ text: '**hello** world', start: 2, end: 7 });
  });

  it('снимает обёртку, если маркеры выделены вместе с текстом', () => {
    expect(applyMarkdown({ text: '**hello** world', start: 0, end: 9 }, 'bold')).toEqual({ text: 'hello world', start: 0, end: 5 });
  });

  it('снимает обёртку, если маркеры стоят вокруг выделения', () => {
    expect(applyMarkdown({ text: '**hello** world', start: 2, end: 7 }, 'bold')).toEqual({ text: 'hello world', start: 0, end: 5 });
  });

  it('без выделения ставит пустые маркеры и курсор между ними', () => {
    expect(applyMarkdown({ text: 'ab', start: 1, end: 1 }, 'italic')).toEqual({ text: 'a__b', start: 2, end: 2 });
    expect(applyMarkdown({ text: '', start: 0, end: 0 }, 'code')).toEqual({ text: '``', start: 1, end: 1 });
  });

  it('зачёркивание — ~~', () => {
    expect(applyMarkdown({ text: 'x', start: 0, end: 1 }, 'strike').text).toBe('~~x~~');
  });
});

describe('заметки: префиксы строк', () => {
  it('заголовок добавляется к строке курсора и снимается повторно', () => {
    const on = applyMarkdown({ text: 'строка', start: 3, end: 3 }, 'heading');
    expect(on).toEqual({ text: '## строка', start: 0, end: 9 });
    expect(applyMarkdown({ text: on.text, start: 3, end: 3 }, 'heading')).toEqual({ text: 'строка', start: 0, end: 6 });
  });

  it('список охватывает все выделенные строки', () => {
    expect(applyMarkdown({ text: 'a\nb', start: 0, end: 3 }, 'ul')).toEqual({ text: '- a\n- b', start: 0, end: 7 });
    expect(applyMarkdown({ text: 'a\nb', start: 0, end: 3 }, 'ol').text).toBe('1. a\n2. b');
    expect(applyMarkdown({ text: 'a\nb', start: 0, end: 3 }, 'task').text).toBe('- [ ] a\n- [ ] b');
    expect(applyMarkdown({ text: 'a', start: 0, end: 1 }, 'quote').text).toBe('> a');
  });

  it('смена типа списка заменяет маркер, а не добавляет второй', () => {
    expect(applyMarkdown({ text: '1. a\n2. b', start: 0, end: 9 }, 'ul').text).toBe('- a\n- b');
    expect(applyMarkdown({ text: '- a', start: 0, end: 3 }, 'task').text).toBe('- [ ] a');
    expect(applyMarkdown({ text: '- [ ] a', start: 0, end: 7 }, 'ul').text).toBe('- a');
    expect(applyMarkdown({ text: '> a', start: 0, end: 3 }, 'ul').text).toBe('- a');
  });

  it('повторное нажатие снимает список', () => {
    expect(applyMarkdown({ text: '- a\n- b', start: 0, end: 7 }, 'ul').text).toBe('a\nb');
    expect(applyMarkdown({ text: '- [x] a', start: 0, end: 7 }, 'task').text).toBe('a');
  });
});

describe('заметки: ссылка и блок кода', () => {
  it('выделенный URL превращается в ссылку с курсором в подписи', () => {
    expect(applyMarkdown({ text: 'see https://x.io ok', start: 4, end: 16 }, 'link')).toEqual({ text: 'see [](https://x.io) ok', start: 5, end: 5 });
  });

  it('выделенный текст становится подписью, выделяется url', () => {
    expect(applyMarkdown({ text: 'word', start: 0, end: 4 }, 'link')).toEqual({ text: '[word](url)', start: 7, end: 10 });
  });

  it('без выделения вставляется шаблон с выделенной подписью', () => {
    expect(applyMarkdown({ text: '', start: 0, end: 0 }, 'link')).toEqual({ text: '[текст](url)', start: 1, end: 6 });
  });

  it('блок кода ставится на отдельные строки', () => {
    expect(applyMarkdown({ text: 'x\ncode\ny', start: 2, end: 6 }, 'codeblock')).toEqual({ text: 'x\n```\ncode\n```\ny', start: 6, end: 10 });
    expect(applyMarkdown({ text: 'x code', start: 2, end: 6 }, 'codeblock').text).toBe('x \n```\ncode\n```');
  });
});

describe('заметки: Enter в списке', () => {
  it('продолжает маркированный, нумерованный и чек-лист', () => {
    expect(continueList('- a', 3)).toEqual({ text: '- a\n- ', start: 6, end: 6 });
    expect(continueList('2. a', 4)).toEqual({ text: '2. a\n3. ', start: 8, end: 8 });
    expect(continueList('- [x] a', 7)).toEqual({ text: '- [x] a\n- [ ] ', start: 14, end: 14 });
    expect(continueList('  - a', 5)?.text).toBe('  - a\n  - ');
  });

  it('пустой пункт завершает список', () => {
    expect(continueList('x\n- ', 4)).toEqual({ text: 'x\n', start: 2, end: 2 });
    expect(continueList('1. ', 3)).toEqual({ text: '', start: 0, end: 0 });
  });

  it('вне списка ничего не делает', () => {
    expect(continueList('text', 4)).toBeNull();
    expect(continueList('', 0)).toBeNull();
  });
});

describe('заметки: чек-боксы из просмотра', () => {
  it('переключает нужный по порядку', () => {
    expect(toggleTask('- [ ] a\n- [ ] b', 1)).toBe('- [ ] a\n- [x] b');
    expect(toggleTask('- [x] a', 0)).toBe('- [ ] a');
    expect(toggleTask('1. [ ] a', 0)).toBe('1. [x] a');
  });

  it('не считает строки внутри блоков кода', () => {
    expect(toggleTask('```\n- [ ] no\n```\n- [ ] yes', 0)).toBe('```\n- [ ] no\n```\n- [x] yes');
  });

  it('индекс за пределами — текст без изменений', () => {
    expect(toggleTask('- [ ] a', 3)).toBe('- [ ] a');
  });
});
