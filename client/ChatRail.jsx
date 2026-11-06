import React from 'react'
import { api } from './api.js'
import { t } from './i18n.js'

export function ChatRail({ slug, onCollapse }) {
  const [session, setSession] = React.useState(null)
  const [messages, setMessages] = React.useState([])
  const [input, setInput] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const bodyRef = React.useRef(null)

  React.useEffect(() => {
    let alive = true
    setSession(null)
    setMessages([])
    setError('')
    if (!slug) return () => { alive = false }

    api(`/chat/sessions?slug=${encodeURIComponent(slug)}`)
      .then(async (data) => {
        if (!alive) return
        const first = data.sessions?.[0]
        if (!first) return
        const loaded = await api(`/chat/sessions/${first.id}`)
        if (!alive) return
        setSession(loaded)
        setMessages(loaded.messages || [])
      })
      .catch(() => {})
    return () => { alive = false }
  }, [slug])

  React.useEffect(() => {
    const element = bodyRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    if (!slug) {
      setError(t('先打开一篇文章'))
      return
    }
    setBusy(true)
    setError('')
    try {
      let current = session
      if (!current) {
        const created = await api('/chat/sessions', { method: 'POST', body: { slug } })
        current = created.session
        setSession(current)
      }
      const result = await api(`/chat/sessions/${current.id}/messages`, {
        method: 'POST',
        body: { content: text },
      })
      setSession(result.session)
      setMessages(result.session.messages || [])
      setInput('')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function newSession() {
    if (!slug) return
    try {
      const created = await api('/chat/sessions', { method: 'POST', body: { slug } })
      setSession(created.session)
      setMessages([])
      setInput('')
      setError('')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="blog-chat">
      <div className="blog-chat-head">
        <span>{t('AI 对话')}</span>
        <span className="blog-spacer" />
        <button type="button" className="blog-link" onClick={newSession} disabled={!slug || busy}>{t('新对话')}</button>
        {onCollapse ? <button type="button" className="blog-link" onClick={onCollapse}>{t('收起')}</button> : null}
      </div>
      <div className="blog-chat-body" ref={bodyRef}>
        {!slug ? <p className="blog-muted">{t('打开一篇文章后可以对话。')}</p> : null}
        {slug && !messages.length ? <p className="blog-muted">{t('问点什么，例如：第二节改具体些。')}</p> : null}
        {messages.map((message, index) => (
          <div
            key={index}
            className={`blog-chat-msg is-${message.role}${message.error ? ' is-error' : ''}`}
          >
            {message.content}
          </div>
        ))}
        {error ? <p className="blog-note is-error">{error}</p> : null}
      </div>
      <div className="blog-chat-input">
        <textarea
          rows={3}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              send()
            }
          }}
          placeholder={slug ? t('Enter 发送，Shift+Enter 换行') : t('先打开一篇文章')}
          disabled={!slug || busy}
        />
        <button type="button" className="blog-button is-primary" onClick={send} disabled={!slug || busy || !input.trim()}>
          {busy ? t('发送中…') : t('发送')}
        </button>
      </div>
    </div>
  )
}
