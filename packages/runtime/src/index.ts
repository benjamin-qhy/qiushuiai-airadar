import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite'

import { sourceTypeSchema, type SourceType } from '@airadar/domain'
import { z } from 'zod'

const timestampSchema = z.iso.datetime()
const taskTypeSchema = z.enum(['discover', 'enrich', 'analyze'])
const taskStatusSchema = z.enum(['pending', 'running', 'succeeded', 'failed'])
const jsonObjectSchema = z.record(z.string(), z.unknown())

const parameterScopeSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('global') }).strict(),
  z
    .object({ level: z.literal('sourceType'), sourceType: sourceTypeSchema })
    .strict(),
  z
    .object({ level: z.literal('source'), sourceId: z.string().min(1) })
    .strict(),
])

const taskErrorSchema = z
  .object({
    attempt: z.number().int().positive(),
    at: timestampSchema,
    message: z.string(),
  })
  .strict()

const runtimeTaskSchema = z
  .object({
    id: z.string().min(1),
    type: taskTypeSchema,
    status: taskStatusSchema,
    sourceId: z.string().min(1).optional(),
    sourceType: sourceTypeSchema.optional(),
    idempotencyKey: z.string().min(1),
    payload: jsonObjectSchema,
    attempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().min(1).max(3),
    availableAt: timestampSchema,
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    workerId: z.string().min(1).optional(),
    parameterVersionIds: z.array(z.string().min(1)),
    parameterSnapshot: jsonObjectSchema,
    parametersResolved: z.boolean(),
    errors: z.array(taskErrorSchema),
  })
  .strict()

const parameterVersionSchema = z
  .object({
    id: z.string().min(1),
    scope: parameterScopeSchema,
    values: jsonObjectSchema,
    description: z.string().min(1),
    previousVersionId: z.string().min(1).optional(),
    createdAt: timestampSchema,
  })
  .strict()

const contentRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
    canonicalUrl: z.url().optional(),
    sourceId: z.string().min(1).optional(),
    externalId: z.string().min(1).optional(),
    publishedAt: timestampSchema.optional(),
    discoveredAt: timestampSchema.optional(),
    enrichmentStatus: z.enum(['pending', 'succeeded', 'failed']).optional(),
    enrichmentError: z.string().optional(),
  })
  .passthrough()

const discoveryRecordSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    contentId: z.string().min(1),
    discoveredAt: timestampSchema,
  })
  .passthrough()

const progressSchema = z
  .object({
    sourceId: z.string().min(1),
    cursor: z.string().min(1).optional(),
    baselineExternalIds: z.array(z.string().min(1)).optional(),
    updatedAt: timestampSchema,
  })
  .strict()

const auditSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    providerId: z.string().min(1),
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    succeeded: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    cursorBefore: z.string().optional(),
    cursorAfter: z.string().optional(),
    retries: z.number().int().nonnegative(),
    error: z.string().optional(),
  })
  .strict()

const usageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheReadTokens: z.number().int().nonnegative(),
    cacheWriteTokens: z.number().int().nonnegative(),
    costUsd: z.number().nonnegative(),
  })
  .strict()

const analysisRecordSchema = z
  .object({
    id: z.string().min(1),
    contentId: z.string().min(1),
    fingerprint: z.string().min(1),
    version: z.number().int().positive(),
    manual: z.boolean(),
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    profileVersionId: z.string().min(1),
    ruleVersion: z.string().min(1),
    createdAt: timestampSchema,
    durationMs: z.number().int().nonnegative(),
    usage: usageSchema,
    result: jsonObjectSchema,
  })
  .strict()

const analysisCallSchema = z
  .object({
    id: z.string().min(1),
    contentId: z.string().min(1),
    analysisId: z.string().min(1).optional(),
    provider: z.string().min(1),
    model: z.string().min(1),
    startedAt: timestampSchema,
    finishedAt: timestampSchema,
    durationMs: z.number().int().nonnegative(),
    status: z.enum(['succeeded', 'failed']),
    usage: usageSchema.optional(),
    error: z.string().optional(),
  })
  .strict()

export type RuntimeTask = z.infer<typeof runtimeTaskSchema>
export type ParameterScope = z.infer<typeof parameterScopeSchema>
export type RuntimeParameterVersion = z.infer<typeof parameterVersionSchema>
export type RuntimeAudit = z.infer<typeof auditSchema>
export type ContentRecord = z.infer<typeof contentRecordSchema>
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>
export type AnalysisCall = z.infer<typeof analysisCallSchema>

export interface EnqueueTaskInput {
  id: string
  type: RuntimeTask['type']
  sourceId?: string
  sourceType?: SourceType
  idempotencyKey: string
  payload?: Record<string, unknown>
  availableAt?: string
  maxAttempts?: number
}

export interface SaveParameterVersionInput {
  id: string
  scope: ParameterScope
  values: Record<string, unknown>
  description: string
  createdAt?: string
}

export interface DiscoveryBatchInput {
  sourceId: string
  nextCursor?: string
  baselineExternalIds?: string[]
  contents: Array<z.input<typeof contentRecordSchema>>
  discoveries: Array<z.input<typeof discoveryRecordSchema>>
}

export interface AtomicWriteHooks {
  beforeSync?(): void | Promise<void>
  beforeRename?(): void | Promise<void>
}

export interface DiscoveryCommitHooks {
  beforeProgress?(): void | Promise<void>
}

const markdownStart = '<!-- airadar-record:start -->\n```json\n'
const markdownEnd = '\n```\n<!-- airadar-record:end -->\n'
const sensitiveKey =
  /(?:apikey|accesskey(?:id)?|token|secret|password|passphrase|authorization|auth|cookie|privatekey|credentials?|bearer|signingkey)$/iu
const secretReferenceSchema = z
  .object({ secretRef: z.string().regex(/^[A-Z][A-Z0-9_]*$/u) })
  .strict()

function nowIso(): string {
  return new Date().toISOString()
}

function recordMarkdown(kind: string, record: unknown): string {
  return `# AI Radar ${kind}\n\n${markdownStart}${JSON.stringify(record, null, 2)}${markdownEnd}`
}

function parseRecord<T>(source: string, schema: z.ZodType<T>): T {
  const start = source.indexOf(markdownStart)
  const end = source.indexOf(markdownEnd, start + markdownStart.length)
  if (start < 0 || end < 0) throw new Error('Invalid AI Radar Markdown record')
  return schema.parse(
    JSON.parse(source.slice(start + markdownStart.length, end)) as unknown
  )
}

function containsSensitiveValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveValue)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, entry]) =>
      (sensitiveKey.test(key.replace(/[^a-z0-9]/giu, '')) &&
        !secretReferenceSchema.safeParse(entry).success) ||
      containsSensitiveValue(entry)
  )
}

function containsSensitiveKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsSensitiveKey)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value).some(
    ([key, entry]) =>
      sensitiveKey.test(key.replace(/[^a-z0-9]/giu, '')) ||
      containsSensitiveKey(entry)
  )
}

function redactStructured(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactStructured)
  if (typeof value === 'string') return redactText(value)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      sensitiveKey.test(key.replace(/[^a-z0-9]/giu, ''))
        ? '[REDACTED]'
        : redactStructured(entry),
    ])
  )
}

function redactText(value: string): string {
  return value
    .replace(
      /((?:authorization|proxy-authorization)\s*:\s*)(?:bearer|basic)\s+[^\s,;]+/giu,
      '$1[REDACTED]'
    )
    .replace(/((?:set-cookie|cookie)\s*:\s*)[^\r\n]+/giu, '$1[REDACTED]')
    .replace(/(bearer\s+)[^\s,;]+/giu, '$1[REDACTED]')
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization)\s*[=:]\s*)[^\s,;]+/giu,
      '$1[REDACTED]'
    )
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const previous = merged[key]
    merged[key] =
      previous &&
      value &&
      typeof previous === 'object' &&
      typeof value === 'object' &&
      !Array.isArray(previous) &&
      !Array.isArray(value)
        ? deepMerge(
            previous as Record<string, unknown>,
            value as Record<string, unknown>
          )
        : value
  }
  return merged
}

function retryAtFor(task: RuntimeTask): string {
  const retry = task.parameterSnapshot.retry
  const configuredDelay =
    retry && typeof retry === 'object' && 'delaySeconds' in retry
      ? Number((retry as { delaySeconds?: unknown }).delaySeconds)
      : 30
  const delaySeconds =
    Number.isFinite(configuredDelay) && configuredDelay >= 0
      ? configuredDelay
      : 30
  return new Date(Date.now() + delaySeconds * 1_000).toISOString()
}

function scopeKey(scope: ParameterScope): string {
  if (scope.level === 'global') return 'global'
  if (scope.level === 'sourceType') return `source-type:${scope.sourceType}`
  return `source:${scope.sourceId}`
}

function storageKey(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}

function rowRecord<T>(row: unknown, schema: z.ZodType<T>): T | undefined {
  if (!row || typeof row !== 'object' || !('record_json' in row))
    return undefined
  const json = (row as { record_json: unknown }).record_json
  return typeof json === 'string'
    ? schema.parse(JSON.parse(json) as unknown)
    : undefined
}

async function markdownFiles(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(directory, entry.name))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

interface RootLock {
  database: DatabaseSync
}

async function acquireRootLock(indexDirectory: string): Promise<RootLock> {
  const database = new DatabaseSync(
    path.join(indexDirectory, 'runtime-lock.sqlite')
  )
  try {
    database.exec('PRAGMA busy_timeout = 100; BEGIN EXCLUSIVE;')
    return { database }
  } catch (error) {
    database.close()
    throw new Error('AI Radar data root is already in use', { cause: error })
  }
}

async function releaseRootLock(lock: RootLock): Promise<void> {
  try {
    lock.database.exec('ROLLBACK')
  } finally {
    lock.database.close()
  }
}

export async function atomicWriteFile(
  target: string,
  content: string | Uint8Array,
  hooks: AtomicWriteHooks = {}
): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true })
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${randomUUID()}.tmp`
  )
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(
      content,
      typeof content === 'string' ? 'utf8' : undefined
    )
    await hooks.beforeSync?.()
    await handle.sync()
    await handle.close()
    handle = undefined
    await hooks.beforeRename?.()
    await rename(temporary, target)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await rm(temporary, { force: true })
    throw error
  }
}

export class RuntimeRepository {
  readonly root: string
  readonly databasePath: string
  private readonly database: DatabaseSync
  private readonly rootLock: RootLock
  private mutationTail: Promise<void> = Promise.resolve()
  private closed = false

  private constructor(
    root: string,
    database: DatabaseSync,
    rootLock: RootLock
  ) {
    this.root = root
    this.databasePath = path.join(root, '.index', 'runtime.sqlite')
    this.database = database
    this.rootLock = rootLock
  }

  static async open(root: string): Promise<RuntimeRepository> {
    const indexDirectory = path.join(root, '.index')
    await mkdir(indexDirectory, { recursive: true })
    const rootLock = await acquireRootLock(indexDirectory)
    const databasePath = path.join(indexDirectory, 'runtime.sqlite')
    let database: DatabaseSync | undefined
    try {
      database = new DatabaseSync(databasePath)
      const repository = new RuntimeRepository(root, database, rootLock)
      await repository.initialize()
      return repository
    } catch (error) {
      const sqliteError = error as NodeJS.ErrnoException & { errcode?: number }
      const code = sqliteError.code ?? ''
      if (
        !['ERR_SQLITE_CORRUPT', 'ERR_SQLITE_NOTADB'].includes(code) &&
        ![11, 26].includes(sqliteError.errcode ?? -1)
      ) {
        try {
          database?.close()
        } finally {
          await releaseRootLock(rootLock)
        }
        throw error
      }
      try {
        database?.close()
      } catch {
        // SQLite may already have closed a corrupt handle.
      }
      try {
        await Promise.all(
          ['', '-wal', '-shm'].map((suffix) =>
            rm(`${databasePath}${suffix}`, { force: true })
          )
        )
        database = new DatabaseSync(databasePath)
        const repository = new RuntimeRepository(root, database, rootLock)
        await repository.initialize()
        return repository
      } catch (replacementError) {
        try {
          database?.close()
        } finally {
          await releaseRootLock(rootLock)
        }
        throw replacementError
      }
    }
  }

  private async initialize(): Promise<void> {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        idempotency_key TEXT NOT NULL UNIQUE,
        source_id TEXT,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        available_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_locks (
        source_id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS parameters (
        id TEXT PRIMARY KEY,
        scope_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contents (
        id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS discoveries (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        content_id TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS progress (
        source_id TEXT PRIMARY KEY,
        cursor TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audits (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS analyses_fingerprint
        ON analyses (content_id, fingerprint);
      CREATE UNIQUE INDEX IF NOT EXISTS analyses_version
        ON analyses (content_id, version);
      CREATE TABLE IF NOT EXISTS analysis_calls (
        id TEXT PRIMARY KEY,
        content_id TEXT NOT NULL,
        status TEXT NOT NULL,
        record_json TEXT NOT NULL
      );
    `)
    await this.rebuildIndex()
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    try {
      this.database.close()
    } finally {
      await releaseRootLock(this.rootLock)
    }
  }

  journalMode(): string {
    const row = this.database.prepare('PRAGMA journal_mode').get() as
      { journal_mode?: unknown } | undefined
    return String(row?.journal_mode ?? '')
  }

  indexedTaskCount(): number {
    return this.count('tasks')
  }

  indexedContentCount(): number {
    return this.count('contents')
  }

  indexedDiscoveryCount(): number {
    return this.count('discoveries')
  }

  hasDiscovery(id: string): boolean {
    return this.hasRecord('discoveries', id)
  }

  getDiscovery(id: string): z.infer<typeof discoveryRecordSchema> | undefined {
    return rowRecord(
      this.database
        .prepare('SELECT record_json FROM discoveries WHERE id = ?')
        .get(id),
      discoveryRecordSchema
    )
  }

  listDiscoveries(
    sourceId?: string
  ): Array<z.infer<typeof discoveryRecordSchema>> {
    const rows = sourceId
      ? this.database
          .prepare(
            'SELECT record_json FROM discoveries WHERE source_id = ? ORDER BY id'
          )
          .all(sourceId)
      : this.database
          .prepare('SELECT record_json FROM discoveries ORDER BY id')
          .all()
    return rows
      .map((row) => rowRecord(row, discoveryRecordSchema))
      .filter((record): record is z.infer<typeof discoveryRecordSchema> =>
        Boolean(record)
      )
  }

  activeSourceLockCount(): number {
    return this.count('source_locks')
  }

  private count(table: string): number {
    const allowed = new Set([
      'tasks',
      'contents',
      'discoveries',
      'source_locks',
    ])
    if (!allowed.has(table)) throw new Error('Unsupported count table')
    const row = this.database
      .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
      .get() as { count?: unknown } | undefined
    return Number(row?.count ?? 0)
  }

  async rebuildIndex(): Promise<void> {
    this.database.exec(`
      DELETE FROM source_locks;
      DELETE FROM tasks;
      DELETE FROM parameters;
      DELETE FROM contents;
      DELETE FROM discoveries;
      DELETE FROM progress;
      DELETE FROM audits;
      DELETE FROM analyses;
      DELETE FROM analysis_calls;
    `)

    await this.rebuildTasks()
    await this.rebuildFolder('parameters', parameterVersionSchema, (record) => {
      this.upsertParameter(record)
    })
    await this.rebuildContents()
    await this.rebuildFolder('discoveries', discoveryRecordSchema, (record) => {
      this.upsertDiscovery(record)
    })
    await this.rebuildFolder('progress', progressSchema, (record) => {
      this.upsertProgress(record)
    })
    await this.rebuildFolder('audits', auditSchema, (record) => {
      this.upsertAudit(record)
    })
    await this.rebuildFolder('analyses', analysisRecordSchema, (record) => {
      this.upsertAnalysis(record)
    })
    await this.rebuildFolder('analysis-calls', analysisCallSchema, (record) => {
      this.upsertAnalysisCall(record)
    })
  }

  private async rebuildTasks(): Promise<void> {
    for (const file of await markdownFiles(this.folder('tasks'))) {
      let record = parseRecord(await readFile(file, 'utf8'), runtimeTaskSchema)
      if (record.status === 'running') {
        record = {
          ...record,
          status: 'pending',
          workerId: undefined,
          updatedAt: nowIso(),
        }
        await atomicWriteFile(file, recordMarkdown('task', record))
      }
      this.upsertTask(record)
    }
  }

  private async rebuildFolder<T>(
    name: string,
    schema: z.ZodType<T>,
    insert: (record: T) => void
  ): Promise<void> {
    for (const file of await markdownFiles(this.folder(name))) {
      insert(parseRecord(await readFile(file, 'utf8'), schema))
    }
  }

  private async rebuildContents(): Promise<void> {
    const directory = this.folder('contents')
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const file = path.join(directory, entry.name, 'content.md')
      try {
        this.upsertContent(
          parseRecord(await readFile(file, 'utf8'), contentRecordSchema)
        )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    }
  }

  async enqueueTask(input: EnqueueTaskInput): Promise<RuntimeTask> {
    return this.serializeMutation(() => this.enqueueTaskLocked(input))
  }

  private async serializeMutation<T>(work: () => Promise<T>): Promise<T> {
    const previous = this.mutationTail
    let release!: () => void
    this.mutationTail = new Promise((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await work()
    } finally {
      release()
    }
  }

  private async enqueueTaskLocked(
    input: EnqueueTaskInput
  ): Promise<RuntimeTask> {
    if (containsSensitiveValue(input.payload ?? {})) {
      throw new Error('Task payload cannot contain secret-like fields')
    }
    if (input.type === 'discover' && !input.sourceId) {
      throw new Error('Discover tasks require a source id')
    }
    const duplicate = rowRecord(
      this.database
        .prepare('SELECT record_json FROM tasks WHERE idempotency_key = ?')
        .get(input.idempotencyKey),
      runtimeTaskSchema
    )
    if (duplicate) return duplicate
    if (await this.getTask(input.id)) {
      throw new Error(`Task id already exists: ${input.id}`)
    }

    const time = nowIso()
    const task = runtimeTaskSchema.parse({
      ...input,
      payload: input.payload ?? {},
      status: 'pending',
      attempt: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ?? time,
      createdAt: time,
      updatedAt: time,
      parameterVersionIds: [],
      parameterSnapshot: {},
      parametersResolved: false,
      errors: [],
    })
    await this.writeRecord('tasks', task.id, 'task', task)
    this.upsertTask(task)
    return task
  }

  async getTask(id: string): Promise<RuntimeTask | undefined> {
    return rowRecord(
      this.database
        .prepare('SELECT record_json FROM tasks WHERE id = ?')
        .get(id),
      runtimeTaskSchema
    )
  }

  async claimNextTask(
    workerId: string,
    at = nowIso()
  ): Promise<RuntimeTask | undefined> {
    return this.serializeMutation(() => this.claimNextTaskLocked(workerId, at))
  }

  private async claimNextTaskLocked(
    workerId: string,
    at: string
  ): Promise<RuntimeTask | undefined> {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const rows = this.database
        .prepare(
          `SELECT record_json FROM tasks
           WHERE status = 'pending' AND available_at <= ?
           ORDER BY created_at, id`
        )
        .all(at)
      for (const row of rows) {
        const pending = rowRecord(row, runtimeTaskSchema)
        if (!pending) continue
        if (pending.sourceId && this.isSourceLocked(pending.sourceId)) continue

        const parameters = !pending.parametersResolved
          ? this.resolveParameters(pending.sourceType, pending.sourceId)
          : {
              ids: pending.parameterVersionIds,
              values: pending.parameterSnapshot,
            }
        const running = runtimeTaskSchema.parse({
          ...pending,
          status: 'running',
          attempt: pending.attempt + 1,
          workerId,
          parameterVersionIds: parameters.ids,
          parameterSnapshot: parameters.values,
          parametersResolved: true,
          updatedAt: nowIso(),
        })
        await this.writeRecord('tasks', running.id, 'task', running)
        this.upsertTask(running)
        if (running.sourceId) {
          this.database
            .prepare(
              'INSERT INTO source_locks (source_id, task_id) VALUES (?, ?)'
            )
            .run(running.sourceId, running.id)
        }
        this.database.exec('COMMIT')
        return running
      }
      this.database.exec('COMMIT')
      return undefined
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  async completeTask(id: string): Promise<RuntimeTask> {
    return this.serializeMutation(() => this.completeTaskLocked(id))
  }

  private async completeTaskLocked(id: string): Promise<RuntimeTask> {
    const task = await this.requireRunningTask(id)
    const completed = runtimeTaskSchema.parse({
      ...task,
      status: 'succeeded',
      workerId: undefined,
      updatedAt: nowIso(),
    })
    await this.writeRecord('tasks', id, 'task', completed)
    this.upsertTask(completed)
    this.releaseSourceLock(task)
    return completed
  }

  async failTask(
    id: string,
    message: string,
    options: { retryAt?: string } = {}
  ): Promise<RuntimeTask> {
    return this.serializeMutation(() =>
      this.failTaskLocked(id, message, options)
    )
  }

  private async failTaskLocked(
    id: string,
    message: string,
    options: { retryAt?: string }
  ): Promise<RuntimeTask> {
    const task = await this.requireRunningTask(id)
    const exhausted = task.attempt >= task.maxAttempts
    const failed = runtimeTaskSchema.parse({
      ...task,
      status: exhausted ? 'failed' : 'pending',
      workerId: undefined,
      availableAt: exhausted
        ? task.availableAt
        : (options.retryAt ?? retryAtFor(task)),
      updatedAt: nowIso(),
      errors: [
        ...task.errors,
        { attempt: task.attempt, at: nowIso(), message: redactText(message) },
      ],
    })
    await this.writeRecord('tasks', id, 'task', failed)
    this.upsertTask(failed)
    this.releaseSourceLock(task)
    return failed
  }

  private async requireRunningTask(id: string): Promise<RuntimeTask> {
    const task = await this.getTask(id)
    if (!task || task.status !== 'running') {
      throw new Error(`Task ${id} is not running`)
    }
    return task
  }

  private releaseSourceLock(task: RuntimeTask): void {
    if (task.sourceId) {
      this.database
        .prepare('DELETE FROM source_locks WHERE source_id = ? AND task_id = ?')
        .run(task.sourceId, task.id)
    }
  }

  private isSourceLocked(sourceId: string): boolean {
    return Boolean(
      this.database
        .prepare('SELECT 1 FROM source_locks WHERE source_id = ?')
        .get(sourceId)
    )
  }

  async saveParameterVersion(
    input: SaveParameterVersionInput
  ): Promise<RuntimeParameterVersion> {
    return this.serializeMutation(() => this.saveParameterVersionLocked(input))
  }

  private async saveParameterVersionLocked(
    input: SaveParameterVersionInput
  ): Promise<RuntimeParameterVersion> {
    if (containsSensitiveValue(input.values)) {
      throw new Error('Parameter values cannot contain secret-like fields')
    }
    if (
      this.database
        .prepare('SELECT 1 FROM parameters WHERE id = ?')
        .get(input.id)
    ) {
      throw new Error(`Parameter version ${input.id} is immutable`)
    }
    const previous = rowRecord(
      this.database
        .prepare(
          `SELECT record_json FROM parameters
           WHERE scope_key = ? ORDER BY created_at DESC, id DESC LIMIT 1`
        )
        .get(scopeKey(input.scope)),
      parameterVersionSchema
    )
    const version = parameterVersionSchema.parse({
      ...input,
      previousVersionId: previous?.id,
      createdAt: input.createdAt ?? nowIso(),
    })
    await this.writeRecord(
      'parameters',
      version.id,
      'parameter version',
      version
    )
    this.upsertParameter(version)
    return version
  }

  resolveParameters(
    sourceType?: SourceType,
    sourceId?: string
  ): { ids: string[]; values: Record<string, unknown> } {
    const keys = [
      'global',
      ...(sourceType ? [`source-type:${sourceType}`] : []),
      ...(sourceId ? [`source:${sourceId}`] : []),
    ]
    const versions = keys
      .map((key) =>
        rowRecord(
          this.database
            .prepare(
              `SELECT record_json FROM parameters
               WHERE scope_key = ? ORDER BY created_at DESC, id DESC LIMIT 1`
            )
            .get(key),
          parameterVersionSchema
        )
      )
      .filter((version): version is RuntimeParameterVersion => Boolean(version))
    return {
      ids: versions.map((version) => version.id),
      values: versions.reduce(
        (values, version) => deepMerge(values, version.values),
        {} as Record<string, unknown>
      ),
    }
  }

  async commitDiscoveryBatch(
    input: DiscoveryBatchInput,
    hooks: DiscoveryCommitHooks = {}
  ): Promise<void> {
    await this.serializeMutation(() =>
      this.commitDiscoveryBatchLocked(input, hooks)
    )
  }

  private async commitDiscoveryBatchLocked(
    input: DiscoveryBatchInput,
    hooks: DiscoveryCommitHooks
  ): Promise<void> {
    const contents = input.contents.map((content) =>
      contentRecordSchema.parse(content)
    )
    const discoveries = input.discoveries.map((discovery) =>
      discoveryRecordSchema.parse(discovery)
    )
    if (
      contents.some(containsSensitiveKey) ||
      discoveries.some(containsSensitiveKey)
    ) {
      throw new Error('Content and discovery records cannot contain secrets')
    }
    const batchContentIds = new Set(contents.map((content) => content.id))
    for (const discovery of discoveries) {
      if (discovery.sourceId !== input.sourceId) {
        throw new Error('Discovery source must match the committed source')
      }
      if (
        !batchContentIds.has(discovery.contentId) &&
        !this.hasRecord('contents', discovery.contentId)
      ) {
        throw new Error(
          `Discovery content does not exist: ${discovery.contentId}`
        )
      }
    }
    for (const content of contents) {
      if (this.hasRecord('contents', content.id)) continue
      await atomicWriteFile(
        this.contentMarkdownPath(content.id),
        recordMarkdown('content', content)
      )
      this.upsertContent(content)
    }
    for (const discovery of discoveries) {
      if (this.hasRecord('discoveries', discovery.id)) continue
      await this.writeRecord(
        'discoveries',
        discovery.id,
        'discovery',
        discovery
      )
      this.upsertDiscovery(discovery)
    }
    if (input.nextCursor || input.baselineExternalIds) {
      await hooks.beforeProgress?.()
      await this.writeProgress(
        input.sourceId,
        input.nextCursor,
        input.baselineExternalIds
      )
    }
  }

  async advanceProgress(
    sourceId: string,
    cursor: string,
    options: { baselineExternalIds?: string[] } = {}
  ): Promise<void> {
    await this.serializeMutation(() =>
      this.writeProgress(sourceId, cursor, options.baselineExternalIds)
    )
  }

  private async writeProgress(
    sourceId: string,
    cursor: string | undefined,
    baselineExternalIds?: string[]
  ): Promise<void> {
    const previous = this.getProgress(sourceId)
    const progress = progressSchema.parse({
      sourceId,
      cursor: cursor ?? previous?.cursor,
      baselineExternalIds: baselineExternalIds ?? previous?.baselineExternalIds,
      updatedAt: nowIso(),
    })
    await this.writeRecord('progress', sourceId, 'source progress', progress)
    this.upsertProgress(progress)
  }

  getContent(id: string): z.infer<typeof contentRecordSchema> | undefined {
    return rowRecord(
      this.database
        .prepare('SELECT record_json FROM contents WHERE id = ?')
        .get(id),
      contentRecordSchema
    )
  }

  listContents(): ContentRecord[] {
    return this.database
      .prepare('SELECT record_json FROM contents ORDER BY id')
      .all()
      .map((row) => rowRecord(row, contentRecordSchema))
      .filter((record): record is ContentRecord => Boolean(record))
  }

  async completeContentEnrichment(
    id: string,
    input: { body: string; canonicalUrl?: string }
  ): Promise<ContentRecord> {
    return this.serializeMutation(async () => {
      const content = this.getContent(id)
      if (!content) throw new Error(`Content does not exist: ${id}`)
      if (content.body.trim() && content.enrichmentStatus === 'succeeded') {
        return content
      }
      if (!input.body.trim()) throw new Error('Completed content body is empty')
      const completed = contentRecordSchema.parse({
        ...content,
        ...input,
        enrichmentStatus: 'succeeded',
        enrichmentError: undefined,
      })
      await atomicWriteFile(
        this.contentMarkdownPath(id),
        recordMarkdown('content', completed)
      )
      this.upsertContent(completed)
      return completed
    })
  }

  async mergeContentIdentity(
    fromId: string,
    canonicalId: string,
    input: { body: string; canonicalUrl: string }
  ): Promise<ContentRecord> {
    return this.serializeMutation(async () => {
      if (fromId === canonicalId) {
        const content = this.getContent(fromId)
        if (!content) throw new Error(`Content does not exist: ${fromId}`)
        if (content.body.trim() && content.enrichmentStatus === 'succeeded') {
          return content
        }
        if (!input.body.trim())
          throw new Error('Completed content body is empty')
        const completed = contentRecordSchema.parse({
          ...content,
          ...input,
          enrichmentStatus: 'succeeded',
          enrichmentError: undefined,
        })
        await atomicWriteFile(
          this.contentMarkdownPath(fromId),
          recordMarkdown('content', completed)
        )
        this.upsertContent(completed)
        return completed
      }

      const source = this.getContent(fromId)
      if (!source) throw new Error(`Content does not exist: ${fromId}`)
      if (!input.body.trim()) throw new Error('Completed content body is empty')
      if (
        this.database
          .prepare('SELECT 1 FROM analyses WHERE content_id = ?')
          .get(fromId)
      ) {
        throw new Error('Cannot merge content identity after analysis')
      }
      const existing = this.getContent(canonicalId)
      const canonical = contentRecordSchema.parse(
        existing?.body.trim() && existing.enrichmentStatus === 'succeeded'
          ? existing
          : {
              ...source,
              ...existing,
              ...input,
              id: canonicalId,
              enrichmentStatus: 'succeeded',
              enrichmentError: undefined,
            }
      )
      await atomicWriteFile(
        this.contentMarkdownPath(canonicalId),
        recordMarkdown('content', canonical)
      )
      this.upsertContent(canonical)

      const discoveries = this.database
        .prepare('SELECT record_json FROM discoveries WHERE content_id = ?')
        .all(fromId)
        .map((row) => rowRecord(row, discoveryRecordSchema))
        .filter((record): record is z.infer<typeof discoveryRecordSchema> =>
          Boolean(record)
        )
      for (const discovery of discoveries) {
        const migrated = discoveryRecordSchema.parse({
          ...discovery,
          contentId: canonicalId,
        })
        await this.writeRecord(
          'discoveries',
          migrated.id,
          'discovery',
          migrated
        )
        this.upsertDiscovery(migrated)
      }
      await rm(path.dirname(this.contentMarkdownPath(fromId)), {
        recursive: true,
        force: true,
      })
      this.database.prepare('DELETE FROM contents WHERE id = ?').run(fromId)
      return canonical
    })
  }

  async failContentEnrichment(
    id: string,
    error: string
  ): Promise<ContentRecord> {
    return this.serializeMutation(async () => {
      const content = this.getContent(id)
      if (!content) throw new Error(`Content does not exist: ${id}`)
      const failed = contentRecordSchema.parse({
        ...content,
        enrichmentStatus: 'failed',
        enrichmentError: redactText(error),
      })
      await atomicWriteFile(
        this.contentMarkdownPath(id),
        recordMarkdown('content', failed)
      )
      this.upsertContent(failed)
      return failed
    })
  }

  getAnalysisByFingerprint(
    contentId: string,
    fingerprint: string
  ): AnalysisRecord | undefined {
    return rowRecord(
      this.database
        .prepare(
          `SELECT record_json FROM analyses
           WHERE content_id = ? AND fingerprint = ?
           ORDER BY version DESC LIMIT 1`
        )
        .get(contentId, fingerprint),
      analysisRecordSchema
    )
  }

  listAnalyses(contentId?: string): AnalysisRecord[] {
    const rows = contentId
      ? this.database
          .prepare(
            'SELECT record_json FROM analyses WHERE content_id = ? ORDER BY version DESC'
          )
          .all(contentId)
      : this.database
          .prepare('SELECT record_json FROM analyses ORDER BY created_at DESC')
          .all()
    return rows
      .map((row) => rowRecord(row, analysisRecordSchema))
      .filter((record): record is AnalysisRecord => Boolean(record))
  }

  nextAnalysisVersion(contentId: string): number {
    const row = this.database
      .prepare(
        'SELECT COALESCE(MAX(version), 0) AS version FROM analyses WHERE content_id = ?'
      )
      .get(contentId) as { version?: unknown } | undefined
    return Number(row?.version ?? 0) + 1
  }

  async saveAnalysis(
    input: z.input<typeof analysisRecordSchema>
  ): Promise<AnalysisRecord> {
    return this.serializeMutation(async () => {
      const analysis = analysisRecordSchema.parse(input)
      if (containsSensitiveKey(analysis.result)) {
        throw new Error('Analysis result cannot contain secrets')
      }
      if (this.hasRecord('analyses', analysis.id)) {
        throw new Error(`Analysis ${analysis.id} is immutable`)
      }
      if (!analysis.manual) {
        const existing = this.getAnalysisByFingerprint(
          analysis.contentId,
          analysis.fingerprint
        )
        if (existing) return existing
      }
      const content = this.getContent(analysis.contentId)
      if (!content?.body.trim() || content.enrichmentStatus !== 'succeeded') {
        throw new Error('Only completely enriched content can be analyzed')
      }
      await this.writeRecord('analyses', analysis.id, 'analysis', analysis)
      this.upsertAnalysis(analysis)
      return analysis
    })
  }

  async saveAnalysisCall(
    input: z.input<typeof analysisCallSchema>
  ): Promise<AnalysisCall> {
    return this.serializeMutation(async () => {
      const call = analysisCallSchema.parse({
        ...input,
        error: input.error ? redactText(input.error) : undefined,
      })
      if (this.hasRecord('analysis_calls', call.id)) {
        throw new Error(`Analysis call ${call.id} is immutable`)
      }
      await this.writeRecord('analysis-calls', call.id, 'analysis call', call)
      this.upsertAnalysisCall(call)
      return call
    })
  }

  listAnalysisCalls(contentId?: string): AnalysisCall[] {
    const rows = contentId
      ? this.database
          .prepare(
            'SELECT record_json FROM analysis_calls WHERE content_id = ? ORDER BY id DESC'
          )
          .all(contentId)
      : this.database
          .prepare('SELECT record_json FROM analysis_calls ORDER BY id DESC')
          .all()
    return rows
      .map((row) => rowRecord(row, analysisCallSchema))
      .filter((record): record is AnalysisCall => Boolean(record))
  }

  contentMarkdownPath(contentId: string): string {
    return path.join(
      this.folder('contents'),
      storageKey(contentId),
      'content.md'
    )
  }

  async saveContentMedia(
    contentId: string,
    filename: string,
    bytes: Uint8Array
  ): Promise<string> {
    this.assertSafeMediaFilename(filename)
    const target = path.join(
      this.folder('contents'),
      storageKey(contentId),
      filename
    )
    await atomicWriteFile(target, bytes)
    return target
  }

  getProgress(sourceId: string): z.infer<typeof progressSchema> | undefined {
    return rowRecord(
      this.database
        .prepare('SELECT record_json FROM progress WHERE source_id = ?')
        .get(sourceId),
      progressSchema
    )
  }

  async saveAudit(input: z.input<typeof auditSchema>): Promise<RuntimeAudit> {
    return this.serializeMutation(() => this.saveAuditLocked(input))
  }

  private async saveAuditLocked(
    input: z.input<typeof auditSchema>
  ): Promise<RuntimeAudit> {
    const audit = auditSchema.parse({
      ...input,
      error: input.error ? redactText(input.error) : undefined,
    })
    if (this.hasRecord('audits', audit.id)) {
      throw new Error(`Audit ${audit.id} is immutable`)
    }
    await this.writeRecord('audits', audit.id, 'collection audit', audit)
    this.upsertAudit(audit)
    return audit
  }

  async getAudit(id: string): Promise<RuntimeAudit | undefined> {
    return rowRecord(
      this.database
        .prepare('SELECT record_json FROM audits WHERE id = ?')
        .get(id),
      auditSchema
    )
  }

  async saveRawResponse(input: {
    id: string
    providerId: string
    receivedAt: string
    expiresAt?: string
    retentionDays?: number
    payload: unknown
  }): Promise<string> {
    timestampSchema.parse(input.receivedAt)
    const retentionDays = input.retentionDays ?? 30
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
      throw new Error('Raw response retention must be a positive day count')
    }
    const expiresAt =
      input.expiresAt ??
      new Date(
        Date.parse(input.receivedAt) + retentionDays * 24 * 60 * 60 * 1000
      ).toISOString()
    timestampSchema.parse(expiresAt)
    const target = path.join(
      this.root,
      '.raw-responses',
      `${storageKey(input.id)}.json`
    )
    await atomicWriteFile(
      target,
      `${JSON.stringify(
        {
          id: input.id,
          providerId: input.providerId,
          receivedAt: input.receivedAt,
          expiresAt,
          payload: redactStructured(input.payload),
        },
        null,
        2
      )}\n`
    )
    return target
  }

  async purgeExpiredRawResponses(at = nowIso()): Promise<number> {
    let purged = 0
    const directory = path.join(this.root, '.raw-responses')
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw error
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const target = path.join(directory, entry.name)
      const record = JSON.parse(await readFile(target, 'utf8')) as {
        expiresAt?: unknown
      }
      if (typeof record.expiresAt === 'string' && record.expiresAt <= at) {
        await rm(target)
        purged += 1
      }
    }
    return purged
  }

  private folder(name: string): string {
    return path.join(this.root, name)
  }

  private hasRecord(
    table:
      'analyses' | 'analysis_calls' | 'audits' | 'contents' | 'discoveries',
    id: string
  ): boolean {
    return Boolean(
      this.database.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id)
    )
  }

  private async writeRecord(
    folder: string,
    id: string,
    kind: string,
    record: unknown
  ): Promise<void> {
    await atomicWriteFile(
      path.join(this.folder(folder), `${storageKey(id)}.md`),
      recordMarkdown(kind, record)
    )
  }

  private assertSafeMediaFilename(value: string): void {
    const stem = value.split('.')[0]?.toUpperCase()
    const reserved = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u
    if (
      !/^[a-z0-9][a-z0-9._-]*$/u.test(value) ||
      value.endsWith('.') ||
      value.includes('..') ||
      (stem && reserved.test(stem))
    ) {
      throw new Error(`Unsafe media filename: ${value}`)
    }
  }

  private upsertTask(task: RuntimeTask): StatementResultingChanges {
    return this.database
      .prepare(
        `INSERT INTO tasks
          (id, idempotency_key, source_id, type, status, available_at, created_at, payload_json, record_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          idempotency_key = excluded.idempotency_key,
          source_id = excluded.source_id,
          type = excluded.type,
          status = excluded.status,
          available_at = excluded.available_at,
          created_at = excluded.created_at,
          payload_json = excluded.payload_json,
          record_json = excluded.record_json`
      )
      .run(
        task.id,
        task.idempotencyKey,
        task.sourceId ?? null,
        task.type,
        task.status,
        task.availableAt,
        task.createdAt,
        JSON.stringify(task.payload),
        JSON.stringify(task)
      )
  }

  private upsertParameter(version: RuntimeParameterVersion): void {
    this.database
      .prepare(
        `INSERT INTO parameters (id, scope_key, created_at, record_json)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        version.id,
        scopeKey(version.scope),
        version.createdAt,
        JSON.stringify(version)
      )
  }

  private upsertContent(content: z.infer<typeof contentRecordSchema>): void {
    this.database
      .prepare(
        `INSERT INTO contents (id, record_json) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json`
      )
      .run(content.id, JSON.stringify(content))
  }

  private upsertDiscovery(
    discovery: z.infer<typeof discoveryRecordSchema>
  ): void {
    this.database
      .prepare(
        `INSERT INTO discoveries (id, source_id, content_id, record_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
          source_id = excluded.source_id,
          content_id = excluded.content_id,
          record_json = excluded.record_json`
      )
      .run(
        discovery.id,
        discovery.sourceId,
        discovery.contentId,
        JSON.stringify(discovery)
      )
  }

  private upsertProgress(progress: z.infer<typeof progressSchema>): void {
    this.database
      .prepare(
        `INSERT INTO progress (source_id, cursor, record_json) VALUES (?, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
          cursor = excluded.cursor,
          record_json = excluded.record_json`
      )
      .run(progress.sourceId, progress.cursor ?? '', JSON.stringify(progress))
  }

  private upsertAudit(audit: RuntimeAudit): void {
    this.database
      .prepare(
        `INSERT INTO audits (id, source_id, record_json) VALUES (?, ?, ?)`
      )
      .run(audit.id, audit.sourceId, JSON.stringify(audit))
  }

  private upsertAnalysis(analysis: AnalysisRecord): void {
    this.database
      .prepare(
        `INSERT INTO analyses
          (id, content_id, fingerprint, version, created_at, record_json)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        analysis.id,
        analysis.contentId,
        analysis.fingerprint,
        analysis.version,
        analysis.createdAt,
        JSON.stringify(analysis)
      )
  }

  private upsertAnalysisCall(call: AnalysisCall): void {
    this.database
      .prepare(
        `INSERT INTO analysis_calls (id, content_id, status, record_json)
         VALUES (?, ?, ?, ?)`
      )
      .run(call.id, call.contentId, call.status, JSON.stringify(call))
  }
}

export async function runPendingTasks(
  repository: RuntimeRepository,
  options: {
    concurrency: number
    workerIdPrefix: string
    handler(task: RuntimeTask): Promise<void>
  }
): Promise<void> {
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
    throw new Error('Concurrency must be a positive integer')
  }
  await Promise.all(
    Array.from({ length: options.concurrency }, async (_, index) => {
      const workerId = `${options.workerIdPrefix}-${index + 1}`
      for (;;) {
        const task = await repository.claimNextTask(workerId)
        if (!task) return
        try {
          await options.handler(task)
          await repository.completeTask(task.id)
        } catch (error) {
          await repository.failTask(
            task.id,
            error instanceof Error ? error.message : String(error)
          )
        }
      }
    })
  )
}
