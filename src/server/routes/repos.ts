import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LibraryService } from '../library/service.js';
import { CHAT_HISTORY_LIMIT, CHAT_MESSAGE_MAX_CHARS, REPO_STATUSES, type LibraryQuery, type SortKey } from '../../shared/types.js';
import { ValidationError } from '../errors.js';

const SORT_KEYS: SortKey[] = ['added', 'updated', 'stars', 'name', 'pushed'];

function csv(v: unknown): string[] | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseQuery(raw: Record<string, unknown>): LibraryQuery {
  const statuses = csv(raw.statuses)?.filter((s): s is (typeof REPO_STATUSES)[number] =>
    (REPO_STATUSES as readonly string[]).includes(s),
  );
  const sort = typeof raw.sort === 'string' && SORT_KEYS.includes(raw.sort as SortKey) ? (raw.sort as SortKey) : 'added';
  return {
    q: typeof raw.q === 'string' ? raw.q : undefined,
    topics: csv(raw.topics),
    languages: csv(raw.languages),
    statuses,
    favorite: raw.favorite === '1' || raw.favorite === 'true',
    noAnalysis: raw.noAnalysis === '1' || raw.noAnalysis === 'true',
    collectionId: typeof raw.collection === 'string' && raw.collection ? raw.collection : undefined,
    sort,
  };
}

const AddBody = z.object({ input: z.string().min(1, 'Введите ссылку или owner/repo') });
const PatchBody = z
  .object({
    notes: z.string().max(100_000).optional(),
    topics: z.array(z.string().max(100)).max(100).optional(),
    status: z.enum(REPO_STATUSES).optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

const ChatBody = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(CHAT_MESSAGE_MAX_CHARS), sources: z.array(z.string().max(500)).max(50).optional() }).strict())
      .min(1, 'Нужен хотя бы один вопрос')
      .max(CHAT_HISTORY_LIMIT * 2),
  })
  .strict();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new ValidationError(`${issue?.path.join('.') ?? 'body'}: ${issue?.message ?? 'некорректные данные'}`);
  }
  return r.data;
}

export function registerRepoRoutes(app: FastifyInstance, service: LibraryService): void {
  app.get('/api/repos', async (req) => {
    const query = parseQuery(req.query as Record<string, unknown>);
    const items = service.list(query);
    return { items, total: items.length };
  });

  app.get('/api/facets', async () => service.facets());

  app.post('/api/repos', async (req, reply) => {
    const { input } = parseBody(AddBody, req.body);
    const repo = await service.add(input);
    return reply.status(201).send(repo);
  });

  app.get<{ Params: { id: string } }>('/api/repos/:id', async (req) => service.get(req.params.id));

  app.patch<{ Params: { id: string } }>('/api/repos/:id', async (req) => {
    const patch = parseBody(PatchBody, req.body);
    return service.updateUser(req.params.id, patch);
  });

  app.delete<{ Params: { id: string } }>('/api/repos/:id', async (req, reply) => {
    service.delete(req.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/repos/:id/refresh', async (req) => service.refresh(req.params.id));

  app.post<{ Params: { id: string }; Querystring: { wait?: string } }>('/api/repos/:id/analyze', async (req) => {
    const repo = service.requestAnalysis(req.params.id);
    if (req.query.wait === '1') return service.runAnalysis(req.params.id);
    return repo;
  });

  app.post<{ Params: { id: string } }>('/api/repos/:id/chat', async (req) => {
    const { messages } = parseBody(ChatBody, req.body);
    return service.chat(req.params.id, messages);
  });
}
