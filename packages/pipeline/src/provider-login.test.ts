import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  createModels,
  type AuthInteraction,
  type OAuthCredential,
} from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createFileModelCredentialStore } from './model-credential-store.js'
import { createProviderLoginManager } from './provider-login.js'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const fn of cleanup.splice(0)) await fn()
})
const credential: OAuthCredential = {
  type: 'oauth',
  access: 'private-access',
  refresh: 'private-refresh',
  expires: 4102444800000,
}
async function fixture(
  login: (interaction: AuthInteraction) => Promise<OAuthCredential>,
  timeout = 600000
) {
  const root = await mkdtemp(path.join(tmpdir(), 'provider-login-'))
  const store = createFileModelCredentialStore(path.join(root, 'auth.json'))
  const models = createModels({ credentials: store })
  const provider = openaiCodexProvider()
  models.setProvider({
    ...provider,
    id: 'test',
    auth: { oauth: { ...provider.auth.oauth!, login } },
  })
  const manager = createProviderLoginManager(store, models, timeout)
  cleanup.push(async () => {
    manager.stop()
    await rm(root, { recursive: true, force: true })
  })
  return { store, manager }
}

it('persists successful login without returning credentials and rejects stale responses', async () => {
  const { manager, store } = await fixture(async (interaction) => {
    interaction.notify({ type: 'auth_url', url: 'https://example.com/login' })
    expect(
      await interaction.prompt({ type: 'manual_code', message: 'Code' })
    ).toBe('answer')
    return credential
  })
  const session = manager.start('test')
  const prompt = manager.get(session.id).prompt!
  manager.respond(session.id, prompt.id, 'answer')
  expect(() => manager.respond(session.id, prompt.id, 'again')).toThrow()
  await expect.poll(() => manager.get(session.id).status).toBe('completed')
  expect(await store.read('test')).toEqual(credential)
  expect(JSON.stringify(manager.get(session.id))).not.toContain('private')
})

it('cancellation preserves existing account and prevents late writes', async () => {
  const { manager, store } = await fixture(async (interaction) => {
    await interaction.prompt({ type: 'secret', message: 'Code' })
    return credential
  })
  await store.modify('test', async () => ({
    ...credential,
    access: 'original',
  }))
  const session = manager.start('test')
  manager.cancel(session.id)
  await new Promise((resolve) => setTimeout(resolve, 10))
  expect(manager.get(session.id).status).toBe('cancelled')
  expect(await store.read('test')).toMatchObject({ access: 'original' })
})

it('expires pending sessions and supports retry after failure', async () => {
  const { manager } = await fixture(async (interaction) => {
    await interaction.prompt({ type: 'text', message: 'Continue' })
    throw new Error('private-provider-error')
  }, 30)
  const expired = manager.start('test')
  await expect.poll(() => manager.get(expired.id).status).toBe('expired')
  const retry = manager.start('test')
  manager.respond(retry.id, manager.get(retry.id).prompt!.id, 'continue')
  await expect.poll(() => manager.get(retry.id).status).toBe('failed')
  expect(JSON.stringify(manager.get(retry.id))).not.toContain(
    'private-provider-error'
  )
})

it('allows callback completion to abort an unanswered manual prompt', async () => {
  const { manager, store } = await fixture(async (interaction) => {
    const manual = new AbortController()
    const answer = interaction
      .prompt({
        type: 'manual_code',
        message: 'Fallback',
        signal: manual.signal,
      })
      .catch(() => undefined)
    manual.abort()
    await answer
    return credential
  })
  const session = manager.start('test')
  await expect.poll(() => manager.get(session.id).status).toBe('completed')
  expect(manager.get(session.id).prompt).toBeUndefined()
  expect(await store.read('test')).toEqual(credential)
})
