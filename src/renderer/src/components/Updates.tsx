import { useEffect, useState } from 'react'
import type { UpdateStatus } from '../types'
import { IconDownload, IconRefresh } from './icons'

export function useUpdateStatus(): { status: UpdateStatus | null; version: string } {
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [version, setVersion] = useState('')
  useEffect(() => {
    void window.lumora.updates.status().then(setStatus)
    void window.lumora.updates.version().then(setVersion)
    return window.lumora.updates.onStatus(setStatus)
  }, [])
  return { status, version }
}

const restart = (): void => {
  if (confirm('Restart Lumora now to install the update?')) void window.lumora.updates.install()
}

/** Top-bar pill shown only when a downloaded update is waiting. */
export function UpdatePill() {
  const { status } = useUpdateStatus()
  if (status?.state !== 'ready') return null
  return (
    <button className="status-pill" onClick={restart} title="Restart to install the update">
      <IconDownload /> Update {status.version} ready
    </button>
  )
}

export function UpdatesCard() {
  const { status, version } = useUpdateStatus()
  const [checking, setChecking] = useState(false)

  let text = ''
  switch (status?.state) {
    case 'dev':
      text = 'Updates are checked automatically in the installed app (not in development mode).'
      break
    case 'store':
      text = 'Installed from the Microsoft Store — updates arrive automatically through the Store.'
      break
    case 'checking':
      text = 'Checking for updates…'
      break
    case 'up-to-date':
      text = 'You have the latest version.'
      break
    case 'downloading':
      text = `Downloading version ${status.version}… ${status.percent}%`
      break
    case 'ready':
      text = `Version ${status.version} is downloaded. Restart Lumora to install it.`
      break
    case 'error':
      text = `Couldn't check for updates: ${status.message}`
      break
    default:
      text = 'Lumora checks for updates in the background and downloads them for you.'
  }

  return (
    <div className="card stack">
      <div className="field-row">
        <h2>Updates</h2>
        <span className="field-value">v{version}</span>
      </div>
      <p className="small muted" style={{ color: status?.state === 'error' ? 'var(--bad)' : undefined }}>
        {text}
      </p>
      {status?.state === 'downloading' && (
        <div className="meter-bar">
          <span style={{ width: `${status.percent}%`, background: 'var(--ink)' }} />
        </div>
      )}
      <div className="row">
        {status?.state === 'ready' ? (
          <button className="btn primary" onClick={restart}>
            Restart to update
          </button>
        ) : (
          <button
            className="btn"
            disabled={checking || status?.state === 'dev' || status?.state === 'store' || status?.state === 'downloading'}
            onClick={async () => {
              setChecking(true)
              await window.lumora.updates.check()
              setChecking(false)
            }}
          >
            <IconRefresh /> {checking ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
    </div>
  )
}
