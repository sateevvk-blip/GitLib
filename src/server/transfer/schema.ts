import { z } from 'zod';
import { EXPORT_FORMAT, REPO_STATUSES } from '../../shared/types.js';

const isoString = z.string().min(1);

const GithubSchema = z
  .object({
    description: z.string().nullable().default(null),
    htmlUrl: z.string().min(1),
    homepage: z.string().nullable().default(null),
    language: z.string().nullable().default(null),
    languages: z.record(z.string(), z.number()).default({}),
    topics: z.array(z.string()).default([]),
    stars: z.number().int().nonnegative().default(0),
    forks: z.number().int().nonnegative().default(0),
    watchers: z.number().int().nonnegative().default(0),
    openIssues: z.number().int().nonnegative().default(0),
    license: z.string().nullable().default(null),
    defaultBranch: z.string().default('main'),
    archived: z.boolean().default(false),
    isFork: z.boolean().default(false),
    pushedAt: z.string().nullable().default(null),
    createdAt: z.string().nullable().default(null),
    updatedAt: z.string().nullable().default(null),
    ownerLogin: z.string().min(1),
    ownerType: z.string().default('User'),
    ownerAvatarUrl: z.string().nullable().default(null),
    readme: z.string().nullable().default(null),
    fetchedAt: isoString,
  })
  .strip();

const AnalysisSchema = z
  .object({
    status: z.enum(['none', 'pending', 'done', 'failed']).default('none'),
    summary: z.string().nullable().default(null),
    useCases: z.array(z.string()).default([]),
    suggestedTopics: z.array(z.string()).default([]),
    model: z.string().nullable().default(null),
    generatedAt: z.string().nullable().default(null),
    error: z.string().nullable().default(null),
  })
  .strip();

const UserSchema = z
  .object({
    notes: z.string().default(''),
    topics: z.array(z.string()).default([]),
    status: z.enum(REPO_STATUSES).default('inbox'),
    favorite: z.boolean().default(false),
    addedAt: isoString,
    updatedAt: isoString,
  })
  .strip();

export const ExportedRepoSchema = z
  .object({
    id: z.string().min(1),
    owner: z.string().regex(/^[^\s/]+$/),
    name: z.string().regex(/^[^\s/]+$/),
    fullName: z.string().min(1),
    key: z.string().min(1),
    avatarPath: z.string().nullable().default(null),
    avatarDataUrl: z.string().nullable().optional(),
    github: GithubSchema,
    analysis: AnalysisSchema,
    user: UserSchema,
  })
  .strip();

export const CollectionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().default(''),
    repoIds: z.array(z.string()).default([]),
    createdAt: isoString,
    updatedAt: isoString,
  })
  .strip();

// Инструменты: файл — недоверенный ввод, поэтому длины ограничены. key/domain/пути картинок из файла не читаются.
const str = (max: number) => z.string().max(max);
const nullableStr = (max: number) => str(max).nullable().default(null);
const strList = (items = 100, max = 2000) => z.array(str(max)).max(items).default([]);
const dataUrl = z.string().max(4_500_000).nullable().optional();

const ToolSourceSchema = z
  .object({
    status: z.enum(['ok', 'partial', 'failed', 'manual']).default('manual'),
    finalUrl: nullableStr(2048),
    title: nullableStr(1000),
    description: nullableStr(5000),
    siteName: nullableStr(1000),
    lang: nullableStr(50),
    text: z.string().max(100_000).nullable().default(null),
    textChars: z.number().int().nonnegative().default(0),
    fetchedAt: nullableStr(100),
    error: nullableStr(2000),
  })
  .strip();

const ToolAnalysisSchema = z
  .object({
    status: z.enum(['none', 'pending', 'done', 'failed']).default('none'),
    summary: nullableStr(10_000),
    purpose: nullableStr(5000),
    audience: nullableStr(5000),
    features: strList(),
    useCases: strList(),
    limitations: z.array(z.object({ text: str(2000), evidence: str(2000) }).strip()).max(100).default([]),
    suggestedTags: strList(),
    suggestedCategory: nullableStr(200),
    model: nullableStr(200),
    generatedAt: nullableStr(100),
    error: nullableStr(2000),
    basedOn: z
      .object({
        sourceFetchedAt: nullableStr(100),
        sourceStatus: z.enum(['ok', 'partial', 'failed', 'manual']),
        chars: z.number().int().nonnegative(),
      })
      .strip()
      .nullable()
      .default(null),
  })
  .strip();

const ToolUserSchema = z
  .object({
    title: nullableStr(1000),
    description: nullableStr(5000),
    category: nullableStr(200),
    tags: strList(100, 200),
    notes: str(200_000).default(''),
    favorite: z.boolean().default(false),
    confirmed: z.boolean().default(false),
    overrides: z
      .object({
        summary: str(10_000).optional(),
        purpose: str(5000).optional(),
        audience: str(5000).optional(),
        features: z.array(str(2000)).max(100).optional(),
        useCases: z.array(str(2000)).max(100).optional(),
        limitations: z.array(str(2000)).max(100).optional(),
      })
      .strip()
      .default({}),
    addedAt: isoString.max(100),
    updatedAt: isoString.max(100),
  })
  .strip();

export const ExportedToolSchema = z
  .object({
    id: z.string().min(1).max(200), // только для связи внутри файла; локальный id создаёт импорт
    url: z.string().min(1).max(2048),
    source: ToolSourceSchema,
    analysis: ToolAnalysisSchema,
    user: ToolUserSchema,
    iconDataUrl: dataUrl,
    coverDataUrl: dataUrl,
    userImageDataUrl: dataUrl,
  })
  .strip();

export const ExportFileSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.union([z.literal(1), z.literal(2)]),
    exportedAt: z.string().default(''),
    app: z.string().default(''),
    repos: z.array(ExportedRepoSchema),
    collections: z.array(CollectionSchema).default([]),
    tools: z.array(ExportedToolSchema).max(5000).default([]),
  })
  .strip();

export type ValidExportFile = z.infer<typeof ExportFileSchema>;
