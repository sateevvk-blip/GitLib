import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { ToolsService } from '../tools/service.js';
import { CHAT_HISTORY_LIMIT, CHAT_MESSAGE_MAX_CHARS, type ToolQuery, type ToolSortKey } from '../../shared/types.js';
import { ValidationError } from '../errors.js';

const SORT_KEYS: ToolSortKey[] = ['added', 'updated', 'name'];

/** Повторяющиеся параметры (?tags=a&tags=b); по запятой не делим: категории и теги — свободный текст. */
function many(v: unknown): string[] | undefined {
  const list = (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
  if (list.length > 100 || list.some((x) => x.length > 300)) throw new ValidationError('Слишком много значений фильтра или значение слишком длинное');
  return list.length ? list : undefined;
}

// shortcut: parseBody дублирует routes/repos.ts (не мой файл в T6); вынести в routes/util.ts при ближайшей правке repos.ts.
function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ValidationError(`${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? 'некорректные данные'}`);
  }
  return r.data;
}

const flag = (v: unknown): boolean => v === '1' || v === 'true';

function parseQuery(raw: Record<string, unknown>): ToolQuery {
  const sort = typeof raw.sort === 'string' && SORT_KEYS.includes(raw.sort as ToolSortKey) ? (raw.sort as ToolSortKey) : 'added';
  return {
    q: typeof raw.q === 'string' ? raw.q : undefined,
    categories: many(raw.categories),
    tags: many(raw.tags),
    favorite: flag(raw.favorite),
    drafts: flag(raw.drafts),
    noAnalysis: flag(raw.noAnalysis),
    sort,
  };
}

const AddBody = z
  .object({
    url: z.string().min(1, 'Введите адрес сайта').max(2000),
    manual: z
      .object({
        title: z.string().trim().min(1, 'Введите название').max(300),
        description: z.string().max(2000).optional(),
        category: z.string().max(100).optional(),
        tags: z.array(z.string().max(100)).max(100).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const text = (max: number) => z.string().max(max).nullable().optional();
const list = z.array(z.string().max(500)).max(50).nullable().optional();
// imagePath намеренно нет: строгая схема отвечает на него 400, картинка меняется только через PUT /image.
const PatchBody = z
  .object({
    title: text(300),
    description: text(2000),
    category: text(100),
    tags: z.array(z.string().max(100)).max(100).optional(),
    notes: z.string().max(100_000).optional(),
    favorite: z.boolean().optional(),
    confirmed: z.boolean().optional(),
    overrides: z
      .object({
        summary: text(2000),
        purpose: text(2000),
        audience: text(2000),
        features: list,
        useCases: list,
        limitations: list,
      })
      .strict()
      .optional(),
  })
  .strict();

const ImageBody = z.object({ imageUrl: z.string().max(2000).nullable() }).strict();

const ChatBody = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARS), sources: z.array(z.string().max(500)).max(50).optional() }).strict())
      .min(1, 'Нужен хотя бы один вопрос')
      .max(CHAT_HISTORY_LIMIT * 2),
  })
  .strict();

const RecommendBody = z.object({ task: z.string().trim().min(3, 'Опишите задачу хотя бы в трёх символах').max(1000) }).strict();

export function registerToolRoutes(app: FastifyInstance, service: ToolsService): void {
  app.get('/api/tools', async (req) => {
    const items = service.list(parseQuery(req.query as Record<string, unknown>));
    return { items, total: items.length };
  });

  // Статические пути — раньше /api/tools/:id.
  app.get('/api/tools/facets', async () => service.facets());

  app.post('/api/tools/recommend', async (req) => {
    const { task } = parseBody(RecommendBody, req.body);
    return service.recommend(task);
  });

  app.post('/api/tools', async (req, reply) => {
    const { url, manual } = parseBody(AddBody, req.body);
    const tool = manual ? service.addManual(url, manual) : await service.add(url);
    return reply.status(201).send(tool);
  });

  app.get<{ Params: { id: string } }>('/api/tools/:id', async (req) => service.get(req.params.id));

  app.patch<{ Params: { id: string } }>('/api/tools/:id', async (req) => {
    const patch = parseBody(PatchBody, req.body);
    return service.updateUser(req.params.id, patch);
  });

  app.delete<{ Params: { id: string } }>('/api/tools/:id', async (req, reply) => {
    service.delete(req.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/tools/:id/refresh', async (req) => service.refreshSource(req.params.id));

  app.post<{ Params: { id: string }; Querystring: { wait?: string } }>('/api/tools/:id/analyze', async (req) => {
    // wait=1 запускает анализ здесь же, без очереди — иначе он выполнится дважды.
    const wait = req.query.wait === '1';
    const tool = service.requestAnalysis(req.params.id, !wait);
    return wait ? service.runAnalysis(req.params.id) : tool;
  });

  app.put<{ Params: { id: string } }>('/api/tools/:id/image', async (req) => {
    const { imageUrl } = parseBody(ImageBody, req.body);
    return service.setImage(req.params.id, imageUrl);
  });

  app.post<{ Params: { id: string } }>('/api/tools/:id/chat', async (req) => {
    const { messages } = parseBody(ChatBody, req.body);
    return service.chat(req.params.id, messages);
  });
}
