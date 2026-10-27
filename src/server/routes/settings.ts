import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SettingsStore } from '../settings.js';
import { probeGithub } from '../github/client.js';
import { probeLlm } from '../ai/analyzer.js';
import { ValidationError } from '../errors.js';
import type { ConnectivityStatus } from '../../shared/types.js';

const PatchBody = z
  .object({
    githubToken: z.string().max(500).nullable().optional(),
    llmBaseUrl: z.string().max(500).optional(),
    llmModel: z.string().max(200).optional(),
    llmApiKey: z.string().max(500).nullable().optional(),
    llmTimeoutSec: z.number().optional(),
  })
  .strict();

export function registerSettingsRoutes(app: FastifyInstance, settings: SettingsStore): void {
  app.get('/api/settings', async () => settings.toPublic());

  app.put('/api/settings', async (req) => {
    const r = PatchBody.safeParse(req.body);
    if (!r.success) throw new ValidationError(r.error.issues[0]?.message ?? 'Некорректные данные');
    return settings.update(r.data);
  });

  app.get('/api/status/connectivity', async (): Promise<ConnectivityStatus> => {
    const s = settings.get();
    const [github, llm] = await Promise.all([probeGithub(s.githubToken), probeLlm(s)]);
    return { github, llm };
  });

  app.post('/api/settings/test/github', async () => probeGithub(settings.get().githubToken));
  app.post('/api/settings/test/llm', async () => probeLlm(settings.get()));
}
