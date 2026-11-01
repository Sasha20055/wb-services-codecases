import { useEffect, useMemo, useRef, useState } from "react"

export function useDebouncedValue<T>(value: T, delay = 200) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}

type AnyFn = (...a: any[]) => any
type Debounced<T extends AnyFn> = ((...a: Parameters<T>) => void) & {
  cancel: () => void
  flush: (...a: Parameters<T>) => void
}

export function useDebouncedCallback<T extends AnyFn>(fn: T, delay = 200): Debounced<T> {
  const fnRef = useRef(fn)
  const t = useRef<number | null>(null)
  useEffect(() => {
    fnRef.current = fn
  }, [fn])
  useEffect(() => {
    return () => {
      if (t.current) {
        clearTimeout(t.current)
        t.current = null
      }
    }
  }, [])
  return useMemo(() => {
    const d = ((...args: Parameters<T>) => {
      if (t.current) clearTimeout(t.current)
      t.current = window.setTimeout(() => {
        fnRef.current(...args)
      }, delay)
    }) as Debounced<T>
    d.cancel = () => {
      if (t.current) {
        clearTimeout(t.current)
        t.current = null
      }
    }
    d.flush = (...args: Parameters<T>) => {
      d.cancel()
      fnRef.current(...args)
    }
    return d
  }, [delay])
}
