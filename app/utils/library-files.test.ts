import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  filterLibraryFiles,
  formatLibraryActivity,
  libraryFileIsImage,
  libraryFileKind,
} from './library-files.ts'

describe('library-files helpers', () => {
  it('detects images from mime or extension', () => {
    assert.equal(
      libraryFileIsImage({ filename: 'a.txt', meta: { content_type: 'image/png' } }),
      true,
    )
    assert.equal(libraryFileIsImage({ filename: 'photo.JPG', meta: null }), true)
    assert.equal(libraryFileIsImage({ filename: 'notes.pdf', meta: null }), false)
  })

  it('filters by tab and filename query', () => {
    let files = [
      { id: '1', filename: 'Audit.pdf', meta: null },
      { id: '2', filename: 'chart.png', meta: { content_type: 'image/png' } },
      { id: '3', filename: 'notes.txt', meta: null },
    ]
    assert.deepEqual(
      filterLibraryFiles(files, { query: '', tab: 'images' }).map((f) => f.id),
      ['2'],
    )
    assert.deepEqual(
      filterLibraryFiles(files, { query: 'audit', tab: 'all' }).map((f) => f.id),
      ['1'],
    )
  })

  it('formats relative activity from unix seconds', () => {
    let now = 1_700_000_000_000
    assert.equal(formatLibraryActivity(1_700_000_000 - 30, now), 'Modified just now')
    assert.equal(formatLibraryActivity(1_700_000_000 - 3600, now), 'Modified 1h ago')
    assert.equal(formatLibraryActivity(1_700_000_000 - 86_400 * 3, now), 'Modified 3d ago')
  })

  it('classifies pdf/doc/image kinds', () => {
    assert.equal(libraryFileKind({ filename: 'a.pdf', meta: null }), 'pdf')
    assert.equal(libraryFileKind({ filename: 'a.docx', meta: null }), 'doc')
    assert.equal(libraryFileKind({ filename: 'a.png', meta: null }), 'image')
    assert.equal(libraryFileKind({ filename: 'a.bin', meta: null }), 'other')
  })
})
