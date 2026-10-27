import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LibraryService } from '../library/service.js';
import { ValidationError } from '../errors.js';

const CreateBody = z.object({ name: z.string().min(1).max(120), description: z.string().max(2000).optional() });
const PatchBody = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).optional(),
    repoIds: z.array(z.string()).optional(),
  })
  .strict();
const MemberBody = z.object({ repoId: z.string().min(1) });

function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Некорректные данные');
  return r.data;
}

export function registerCollectionRoutes(app: FastifyInstance, service: LibraryService): void {
  app.get('/api/collections', async () => service.listCollections());

  app.post('/api/collections', async (req, reply) => {
    const body = parse(CreateBody, req.body);
    return reply.status(201).send(service.createCollection(body.name, body.description ?? ''));
  });

  app.patch<{ Params: { id: string } }>('/api/collections/:id', async (req) => {
    const body = parse(PatchBody, req.body);
    return service.updateCollection(req.params.id, body);
  });

  app.delete<{ Params: { id: string } }>('/api/collections/:id', async (req, reply) => {
    service.deleteCollection(req.params.id);
    return reply.status(204).send();
  });

  app.post<{ Params: { id: string } }>('/api/collections/:id/repos', async (req) => {
    const { repoId } = parse(MemberBody, req.body);
    return service.setRepoInCollection(req.params.id, repoId, true);
  });

  app.delete<{ Params: { id: string; repoId: string } }>('/api/collections/:id/repos/:repoId', async (req) => {
    return service.setRepoInCollection(req.params.id, req.params.repoId, false);
  });
}
