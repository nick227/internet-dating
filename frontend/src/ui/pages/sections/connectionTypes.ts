import type { CountState, SectionId } from './sectionsConfig'

export type HeaderState = {
  title: string
  onRefresh: (() => void) | null
  refreshDisabled: boolean
}

export type HeaderRegister = (sectionId: SectionId, partial: Partial<HeaderState>) => void
export type CountRegister = (section: SectionId, count: CountState) => void
export type DrawerLockRegister = (locked: boolean) => void
export type CountsInvalidator = (sections: SectionId[]) => void
