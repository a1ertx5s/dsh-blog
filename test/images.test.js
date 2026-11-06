import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { detectImage, isImageName, readImage, saveImage } from '../src/images.js'

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16, 1),
])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 2)])
const GIF = Buffer.concat([Buffer.from('GIF89a', 'ascii'), Buffer.alloc(16, 3)])
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(16, 4),
])

test('detectImage identifies supported formats', () => {
  assert.equal(detectImage(PNG)?.ext, 'png')
  assert.equal(detectImage(JPEG)?.ext, 'jpg')
  assert.equal(detectImage(GIF)?.ext, 'gif')
  assert.equal(detectImage(WEBP)?.ext, 'webp')
})

test('detectImage rejects SVG and plain text', () => {
  assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null)
  assert.equal(detectImage(Buffer.from('hello world, not an image')), null)
})

test('saveImage stores content-addressed files and dedupes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-image-'))
  try {
    const first = await saveImage(root, PNG)
    const second = await saveImage(root, PNG)
    assert.equal(first.name, second.name)
    assert.match(first.name, /^[a-f0-9]{64}\.png$/)
    assert.equal(first.src, `/images/${first.name}`)
    assert.equal(first.mime, 'image/png')

    const read = await readImage(root, first.name)
    assert.equal(read.mime, 'image/png')
    assert.ok(read.buffer.equals(PNG))
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('saveImage rejects unsupported and oversized files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-blog-image-'))
  try {
    await assert.rejects(saveImage(root, Buffer.from('nope')), (err) => err.status === 415)
    await assert.rejects(saveImage(root, PNG, { maxBytes: 4 }), (err) => err.status === 413)
    assert.equal(await readImage(root, '../secret'), null)
    assert.equal(isImageName('deadbeef.png'), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
