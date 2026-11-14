import type { DatabaseSync } from 'node:sqlite';
import type { Tool, ToolAnalysis, ToolSource, ToolSummary } from '../../shared/types.js';

interface ToolRow {
  id: string;
  key: string;
  url: string;
  domain: string;
  source_json: string;
  source_text: string | null;
  analysis_json: string;
  user_json: string;
  added_at: string;
}

type SummaryRow = Omit<ToolRow, 'source_text'>;

function rowToSummary(row: SummaryRow): ToolSummary {
  return {
    id: row.id,
    url: row.url,
    key: row.key,
    domain: row.domain,
    source: JSON.parse(row.source_json) as ToolSummary['source'],
    analysis: JSON.parse(row.analysis_json),
    user: JSON.parse(row.user_json),
  };
}

function rowToTool(row: ToolRow): Tool {
  const source = JSON.parse(row.source_json) as Omit<ToolSource, 'text'>;
  return { ...rowToSummary(row), source: { ...source, text: row.source_text } };
}

const SUMMARY_SELECT = 'SELECT id, key, url, domain, source_json, analysis_json, user_json, added_at FROM tools';

/**
 * Хранилище инструментов поверх SQLite. Не знает ни о сети, ни о LLM, ни о файлах — только данные.
 */
export class ToolsStore {
  constructor(private readonly db: DatabaseSync) {}

  listSummaries(): ToolSummary[] {
    const rows = this.db.prepare(`${SUMMARY_SELECT} ORDER BY added_at DESC`).all() as unknown as SummaryRow[];
    return rows.map(rowToSummary);
  }

  listAll(): Tool[] {
    const rows = this.db.prepare('SELECT * FROM tools ORDER BY added_at DESC').all() as unknown as ToolRow[];
    return rows.map(rowToTool);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM tools').get() as { n: number }).n;
  }

  getById(id: string): Tool | null {
    const row = this.db.prepare('SELECT * FROM tools WHERE id = ?').get(id) as ToolRow | undefined;
    return row ? rowToTool(row) : null;
  }

  getByKey(key: string): Tool | null {
    const row = this.db.prepare('SELECT * FROM tools WHERE key = ?').get(key) as ToolRow | undefined;
    return row ? rowToTool(row) : null;
  }

  insert(tool: Tool): Tool {
    const { text, ...source } = tool.source;
    this.db
      .prepare(
        `INSERT INTO tools (id, key, url, domain, source_json, source_text, analysis_json, user_json, added_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(tool.id, tool.key, tool.url, tool.domain, JSON.stringify(source), text, JSON.stringify(tool.analysis), JSON.stringify(tool.user), tool.user.addedAt);
    return tool;
  }

  update(tool: Tool): Tool {
    const { text, ...source } = tool.source;
    const res = this.db
      .prepare(
        `UPDATE tools SET key = ?, url = ?, domain = ?, source_json = ?, source_text = ?, analysis_json = ?, user_json = ?, added_at = ?
         WHERE id = ?`,
      )
      .run(tool.key, tool.url, tool.domain, JSON.stringify(source), text, JSON.stringify(tool.analysis), JSON.stringify(tool.user), tool.user.addedAt, tool.id);
    if (res.changes === 0) throw new Error(`Tool ${tool.id} not found`);
    return tool;
  }

  /** Обновить только блок analysis (безопасно при параллельных правках пользователя). */
  updateAnalysis(id: string, analysis: ToolAnalysis): void {
    this.db.prepare('UPDATE tools SET analysis_json = ? WHERE id = ?').run(JSON.stringify(analysis), id);
  }

  /** Заменить только блок source (и source_text); user и analysis не трогаются. */
  updateSource(id: string, source: ToolSource): void {
    const { text, ...rest } = source;
    this.db.prepare('UPDATE tools SET source_json = ?, source_text = ? WHERE id = ?').run(JSON.stringify(rest), text, id);
  }

  /** Только запись; файлы картинок удаляет сервис (по id, а не по путям из записи). */
  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM tools WHERE id = ?').run(id).changes > 0;
  }
}
