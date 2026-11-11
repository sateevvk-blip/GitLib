import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, ChatReply, DuplicateStrategy, LibraryQuery, Repo, SettingsPatch, Tool, ToolPatch, ToolQuery, ToolSummary, UserPatch } from '../../shared/types.js';
import { applyToolPatch } from '../../shared/merge.js';
import { api, queryToParams, toolQueryToParams, type ManualTool } from './client';

export const keys = {
  repos: (q: LibraryQuery) => ['repos', queryToParams(q).toString()] as const,
  repo: (id: string) => ['repo', id] as const,
  facets: ['facets'] as const,
  tools: (q: ToolQuery) => ['tools', toolQueryToParams(q).toString()] as const,
  tool: (id: string) => ['tool', id] as const,
  toolFacets: ['tool-facets'] as const,
  collections: ['collections'] as const,
  settings: ['settings'] as const,
  health: ['health'] as const,
};

export function useRepos(q: LibraryQuery) {
  return useQuery({ queryKey: keys.repos(q), queryFn: () => api.listRepos(q), placeholderData: (prev) => prev });
}

export function useFacets() {
  return useQuery({ queryKey: keys.facets, queryFn: api.facets });
}

export function useTools(q: ToolQuery) {
  const qc = useQueryClient();
  const result = useQuery({
    queryKey: keys.tools(q),
    queryFn: () => api.listTools(q),
    placeholderData: (prev) => prev,
    // Пока хоть одна карточка анализируется — список обновляется сам.
    refetchInterval: (query) => (query.state.data?.items.some((t) => t.analysis.status === 'pending') ? 3000 : false),
  });
  // Когда анализ закончился, счётчики «Без AI-анализа» в фасетах устарели.
  const pending = result.data?.items.filter((t) => t.analysis.status === 'pending').length ?? 0;
  const prev = useRef(pending);
  useEffect(() => {
    if (pending < prev.current) void qc.invalidateQueries({ queryKey: keys.toolFacets });
    prev.current = pending;
  }, [pending, qc]);
  return result;
}

export function useToolFacets() {
  return useQuery({ queryKey: keys.toolFacets, queryFn: api.toolFacets });
}

function useInvalidateTools() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['tools'] });
    void qc.invalidateQueries({ queryKey: keys.toolFacets });
    void qc.invalidateQueries({ queryKey: keys.health });
  };
}

export function useAddTool() {
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: ({ url, manual }: { url: string; manual?: ManualTool }) => api.addTool(url, manual),
    onSuccess: invalidate,
  });
}

export function usePatchTool() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ToolPatch }) => api.patchTool(id, patch),
    // Звезда и правка видны сразу, не дожидаясь ответа; при ошибке возвращаем прежнее. Карточку правит та же
    // applyToolPatch, что и сервер: overrides сливаются с текущими, null снимает правку.
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: ['tools'] });
      await qc.cancelQueries({ queryKey: keys.tool(id) });
      const prev = qc.getQueriesData<{ items: ToolSummary[]; total: number }>({ queryKey: ['tools'] });
      qc.setQueriesData<{ items: ToolSummary[]; total: number }>({ queryKey: ['tools'] }, (d) =>
        d && { ...d, items: d.items.map((t) => (t.id === id && patch.favorite !== undefined ? { ...t, user: { ...t.user, favorite: patch.favorite } } : t)) },
      );
      const prevTool = qc.getQueryData<Tool>(keys.tool(id));
      if (prevTool) qc.setQueryData<Tool>(keys.tool(id), applyToolPatch(prevTool, patch));
      return { prev, prevTool };
    },
    onError: (_e, { id }, ctx) => {
      ctx?.prev.forEach(([key, data]) => qc.setQueryData(key, data));
      if (ctx?.prevTool) qc.setQueryData(keys.tool(id), ctx.prevTool);
    },
    onSuccess: (tool) => qc.setQueryData(keys.tool(tool.id), tool),
    onSettled: invalidate,
  });
}

/** Карточка инструмента; пока идёт анализ, перечитывается раз в 2 с. */
export function useTool(id: string | undefined) {
  return useQuery({
    queryKey: keys.tool(id ?? ''),
    queryFn: () => api.getTool(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.analysis.status === 'pending' ? 2000 : false),
  });
}

/** Действие над карточкой, отвечающее обновлённой записью: обновить страницу, анализ, своя картинка. */
function useToolAction<V>(run: (v: V) => Promise<Tool>) {
  const qc = useQueryClient();
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: run,
    onSuccess: (tool) => {
      qc.setQueryData(keys.tool(tool.id), tool);
      invalidate();
    },
  });
}

export const useRefreshTool = () => useToolAction((id: string) => api.refreshTool(id));
export const useAnalyzeTool = () => useToolAction((id: string) => api.analyzeTool(id));
export const useSetToolImage = () => useToolAction(({ id, imageUrl }: { id: string; imageUrl: string | null }) => api.setToolImage(id, imageUrl));

export function useDeleteTool() {
  const qc = useQueryClient();
  const invalidate = useInvalidateTools();
  return useMutation({
    mutationFn: (id: string) => api.deleteTool(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.tool(id) });
      invalidate();
    },
  });
}

export function useRepo(id: string | undefined) {
  return useQuery({
    queryKey: keys.repo(id ?? ''),
    queryFn: () => api.getRepo(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.analysis.status === 'pending' ? 2000 : false),
  });
}

export function useCollections() {
  return useQuery({ queryKey: keys.collections, queryFn: api.listCollections });
}

export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: api.getSettings, staleTime: 60_000 });
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 30_000, retry: false });
}

function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['repos'] });
    void qc.invalidateQueries({ queryKey: keys.facets });
    void qc.invalidateQueries({ queryKey: keys.health });
  };
}

export function useAddRepo() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (input: string) => api.addRepo(input),
    onSuccess: (repo) => {
      qc.setQueryData(keys.repo(repo.id), repo);
      invalidate();
    },
  });
}

export function usePatchRepo() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UserPatch }) => api.patchRepo(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.repo(id) });
      const prev = qc.getQueryData<Repo>(keys.repo(id));
      if (prev) qc.setQueryData<Repo>(keys.repo(id), { ...prev, user: { ...prev.user, ...patch } });
      return { prev };
    },
    onError: (_e, { id }, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.repo(id), ctx.prev);
    },
    onSuccess: (repo) => {
      qc.setQueryData(keys.repo(repo.id), repo);
      invalidate();
    },
  });
}

export function useDeleteRepo() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => api.deleteRepo(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.repo(id) });
      invalidate();
      void qc.invalidateQueries({ queryKey: keys.collections });
    },
  });
}

export function useRefreshRepo() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => api.refreshRepo(id),
    onSuccess: (repo) => {
      qc.setQueryData(keys.repo(repo.id), repo);
      invalidate();
    },
  });
}

export function useAnalyzeRepo() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (id: string) => api.analyzeRepo(id),
    onSuccess: (repo) => {
      qc.setQueryData(keys.repo(repo.id), repo);
      invalidate();
    },
  });
}

type ChatVars = { id: string; messages: ChatMessage[] };

/**
 * Вопрос о репозитории. Запись не меняется, поэтому кэш не инвалидируется.
 * Колбэки на уровне хука срабатывают даже после размонтирования панели чата —
 * ответ не теряется, если её закрыли, пока модель думала.
 */
export function useRepoChat(opts: Omit<Parameters<typeof useMutation<ChatReply, Error, ChatVars>>[0], 'mutationFn'> = {}) {
  return useMutation<ChatReply, Error, ChatVars>({
    ...opts,
    mutationFn: ({ id, messages }) => api.chatRepo(id, messages),
  });
}

export function useCollectionMutations() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  const done = () => {
    void qc.invalidateQueries({ queryKey: keys.collections });
    invalidate();
  };
  const create = useMutation({ mutationFn: ({ name, description }: { name: string; description?: string }) => api.createCollection(name, description), onSuccess: done });
  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { name?: string; description?: string; repoIds?: string[] } }) => api.updateCollection(id, patch),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.deleteCollection(id), onSuccess: done });
  const setMembership = useMutation({
    mutationFn: ({ collectionId, repoId, member }: { collectionId: string; repoId: string; member: boolean }) =>
      member ? api.addToCollection(collectionId, repoId) : api.removeFromCollection(collectionId, repoId),
    onSuccess: done,
  });
  return { create, update, remove, setMembership };
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: SettingsPatch) => api.updateSettings(patch),
    onSuccess: (s) => qc.setQueryData(keys.settings, s),
  });
}

export function useImport() {
  const qc = useQueryClient();
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ data, strategy }: { data: unknown; strategy: DuplicateStrategy }) => api.importApply(data, strategy),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: keys.collections });
      void qc.invalidateQueries({ queryKey: ['repo'] });
      void qc.invalidateQueries({ queryKey: ['tools'] });
      void qc.invalidateQueries({ queryKey: keys.toolFacets });
    },
  });
}
