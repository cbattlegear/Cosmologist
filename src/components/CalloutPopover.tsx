import { useRef, useEffect } from 'react'
import type { MouseEvent } from 'react'
import './CalloutPopover.css'

// Auto-link URLs in plain text
function linkify(text: string) {
  const urlRe = /(https?:\/\/[^\s<]+)/g
  const parts = text.split(urlRe)
  return parts.map((part, i) =>
    urlRe.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a>
    ) : (
      <span key={i}>{part}</span>
    ),
  )
}

interface CalloutPopoverProps {
  text: string
  onEdit: () => void
  onRemove: () => void
  onClose: () => void
}

export default function CalloutPopover({ text, onEdit, onRemove, onClose }: CalloutPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      className="callout-popover"
      ref={ref}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onMouseDown={(e: MouseEvent) => e.stopPropagation()}
    >
      <p className="callout-popover__text">{linkify(text)}</p>
      <div className="callout-popover__actions">
        <button onClick={onEdit}>Edit</button>
        <button onClick={onRemove}>Remove</button>
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
