import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleSections, splitSections } from '../client/sections.js'

test('splitSections keeps an intro and headings', () => {
  const sections = splitSections('开头\n\n## 第一节\n\n内容一\n\n## 第二节\n\n内容二\n')
  assert.equal(sections.length, 3)
  assert.equal(sections[0].heading, null)
  assert.equal(sections[1].heading, '第一节')
  assert.equal(sections[2].text, '内容二')
})

test('assembleSections round-trips', () => {
  const body = '## 第一节\n\n内容一\n\n## 第二节\n\n内容二\n'
  const rebuilt = assembleSections(splitSections(body))
  assert.match(rebuilt, /## 第一节/)
  assert.match(rebuilt, /内容二/)
  assert.equal(assembleSections([]), '\n')
})
