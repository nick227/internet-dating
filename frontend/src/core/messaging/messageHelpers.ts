export const ICE_BREAKERS = [
  'Hey! How are you?',
  'What brings you here?',
  'Tell me about yourself',
  'What are you up to today?',
  'Nice to meet you!',
  'How was your day?',
  'What do you like to do for fun?',
  'Any plans for the weekend?',
]

export const RESPONSES = [
  'That sounds great!',
  'I totally agree',
  'Tell me more',
  'Interesting!',
  'I see what you mean',
  'That makes sense',
  'Thanks for sharing',
  'I appreciate that',
  'Same here!',
  'How interesting',
]

export function getRandomSuggestions(count: number, isFirstMessage: boolean): string[] {
  const pool = isFirstMessage ? ICE_BREAKERS : RESPONSES
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, Math.min(count, pool.length))
}
