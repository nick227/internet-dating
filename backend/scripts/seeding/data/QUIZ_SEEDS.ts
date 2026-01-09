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
    "slug": "avant-garde-unicorn-dreams",
    "title": "Avant-Garde Unicorn Dreams",
    "questions": [
      {
        "prompt": "You find a talking pigeon in your bathtub. What do you do?",
        "options": [
          {
            "label": "Offer it a crouton and ask for life advice.",
            "value": "crouton_wisdom",
            "traitValues": {
              "personality.funny": 8,
              "values.absurdism": 7,
              "personality.outgoing": 3,
              "interests.birds": 5
            }
          },
          {
            "label": "Challenge it to a game of chess.",
            "value": "chess_duel",
            "traitValues": {
              "interests.games": 7,
              "personality.introverted": 4,
              "values.logic": 6,
              "personality.quirky": 5
            }
          },
          {
            "label": "Scream and relocate to Saturn immediately.",
            "value": "saturn_escape",
            "traitValues": {
              "values.adventure": 10,
              "personality.funny": 6,
              "lifestyle.active": 3,
              "values.absurdism": 9
            }
          }
        ]
      },
      {
        "prompt": "Pick a breakfast you’d eat during post-apocalyptic brunch hour.",
        "options": [
          {
            "label": "Radioactive avocado toast topped with existential dread.",
            "value": "dread_toast",
            "traitValues": {
              "personality.introverted": 6,
              "values.absurdism": 8,
              "interests.food": 5,
              "personality.funny": 4
            }
          },
          {
            "label": "Canned unicorn tears with glitter granola.",
            "value": "unicorn_breakfast",
            "traitValues": {
              "interests.fantasy": 9,
              "values.creativity": 7,
              "personality.quirky": 6,
              "personality.outgoing": 4
            }
          },
          {
            "label": "Just eat time. Time is crunchy.",
            "value": "eat_time",
            "traitValues": {
              "values.absurdism": 10,
              "personality.funny": 3,
              "interests.scifi": 6,
              "personality.introverted": 5
            }
          }
        ]
      },
      {
        "prompt": "You're invited to a party hosted entirely by animated furniture. What's your move?",
        "options": [
          {
            "label": "Chat up the lamp — it has illuminating opinions.",
            "value": "lamp_convo",
            "traitValues": {
              "personality.outgoing": 7,
              "values.creativity": 6,
              "interests.design": 4,
              "personality.funny": 5
            }
          },
          {
            "label": "Become a recliner. Transcend the need for social small talk.",
            "value": "become_furniture",
            "traitValues": {
              "personality.introverted": 9,
              "values.philosophy": 7,
              "lifestyle.homebody": 5,
              "personality.quirky": 6
            }
          },
          {
            "label": "Lead the couch in a synchronized interpretive dance.",
            "value": "furniture_dance",
            "traitValues": {
              "lifestyle.active": 6,
              "personality.outgoing": 8,
              "values.absurdism": 9,
              "personality.funny": 7
            }
          }
        ]
      }
    ]
  }
};
