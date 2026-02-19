import { useRef, useCallback, useState } from 'react'

/**
 * A simple undo/redo history stack.
 * `push` adds a snapshot and clears the redo stack.
 * `undo` moves one step back and returns the previous snapshot.
 * `redo` moves one step forward and returns the next snapshot.
 * `canUndo` / `canRedo` are reactive booleans for disabling buttons.
 */
export function useHistory<T>(maxSize = 50) {
  const pastRef = useRef<T[]>([])
  const futureRef = useRef<T[]>([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const updateFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 1)
    setCanRedo(futureRef.current.length > 0)
  }, [])

  const push = useCallback(
    (snapshot: T) => {
      pastRef.current = [...pastRef.current.slice(-(maxSize - 1)), snapshot]
      futureRef.current = []
      updateFlags()
    },
    [maxSize, updateFlags],
  )

  const undo = useCallback((): T | undefined => {
    if (pastRef.current.length <= 1) return undefined
    const present = pastRef.current[pastRef.current.length - 1]
    const prev = pastRef.current[pastRef.current.length - 2]
    pastRef.current = pastRef.current.slice(0, -1)
    futureRef.current = [present, ...futureRef.current]
    updateFlags()
    return prev
  }, [updateFlags])

  const redo = useCallback((): T | undefined => {
    if (!futureRef.current.length) return undefined
    const next = futureRef.current[0]
    futureRef.current = futureRef.current.slice(1)
    pastRef.current = [...pastRef.current, next]
    updateFlags()
    return next
  }, [updateFlags])

  return { push, undo, redo, canUndo, canRedo }
}
