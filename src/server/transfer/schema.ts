import { z } from 'zod';
import { EXPORT_FORMAT, REPO_STATUSES } from '../../shared/types.js';

const isoString = z.string().min(1);

const GithubSchema = z
  .object({
    description: z.string().nullable().default(null),
    htmlUrl: z.string().min(1),
    homepage: z.string().nullable().default(null),
    language: z.string().nullable().default(null),
    languages: z.record(z.number()).default({}),
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
    owner: z.string().min(1),
    name: z.string().min(1),
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

export const ExportFileSchema = z
  .object({
    format: z.literal(EXPORT_FORMAT),
    version: z.literal(1),
    exportedAt: z.string().default(''),
    app: z.string().default(''),
    repos: z.array(ExportedRepoSchema),
    collections: z.array(CollectionSchema).default([]),
  })
  .strip();

export type ValidExportFile = z.infer<typeof ExportFileSchema>;
