export const CORE_SECTIONS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'matches', label: 'Matches' },
  { id: 'likes', label: 'Likes' },
  { id: 'followers', label: 'Followers' },
  { id: 'following', label: 'Following' },
] as const

export const EXTRA_SECTIONS = [
  { id: 'drafts', label: 'Drafts' },
  { id: 'sent', label: 'Sent' },
  { id: 'trash', label: 'Trash' },
] as const

export const ALL_SECTIONS = [...CORE_SECTIONS, ...EXTRA_SECTIONS] as const

export type SectionId = (typeof ALL_SECTIONS)[number]['id']
export type CountState =
  | { status: 'loading' }
  | {
      status: 'ready'
      value: number
    }

export type SectionCounts = Record<SectionId, CountState>

export const LOADING_COUNT: CountState = { status: 'loading' }
export const readyCount = (value: number): CountState => ({ status: 'ready', value })

export const DEFAULT_COUNTS = ALL_SECTIONS.reduce((acc, section) => {
  acc[section.id] = LOADING_COUNT
  return acc
}, {} as SectionCounts)

const SECTION_LABELS = new Map<SectionId, string>(
  ALL_SECTIONS.map(section => [section.id, section.label])
)

const SECTION_SET = new Set<string>(ALL_SECTIONS.map(section => section.id))

export function isSectionId(value?: string): value is SectionId {
  return value != null && SECTION_SET.has(value)
}

export function getSectionLabel(section: SectionId) {
  return SECTION_LABELS.get(section) ?? 'Connections'
}
