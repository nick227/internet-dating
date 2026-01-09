type QuizSeed = {
  slug: string;
  title: string;
  questions: Array<{
    prompt: string;
    options: Array<{
      label: string;
      value: string;
      traitValues?: Record<string, number>; // e.g., {"personality.funny": 2, "personality.nice": -5}
    }>;
  }>;
};
// Root container
export interface QuizQuestion {
  prompt: string
  options: QuizOption[]
}

// Option per question
export interface QuizOption {
  label: string
  value: string
  traitValues: TraitValueMap
}

// Flexible trait scoring map
export type TraitValueMap = {
  [traitKey: string]: number
}

export const QUIZ_SEEDS: Record<'core', QuizSeed> = {
  core: {
    slug: 'seed-core-quiz',
    title: 'Core Questions',
    questions: [
      {
        prompt: 'Ideal Friday night?',
        options: [
          {
            label: 'Cozy movie at home',
            value: 'cozy_movie',
            traitValues: {
              'personality.introverted': 5,
              'lifestyle.homebody': 7,
              'personality.funny': -2,
              'lifestyle.active': -5
            }
          },
          {
            label: 'Live music or comedy',
            value: 'live_show',
            traitValues: {
              'personality.outgoing': 6,
              'personality.funny': 5,
              'lifestyle.social': 7,
              'interests.music': 8,
              'personality.introverted': -4
            }
          },
          {
            label: 'Outdoor adventure',
            value: 'adventure',
            traitValues: {
              'lifestyle.active': 8,
              'values.adventure': 9,
              'personality.outgoing': 4,
              'interests.sports': 6,
              'lifestyle.homebody': -7
            }
          }
        ]
      },
      {
        prompt: 'Pick a travel style',
        options: [
          {
            label: 'City weekends',
            value: 'city',
            traitValues: {
              'lifestyle.social': 6,
              'interests.culture': 7,
              'values.materialistic': 3,
              'lifestyle.active': 4
            }
          },
          {
            label: 'Nature retreats',
            value: 'nature',
            traitValues: {
              'personality.introverted': 4,
              'values.adventure': 6,
              'lifestyle.active': 7,
              'interests.nature': 8,
              'lifestyle.social': -3
            }
          },
          {
            label: 'Beach reset',
            value: 'beach',
            traitValues: {
              'personality.introverted': 3,
              'lifestyle.homebody': 2,
              'values.family': 5,
              'lifestyle.active': -2,
              'lifestyle.social': -1
            }
          }
        ]
      },
      {
        prompt: 'How social are you?',
        options: [
          {
            label: 'Low-key and selective',
            value: 'low_key',
            traitValues: {
              'personality.introverted': 7,
              'lifestyle.homebody': 5,
              'personality.outgoing': -6,
              'lifestyle.social': -5
            }
          },
          {
            label: 'Balanced mix',
            value: 'balanced',
            traitValues: {
              'personality.outgoing': 2,
              'personality.introverted': 0,
              'lifestyle.social': 2,
              'lifestyle.homebody': 2
            }
          },
          {
            label: 'Always up for plans',
            value: 'social',
            traitValues: {
              'personality.outgoing': 8,
              'lifestyle.social': 9,
              'personality.introverted': -7,
              'lifestyle.homebody': -6
            }
          }
        ]
      },
      {
        prompt: 'Choose a weekend activity',
        options: [
          {
            label: 'Farmers market + brunch',
            value: 'brunch',
            traitValues: {
              'lifestyle.homebody': 4,
              'interests.food': 8,
              'values.family': 5,
              'lifestyle.social': 3,
              'lifestyle.active': -2
            }
          },
          {
            label: 'Hike or workout',
            value: 'active',
            traitValues: {
              'lifestyle.active': 9,
              'interests.sports': 7,
              'values.health': 6,
              'personality.outgoing': 3,
              'lifestyle.homebody': -5
            }
          },
          {
            label: 'Museum or gallery',
            value: 'culture',
            traitValues: {
              'interests.culture': 8,
              'interests.arts': 7,
              'personality.analytical': 4,
              'personality.introverted': 2,
              'lifestyle.active': -3
            }
          }
        ]
      },
      {
        prompt: 'What makes you laugh?',
        options: [
          {
            label: 'Dry wit and clever jokes',
            value: 'dry_wit',
            traitValues: {
              'personality.funny': 6,
              'personality.analytical': 5,
              'personality.nice': -2,
              'interests.culture': 3
            }
          },
          {
            label: 'Silly memes and physical comedy',
            value: 'silly',
            traitValues: {
              'personality.funny': 8,
              'personality.outgoing': 4,
              'personality.analytical': -3,
              'lifestyle.social': 3
            }
          },
          {
            label: 'Heartwarming stories',
            value: 'heartwarming',
            traitValues: {
              'personality.nice': 7,
              'values.family': 6,
              'personality.funny': 2,
              'personality.outgoing': -2
            }
          }
        ]
      },
      {
        prompt: 'Your approach to decisions?',
        options: [
          {
            label: 'Trust my gut, act fast',
            value: 'intuitive',
            traitValues: {
              'personality.analytical': -5,
              'values.adventure': 4,
              'personality.outgoing': 3,
              'personality.introverted': -2
            }
          },
          {
            label: 'Weigh pros and cons carefully',
            value: 'analytical',
            traitValues: {
              'personality.analytical': 8,
              'personality.introverted': 3,
              'personality.outgoing': -2,
              'values.adventure': -3
            }
          },
          {
            label: 'Ask friends for input',
            value: 'collaborative',
            traitValues: {
              'lifestyle.social': 6,
              'values.family': 5,
              'personality.outgoing': 4,
              'personality.introverted': -4
            }
          }
        ]
      }
    ]
  }
};
