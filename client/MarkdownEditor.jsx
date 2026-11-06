import React from 'react'
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { replaceAll } from '@milkdown/kit/utils'

export function MarkdownEditor({ value, onChange }) {
  const host = React.useRef(null)
  const editor = React.useRef(null)
  const latest = React.useRef(String(value || ''))
  const changeRef = React.useRef(onChange)

  React.useEffect(() => { changeRef.current = onChange }, [onChange])

  React.useEffect(() => {
    let disposed = false
    if (!host.current) return undefined

    Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host.current)
        ctx.set(defaultValueCtx, latest.current)
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          latest.current = markdown
          changeRef.current?.(markdown)
        })
      })
      .use(commonmark)
      .use(listener)
      .create()
      .then((instance) => {
        if (disposed) {
          instance.destroy()
          return
        }
        editor.current = instance
      })
      .catch(() => {})

    return () => {
      disposed = true
      editor.current?.destroy()
      editor.current = null
    }
  }, [])

  React.useEffect(() => {
    if (!editor.current) return
    if (value === latest.current) return
    latest.current = value
    editor.current.action(replaceAll(value || ''))
  }, [value])

  return <div className="blog-richtext" ref={host} />
}
