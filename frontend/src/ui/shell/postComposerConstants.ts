/**
 * Constants for post composer
 */
export const MAX_TEXT_LENGTH = 320
export const MAX_TAG_LENGTH = 24
export const MAX_FILE_BYTES = 1024 * 1024 * 1024 // 1GB
export const MAX_AUDIO_CAPTURE_MS = 60000
export const CLOSE_CONFIRM_MESSAGE = 'Discard this draft?'
export const ERROR_TOAST_MS = 6000
export const SUCCESS_TOAST_MS = 2200
export const SUCCESS_CLOSE_DELAY_MS = 1200

export const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i

export const TAG_SUGGESTIONS = [
  'dating',
  'relationship',
  'friendship',
  'travel',
  'food',
  'music',
  'art',
  'sports',
  'fitness',
  'photography',
  'writing',
  'gaming',
]
