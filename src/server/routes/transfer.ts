import type { FastifyInstance } from 'fastify';
import { applyImport, buildExport, parseExportFile, previewImport, type TransferDeps } from '../transfer/transfer.js';
import { ValidationError } from '../errors.js';
import type { DuplicateStrategy } from '../../shared/types.js';

const STRATEGIES: DuplicateStrategy[] = ['skip', 'merge', 'replace'];

export function registerTransferRoutes(app: FastifyInstance, deps: TransferDeps): void {
  app.get('/api/export', async (_req, reply) => {
    const data = buildExport(deps);
    const stamp = data.exportedAt.slice(0, 19).replace(/[:T]/g, '-');
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="gitlib-${stamp}.json"`)
      .send(JSON.stringify(data, null, 2));
  });

  app.post('/api/import/preview', async (req) => {
    const file = parseExportFile(req.body);
    return previewImport(deps.store, file);
  });

  app.post<{ Querystring: { strategy?: string } }>('/api/import', async (req) => {
    const strategy = (req.query.strategy ?? 'merge') as DuplicateStrategy;
    if (!STRATEGIES.includes(strategy)) throw new ValidationError(`Неизвестная стратегия импорта: ${strategy}`);
    const file = parseExportFile(req.body);
    return applyImport(deps, file, strategy);
  });
}
