import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { routes } from '../routes.ts'
import { loginHref } from './login-href.ts'

describe('loginHref', () => {
  it('is the sign-in form URL with no splash query', () => {
    assert.equal(loginHref(), routes.login.index.href())
    assert.equal(loginHref(), '/login')
  })

  it('marks anonymous home landing with welcome=1', () => {
    assert.equal(loginHref({ welcome: true }), '/login?welcome=1')
  })

  it('attaches a same-origin returnTo without enabling splash', () => {
    assert.equal(loginHref({ returnTo: '/files' }), '/login?returnTo=%2Ffiles')
  })

  it('drops unsafe returnTo values', () => {
    assert.equal(loginHref({ returnTo: 'https://evil.example' }), '/login')
  })
})
