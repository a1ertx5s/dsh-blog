// 把正文按 ## 小节拆分 / 拼装。
export function splitSections(body) {
  const text = String(body || '')
  const lines = text.split('\n')
  const sections = []
  let current = { heading: null, lines: [] }

  for (const line of lines) {
    const match = /^##\s+(.+)$/.exec(line)
    if (match) {
      if (current.heading !== null || current.lines.join('\n').trim()) {
        sections.push({ heading: current.heading, text: current.lines.join('\n').trim() })
      }
      current = { heading: match[1].trim(), lines: [] }
    } else {
      current.lines.push(line)
    }
  }

  if (current.heading !== null || current.lines.join('\n').trim()) {
    sections.push({ heading: current.heading, text: current.lines.join('\n').trim() })
  }

  return sections.length ? sections : [{ heading: null, text: '' }]
}

export function assembleSections(sections) {
  return sections
    .map((section) => {
      const text = String(section.text || '').trim()
      if (!section.heading) return text
      return `## ${section.heading}\n\n${text}`.trim()
    })
    .filter(Boolean)
    .join('\n\n') + '\n'
}
