import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatMessage, ChatReply, DuplicateStrategy, LibraryQuery, Repo, SettingsPatch, UserPatch } from '../../shared/types.js';
import { api, queryToParams } from './client';

export const keys = {
  repos: (q: LibraryQuery) => ['repos', queryToParams(q).toString()] as const,
  repo: (id: string) => ['repo', id] as const,
  facets: ['facets'] as const,
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
    },
  });
}
