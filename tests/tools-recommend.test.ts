import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/server/db/database.js';
import { ToolsStore } from '../src/server/tools/store.js';
import { ToolsService } from '../src/server/tools/service.js';
import { LlmError } from '../src/server/errors.js';
import { config } from '../src/server/config.js';
import type { chatAboutTool, rankTools } from '../src/server/ai/tool-analyzer.js';
import { newToolUser } from '../src/shared/merge.js';
import type { ChatMessage } from '../src/shared/types.js';
import { makeSettings, makeSource, makeTool, tempDataDir } from './helpers.js';

type Rank = typeof rankTools;
type Fake = (task: string, c: Parameters<Rank>[1]) => Promise<Omit<Awaited<ReturnType<Rank>>, 'shown'> & { shown?: string[] }>;
type Chat = typeof chatAboutTool;

function setup(o: { llm?: boolean; rank?: Fake; chat?: Chat } = {}) {
  const dataDir = tempDataDir();
  const db = openDatabase(path.join(dataDir, 'gitlib.sqlite'));
  const store = new ToolsStore(db);
  const settings = makeSettings(dataDir, o.llm === false ? {} : { LLM_BASE_URL: 'http://llm.local/v1', LLM_MODEL: 'mock' });
  const service = new ToolsService({ store, settings, imagesDir: path.join(dataDir, 'tool-images'), ai: { ...(o.rank && { rankTools: (async (t, c) => ({ shown: c.map((x) => x.id), ...(await o.rank!(t, c)) })) as Rank }), ...(o.chat && { chatAboutTool: o.chat }) } });
  const add = (url: string, title: string, extra = {}) => {
    const t = makeTool(url, { source: makeSource({ title }), ...extra });
    store.insert(t);
    return t;
  };
  return { service, add };
}

describe('recommend', () => {
  it('пустая библиотека: модель не вызывается, items пуст', async () => {
    let called = 0;
    const { service } = setup({ rank: async () => (called++, { matches: [], comment: null }) });
    const r = await service.recommend('нужен редактор схем');
    expect(called).toBe(0);
    expect(r.items).toEqual([]);
    expect(r.notice).toBe('В библиотеке пока нет инструментов');
  });

  it('выдуманный id и дубликаты отбрасываются, порядок и причины модели сохраняются', async () => {
    const s = setup({
      rank: async () => ({
        matches: [
          { id: 'выдуманный', reason: 'нет такого', fit: 'high' },
          { id: 'real-b', reason: 'подходит', fit: 'high' },
          { id: 'real-a', reason: 'тоже', fit: 'medium' },
        ],
        comment: 'Вот что нашлось',
      }),
    });
    s.add('https://a.example', 'A', { id: 'real-a' });
    s.add('https://b.example', 'B', { id: 'real-b' });
    const r = await s.service.recommend('что-нибудь про схемы');
    expect(r.mode).toBe('ai');
    expect(r.items.map((i) => [i.tool.id, i.reason, i.fit])).toEqual([
      ['real-b', 'подходит', 'high'],
      ['real-a', 'тоже', 'medium'],
    ]);
    expect(r.comment).toBe('Вот что нашлось');
    expect(r.items[0]!.tool.source).not.toHaveProperty('text');
  });

  it('id вне списка кандидатов (карточка есть в библиотеке, но не передана модели) тоже отбрасывается', async () => {
    const max = config.toolRecommendMaxCandidates;
    let sent: string[] = [];
    const everyId = ['hit', ...Array.from({ length: max + 5 }, (_, i) => `n${i}`)];
    const s = setup({
      rank: async (_t, candidates) => {
        sent = candidates.map((c) => c.id);
        return { matches: everyId.map((id) => ({ id, reason: null, fit: null })), comment: null };
      },
    });
    s.add('https://hit.example', 'Диаграммы', { id: 'hit' });
    for (let i = 0; i < max + 5; i++) s.add(`https://n${i}.example`, `Прочее ${i}`, { id: `n${i}` });
    const r = await s.service.recommend('диаграммы');
    expect(sent).toHaveLength(max);
    expect(sent[0]).toBe('hit');
    expect(r.items.map((i) => i.tool.id).sort()).toEqual([...sent].sort());
  });

  it('при нулевом скоре у всех и большой библиотеке уходят самые свежие', async () => {
    const max = config.toolRecommendMaxCandidates;
    let sent: string[] = [];
    const s = setup({ rank: async (_t, c) => ((sent = c.map((x) => x.id)), { matches: [], comment: 'нет' }) });
    for (let i = 0; i < max + 3; i++) {
      s.add(`https://z${i}.example`, `Zzz ${i}`, { id: `z${i}`, user: newToolUser(new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()) });
    }
    const r = await s.service.recommend('совсем другое');
    expect(sent).toHaveLength(max);
    expect(sent[0]).toBe(`z${max + 2}`); // самая свежая
    expect(sent).not.toContain('z0');
    expect(r.items).toEqual([]);
    expect(r.comment).toBe('нет');
  });

  it('библиотека в пределах лимита: модели уходят все карточки', async () => {
    let sent = 0;
    const s = setup({ rank: async (_t, c) => ((sent = c.length), { matches: [], comment: null }) });
    s.add('https://a.example', 'A');
    s.add('https://b.example', 'B');
    await s.service.recommend('нечто несвязанное');
    expect(sent).toBe(2);
  });

  it('сбой модели → mode search, карточки с ненулевым скором без reason', async () => {
    const s = setup({
      rank: async () => {
        throw new LlmError('сбой', 'llm_failed');
      },
    });
    s.add('https://diagrams.example', 'Diagrams editor');
    s.add('https://other.example', 'Other');
    const r = await s.service.recommend('diagrams');
    expect(r.mode).toBe('search');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ reason: null, fit: null });
    expect(r.notice).toContain('поиск по словам');
  });

  it('без LLM: mode search, модель не вызывается', async () => {
    let called = 0;
    const s = setup({ llm: false, rank: async () => (called++, { matches: [], comment: null }) });
    s.add('https://diagrams.example', 'Diagrams editor');
    const r = await s.service.recommend('diagrams');
    expect(called).toBe(0);
    expect(r.mode).toBe('search');
    expect(r.items).toHaveLength(1);
    expect(r.notice).toBe('LLM не настроена — показан поиск по словам');
  });

  it('пустой matches → items пуст и комментарий модели', async () => {
    const s = setup({ rank: async () => ({ matches: [], comment: 'Ничего не подходит' }) });
    s.add('https://a.example', 'A');
    const r = await s.service.recommend('квантовый компьютер');
    expect(r).toMatchObject({ mode: 'ai', items: [], comment: 'Ничего не подходит' });
  });
});

describe('chat', () => {
  const ask: ChatMessage[] = [{ role: 'user', content: 'Что это?' }];

  it('ответ с источником-страницей; ok без notice', async () => {
    const s = setup({ chat: async () => ({ reply: 'Ответ', model: 'mock' }) });
    const t = s.add('https://a.example', 'A');
    expect(await s.service.chat(t.id, ask)).toEqual({ reply: 'Ответ', model: 'mock', sources: ['https://a.example/'], notice: null });
  });

  it('текста нет (любой статус): sources пуст, notice «только по карточке»', async () => {
    const s = setup({ chat: async () => ({ reply: 'Ответ', model: 'mock' }) });
    const t = s.add('https://m.example', 'M', { source: makeSource({ status: 'manual', text: null }) });
    const r = await s.service.chat(t.id, ask);
    expect(r.sources).toEqual([]);
    expect(r.notice).toBe('Ответ только по карточке: текст страницы не сохранён');
    const p = s.add('https://p.example', 'P', { source: makeSource({ status: 'partial', text: null }) });
    expect((await s.service.chat(p.id, ask)).notice).toBe('Ответ только по карточке: текст страницы не сохранён');
  });

  it('partial с текстом: источник есть, notice о неполном тексте', async () => {
    const s = setup({ chat: async () => ({ reply: 'Ответ', model: 'mock' }) });
    const t = s.add('https://p.example', 'P', { source: makeSource({ status: 'partial', text: 'кусок текста' }) });
    const r = await s.service.chat(t.id, ask);
    expect(r.sources).toEqual(['https://p.example/']);
    expect(r.notice).toBe('Текст страницы сохранён не полностью — ответ может быть неточным');
  });

  it('без LLM — 400, последнее сообщение не от пользователя — 400, нет записи — 404', async () => {
    const off = setup({ llm: false });
    const t = off.add('https://a.example', 'A');
    await expect(off.service.chat(t.id, ask)).rejects.toMatchObject({ statusCode: 400 });
    const on = setup({ chat: async () => ({ reply: 'x', model: 'm' }) });
    const t2 = on.add('https://b.example', 'B');
    await expect(on.service.chat(t2.id, [{ role: 'assistant', content: 'привет' }])).rejects.toMatchObject({ statusCode: 400 });
    await expect(on.service.chat('нет', ask)).rejects.toMatchObject({ statusCode: 404 });
  });
});
