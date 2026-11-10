import React from 'react'

export function GlassTabs({ items, value, onChange }) {
  const containerRef = React.useRef(null)
  const refs = React.useRef([])
  const [ready, setReady] = React.useState(false)

  const measure = React.useCallback(() => {
    const container = containerRef.current
    const index = items.findIndex((item) => item.key === value)
    const element = refs.current[index]
    if (!container || !element) return
    container.style.setProperty('--pill-x', `${element.offsetLeft}px`)
    container.style.setProperty('--pill-w', `${element.offsetWidth}px`)
  }, [items, value])

  React.useLayoutEffect(() => {
    measure()
    const frame = requestAnimationFrame(() => setReady(true))
    return () => cancelAnimationFrame(frame)
  }, [measure])

  React.useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    refs.current.forEach((element) => { if (element) observer.observe(element) })
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => {})
    return () => observer.disconnect()
  }, [measure])

  function onKeyDown(event) {
    const index = items.findIndex((item) => item.key === value)
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = items.length - 1
    else return

    event.preventDefault()
    onChange?.(items[next].key)
    refs.current[next]?.focus()
  }

  return (
    <div
      ref={containerRef}
      className="glass-tabs"
      role="tablist"
      data-ready={ready ? 'true' : 'false'}
      onKeyDown={onKeyDown}
    >
      <span className="glass-tabs__pill" aria-hidden="true" />
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={value === item.key}
          tabIndex={value === item.key ? 0 : -1}
          className="glass-tabs__item"
          ref={(element) => { refs.current[index] = element }}
          onClick={() => onChange?.(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
