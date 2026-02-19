import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CalloutPopover from './CalloutPopover'

describe('CalloutPopover', () => {
  it('renders note text', () => {
    render(<CalloutPopover text="Hello world" onEdit={() => {}} onRemove={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('auto-links URLs', () => {
    render(<CalloutPopover text="Visit https://example.com for more" onEdit={() => {}} onRemove={() => {}} onClose={() => {}} />)
    const link = screen.getByText('https://example.com')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', 'https://example.com')
    expect(link).toHaveAttribute('target', '_blank')
  })

  it('calls onEdit when Edit clicked', () => {
    const onEdit = vi.fn()
    render(<CalloutPopover text="note" onEdit={onEdit} onRemove={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Edit'))
    expect(onEdit).toHaveBeenCalledOnce()
  })

  it('calls onRemove when Remove clicked', () => {
    const onRemove = vi.fn()
    render(<CalloutPopover text="note" onEdit={() => {}} onRemove={onRemove} onClose={() => {}} />)
    fireEvent.click(screen.getByText('Remove'))
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
