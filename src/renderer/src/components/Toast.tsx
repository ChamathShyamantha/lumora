import { useCallback, useRef, useState } from 'react'

export type ShowToast = (message: string) => void

export function useToast(): { message: string | null; show: ShowToast } {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 2600)
  }, [])
  return { message, show }
}

export function Toast(props: { message: string | null }) {
  if (!props.message) return null
  return <div className="toast">{props.message}</div>
}
