import type { FeedCardComments } from '../../api/types'

export function commentIntentLabel(intent?: FeedCardComments['intent']) {
  switch (intent) {
    case 'ask':
      return 'Ask'
    case 'react':
      return 'React'
    case 'respond':
      return 'Reply'
    default:
      return 'Comments'
  }
}
