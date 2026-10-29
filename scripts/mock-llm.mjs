/**
 * Мини-сервер, имитирующий OpenAI-совместимый API (/v1/models, /v1/chat/completions).
 * Нужен для проверки AI-пути без реальной модели.
 *
 *   node scripts/mock-llm.mjs            # порт 4899
 *   MOCK_LLM_FAIL=1 node scripts/mock-llm.mjs   # всегда отвечает ошибкой 500
 *
 * В настройках GitLib: Base URL = http://localhost:4899/v1, модель = mock-1
 */
import http from 'node:http';

const port = Number(process.env.MOCK_LLM_PORT ?? 4899);
const fail = process.env.MOCK_LLM_FAIL === '1';

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url.endsWith('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-1', object: 'model' }] }));
      return;
    }
    if (req.method === 'POST' && url.endsWith('/chat/completions')) {
      if (fail) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'mock: внутренняя ошибка модели' } }));
        return;
      }
      let repoName = 'проект';
      let chatQuestion = null;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const messages = body.messages ?? [];
        const user = messages.find((m) => m.role === 'user')?.content ?? '';
        const m = user.match(/Репозиторий:\s*(\S+)/);
        if (m) repoName = m[1];
        // Чат о репозитории: без response_format, последнее сообщение — вопрос пользователя.
        const last = messages[messages.length - 1];
        if (!body.response_format && messages.length > 3 && last?.role === 'user') chatQuestion = last.content;
      } catch {
        /* ignore */
      }
      if (chatQuestion !== null) {
        const reply = `Мок-ответ про **${repoName}** на вопрос «${chatQuestion.slice(0, 80)}».\n\nПо README: это демонстрационный проект, запускается командой:\n\n\`\`\`bash\nnpm install && npm start\n\`\`\`\n\nДеталей в данных нет — посмотрите папку \`docs/\` в репозитории.`;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: 'chatcmpl-mock', object: 'chat.completion', model: 'mock-1', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }] }));
        return;
      }
      const content = JSON.stringify({
        summary: `${repoName} — демонстрационная сводка от мок-модели. Это инструмент, который решает конкретную задачу разработчика и активно поддерживается.\n\nПодходит, когда нужен готовый и проверенный компонент вместо самописного.`,
        useCases: ['Быстрый старт нового проекта', 'Замена самописного решения', 'Изучение подхода авторов к архитектуре'],
        suggestedTopics: ['mock', 'developer-tools', 'productivity'],
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-mock',
          object: 'chat.completion',
          model: 'mock-1',
          choices: [{ index: 0, message: { role: 'assistant', content: '```json\n' + content + '\n```' }, finish_reason: 'stop' }],
        }),
      );
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`mock LLM на http://127.0.0.1:${port}/v1 (${fail ? 'режим ошибок' : 'нормальный режим'})`);
});
