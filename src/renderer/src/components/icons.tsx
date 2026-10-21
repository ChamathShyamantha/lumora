import type { ReactElement, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>
const base = (children: ReactElement | ReactElement[], props: P): ReactElement => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
    {children}
  </svg>
)

export const IconLibrary = (p: P) => base([<rect key="a" x="3" y="3" width="7" height="7" rx="1.5" />, <rect key="b" x="14" y="3" width="7" height="7" rx="1.5" />, <rect key="c" x="3" y="14" width="7" height="7" rx="1.5" />, <rect key="d" x="14" y="14" width="7" height="7" rx="1.5" />], p)
export const IconLayers = (p: P) => base([<path key="a" d="M12 3 2 8l10 5 10-5-10-5Z" />, <path key="b" d="m2 13 10 5 10-5" />, <path key="c" d="m2 17.5 10 5 10-5" />], p)
export const IconCode = (p: P) => base([<path key="a" d="m8 7-5 5 5 5" />, <path key="b" d="m16 7 5 5-5 5" />, <path key="c" d="m14 4-4 16" />], p)
export const IconLayout = (p: P) => base([<rect key="a" x="3" y="4" width="18" height="16" rx="2" />, <path key="b" d="M7 9h4v4H7z" />, <path key="c" d="M14 9h3M14 13h3M7 16h10" />], p)
export const IconDevices = (p: P) => base([<rect key="a" x="2" y="6" width="14" height="9" rx="1.5" />, <path key="b" d="M5 18h8" />, <rect key="c" x="18" y="7" width="4" height="10" rx="2" />], p)
export const IconSettings = (p: P) => base([<circle key="a" cx="12" cy="12" r="3" />, <path key="b" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />], p)
export const IconSun = (p: P) => base([<circle key="a" cx="12" cy="12" r="4" />, <path key="b" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />], p)
export const IconStar = (p: P & { filled?: boolean }) => {
  const { filled, ...rest } = p
  return base(<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z" fill={filled ? 'currentColor' : 'none'} />, rest)
}
export const IconEdit = (p: P) => base([<path key="a" d="M12 20h9" />, <path key="b" d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />], p)
export const IconTrash = (p: P) => base([<path key="a" d="M3 6h18" />, <path key="b" d="M8 6V4h8v2" />, <path key="c" d="M19 6 18 20H6L5 6" />], p)
export const IconDownload = (p: P) => base([<path key="a" d="M12 3v12" />, <path key="b" d="m7 10 5 5 5-5" />, <path key="c" d="M5 21h14" />], p)
export const IconUpload = (p: P) => base([<path key="a" d="M12 21V9" />, <path key="b" d="m7 14 5-5 5 5" />, <path key="c" d="M5 3h14" />], p)
export const IconFolder = (p: P) => base(<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />, p)
export const IconPlus = (p: P) => base(<path d="M12 5v14M5 12h14" />, p)
export const IconEye = (p: P) => base([<path key="a" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />, <circle key="b" cx="12" cy="12" r="3" />], p)
export const IconEyeOff = (p: P) => base([<path key="a" d="M3 3l18 18" />, <path key="b" d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.1 6.1A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.9-2.1" />], p)
export const IconUp = (p: P) => base(<path d="m6 15 6-6 6 6" />, p)
export const IconDown = (p: P) => base(<path d="m6 9 6 6 6-6" />, p)
export const IconCopy = (p: P) => base([<rect key="a" x="8" y="8" width="13" height="13" rx="2" />, <path key="b" d="M4 16V5a2 2 0 0 1 2-2h11" />], p)
export const IconMusic = (p: P) => base([<path key="a" d="M9 18V5l12-2v13" />, <circle key="b" cx="6" cy="18" r="3" />, <circle key="c" cx="18" cy="16" r="3" />], p)
export const IconMonitor = (p: P) => base([<rect key="a" x="2" y="3" width="20" height="14" rx="2" />, <path key="b" d="M8 21h8M12 17v4" />], p)
export const IconX = (p: P) => base(<path d="M6 6l12 12M18 6 6 18" />, p)
export const IconPlay = (p: P) => base(<path d="M7 4v16l13-8Z" fill="currentColor" />, p)
export const IconSave = (p: P) => base([<path key="a" d="M5 3h11l5 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />, <path key="b" d="M7 3v5h8" />, <rect key="c" x="7" y="13" width="10" height="8" />], p)
export const IconRotate = (p: P) => base([<path key="a" d="M21 12a9 9 0 1 1-3-6.7L21 8" />, <path key="b" d="M21 3v5h-5" />], p)
export const IconRefresh = IconRotate
export const IconWand = (p: P) => base([<path key="a" d="m15 4 5 5L9 20l-5-5Z" />, <path key="b" d="M5 3v4M3 5h4M19 15v4M17 17h4" />], p)
export const IconChat = (p: P) => base([<path key="a" d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />, <path key="b" d="M8.5 11h.01M12 11h.01M15.5 11h.01" />], p)
