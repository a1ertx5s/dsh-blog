// 图片：按 magic bytes 识别类型，内容寻址存储，拒绝 SVG。
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const NAME = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null
  if (buffer.subarray(0, 8).equals(PNG)) return { ext: 'png', mime: 'image/png' }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' }
  const head = buffer.subarray(0, 6).toString('ascii')
  if (head === 'GIF87a' || head === 'GIF89a') return { ext: 'gif', mime: 'image/gif' }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' }
  }
  return null
}

export function isImageName(name) {
  return typeof name === 'string' && NAME.test(name)
}

export async function saveImage(root, buffer, { maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('空文件'), { status: 400 })
  }
  if (buffer.length > maxBytes) {
    throw Object.assign(new Error('图片超过 10MB'), { status: 413 })
  }
  const kind = detectImage(buffer)
  if (!kind) {
    throw Object.assign(new Error('只支持 PNG / JPEG / WebP / GIF'), { status: 415 })
  }

  const hash = createHash('sha256').update(buffer).digest('hex')
  const name = `${hash}.${kind.ext}`
  const dir = join(root, 'content', 'images')
  await mkdir(dir, { recursive: true })
  const file = join(dir, name)
  try {
    await readFile(file)
  } catch {
    await writeFile(file, buffer)
  }

  return { name, src: `/images/${name}`, mime: kind.mime, size: buffer.length }
}

export async function readImage(root, name) {
  if (!isImageName(name)) return null
  try {
    const buffer = await readFile(join(root, 'content', 'images', name))
    const mime = name.endsWith('.png') ? 'image/png'
      : name.endsWith('.jpg') ? 'image/jpeg'
        : name.endsWith('.webp') ? 'image/webp'
          : 'image/gif'
    return { buffer, mime }
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}
