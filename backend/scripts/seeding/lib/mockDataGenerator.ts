/**
 * Mock data pools and generation utilities
 * All functions accept RNG for deterministic output
 */

import type { RNG } from './prng.js';

// Name pools
const MALE_NAMES = [
  'Alex', 'Blake', 'Cameron', 'Dylan', 'Ethan', 'Felix', 'Gabriel', 'Henry', 'Isaac', 'Jack',
  'Kai', 'Leo', 'Max', 'Noah', 'Oliver', 'Parker', 'Quinn', 'Ryan', 'Sam', 'Tyler',
  'Victor', 'Wesley', 'Xander', 'Zachary', 'Adrian', 'Ben', 'Cole', 'Derek', 'Evan', 'Finn',
  'George', 'Hudson', 'Ian', 'Jason', 'Kyle', 'Logan', 'Mason', 'Nathan', 'Owen', 'Peter',
  'Reed', 'Sean', 'Troy', 'Vincent', 'Will', 'Zane', 'Austin', 'Brandon', 'Chase', 'Dominic',
  'Eli', 'Gavin', 'Hunter', 'Jace', 'Liam', 'Miles', 'Nick', 'Oscar', 'River', 'Sebastian',
  'Theo', 'Wyatt', 'Adam', 'Brian', 'Carlos', 'Daniel', 'Eric', 'Frank', 'Grant', 'Henry',
  'Ivan', 'James', 'Kevin', 'Lucas', 'Mark', 'Neil', 'Paul', 'Roger', 'Steve', 'Thomas',
  'Vince', 'Walter', 'Xavier', 'Yuri', 'Asher', 'Blake', 'Caleb', 'Dean', 'Elias', 'Felix',
  'Grayson', 'Harrison', 'Isaiah', 'Julian', 'Knox', 'Levi', 'Milo', 'Nolan', 'Phoenix', 'Rowan'
];

const FEMALE_NAMES = [
  'Aria', 'Bella', 'Chloe', 'Diana', 'Emma', 'Fiona', 'Grace', 'Hannah', 'Ivy', 'Julia',
  'Kate', 'Luna', 'Maya', 'Nina', 'Olivia', 'Piper', 'Quinn', 'Rose', 'Sage', 'Tessa',
  'Uma', 'Violet', 'Willow', 'Zoe', 'Ava', 'Blair', 'Clara', 'Daisy', 'Ella', 'Faith',
  'Gemma', 'Hope', 'Iris', 'Jade', 'Kira', 'Lily', 'Mia', 'Nora', 'Pearl', 'Ruby',
  'Sara', 'Talia', 'Vera', 'Wren', 'Yasmin', 'Aurora', 'Brooke', 'Claire', 'Daphne', 'Elise',
  'Freya', 'Georgia', 'Hazel', 'Isla', 'Jasmine', 'Kenna', 'Layla', 'Mila', 'Nova', 'Ophelia',
  'Penelope', 'Riley', 'Stella', 'Taylor', 'Valerie', 'Whitney', 'Yvonne', 'Alice', 'Beth', 'Cara',
  'Dana', 'Elena', 'Faye', 'Gwen', 'Holly', 'Imogen', 'Jane', 'Kelly', 'Laura', 'Melody',
  'Natalie', 'Paige', 'Rachel', 'Sophie', 'Tara', 'Ursula', 'Vienna', 'Wendy', 'Inez', 'Sienna'
];

const NEUTRAL_NAMES = [
  'Avery', 'Bailey', 'Casey', 'Dakota', 'Emerson', 'Finley', 'Harper', 'Jordan', 'Kendall', 'Morgan',
  'Parker', 'Reese', 'Skylar', 'Taylor', 'Charlie', 'Drew', 'Eden', 'Frankie', 'Gray', 'Hayden',
  'Jamie', 'Kit', 'Lane', 'Micah', 'Nico', 'Phoenix', 'River', 'Robin', 'Sage', 'Sam'
];

// Location data
interface LocationData {
  text: string;
  lat: number;
  lng: number;
}

const LOCATIONS: LocationData[] = [
  { text: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
  { text: 'Brooklyn, NY', lat: 40.6782, lng: -73.9442 },
  { text: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  { text: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  { text: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
  { text: 'Miami, FL', lat: 25.7617, lng: -80.1918 },
  { text: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437 },
  { text: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
  { text: 'Portland, OR', lat: 45.5152, lng: -122.6784 },
  { text: 'Boston, MA', lat: 42.3601, lng: -71.0589 },
  { text: 'Philadelphia, PA', lat: 39.9526, lng: -75.1652 },
  { text: 'Phoenix, AZ', lat: 33.4484, lng: -112.0740 },
  { text: 'San Diego, CA', lat: 32.7157, lng: -117.1611 },
  { text: 'Dallas, TX', lat: 32.7767, lng: -96.7970 },
  { text: 'San Jose, CA', lat: 37.3382, lng: -121.8863 },
  { text: 'Atlanta, GA', lat: 33.7490, lng: -84.3880 },
  { text: 'Nashville, TN', lat: 36.1627, lng: -86.7816 },
  { text: 'Minneapolis, MN', lat: 44.9778, lng: -93.2650 },
  { text: 'Raleigh, NC', lat: 35.7796, lng: -78.6382 },
  { text: 'Salt Lake City, UT', lat: 40.7608, lng: -111.8910 }
];

// Bio templates
const BIO_TEMPLATES = [
  'Coffee enthusiast, {interest1} lover, and weekend {interest2}. Looking for someone {vibe}.',
  '{interest1} by day, {interest2} by night. Life is too short for {dislike}.',
  'Equal parts {trait1} and {trait2}. You will find me at {place}.',
  'Professional {interest1} fan with a soft spot for {interest2}. {goal}.',
  '{trait1}, {trait2}, and always down for {interest1}. Looking for {seeking}.',
  'Collecting moments, not things. Into {interest1}, {interest2}, and good conversation.',
  '{interest1} nerd meets {interest2} enthusiast. Ask me about my {quirk}.',
  'Part-time {interest1} explorer, full-time {interest2} advocate. {vibe}.',
  'Big on {interest1}, bigger on {interest2}. Small on {dislike}.',
  'If you like {interest1} and {interest2}, we will get along. Bonus points for {bonus}.'
];

const TRAITS = ['curious', 'creative', 'adventurous', 'laid-back', 'ambitious', 'thoughtful', 'spontaneous', 'grounded'];
const VIBES = ['curious and kind', 'grounded', 'fun and easygoing', 'thoughtful', 'adventurous'];
const PLACES = ['coffee shops', 'bookstores', 'music venues', 'hiking trails', 'art galleries', 'farmers markets'];
const DISLIKES = ['boring dates', 'small talk', 'fake vibes', 'drama', 'negativity'];
const GOALS = ['Looking for something real', 'Seeking adventure', 'Open to possibilities', 'Ready for a connection'];
const SEEKING = ['someone genuine', 'a partner in crime', 'good energy', 'someone curious'];
const QUIRKS = ['vinyl collection', 'plant collection', 'coffee obsession', 'travel stories', 'photography'];
const BONUSES = ['spontaneous plans', 'good playlists', 'dog pics', 'book recs', 'food adventures'];

// Post text templates
const POST_TEMPLATES = [
  'Weekend vibes: {activity}. Who else?',
  'Current mood: {mood}. Tell me about yours.',
  '{activity} > everything else. Change my mind.',
  'Best discovery this week: {discovery}. What is yours?',
  '{question}',
  'If you know, you know: {reference}.',
  '{activity} and {activity2}. That is the vibe.',
  'Hot take: {opinion}.',
  'Ask me about: {topic}.',
  '{activity} anyone? Looking for recommendations.'
];

const ACTIVITIES = ['coffee runs', 'sunrise hikes', 'late-night tacos', 'vinyl shopping', 'museum hopping', 'beach days', 'road trips'];
const MOODS = ['cozy', 'adventurous', 'creative', 'hungry', 'inspired', 'curious'];
const DISCOVERIES = ['new coffee shop', 'hidden hiking trail', 'amazing playlist', 'perfect taco spot', 'indie bookstore'];
const QUESTIONS = [
  'What is your go-to comfort food?',
  'Early bird or night owl?',
  'Best live show you have seen?',
  'What is on your bucket list?',
  'Favorite local spot?'
];
const REFERENCES = ['that feeling', 'the vibe', 'this energy', 'those moments', 'this aesthetic'];
const OPINIONS = ['breakfast is the best meal', 'coffee > tea', 'books > movies', 'mornings are underrated', 'cities > suburbs'];
const TOPICS = ['my last trip', 'my weekend plans', 'my favorite playlist', 'my go-to spot', 'my latest obsession'];

export function generateName(rng: RNG, gender: string): string {
  if (gender === 'MALE') return rng.choice(MALE_NAMES);
  if (gender === 'FEMALE') return rng.choice(FEMALE_NAMES);
  return rng.choice(NEUTRAL_NAMES);
}

export function generateLocation(rng: RNG): LocationData {
  return rng.choice(LOCATIONS);
}

export function generateAge(rng: RNG): number {
  // Normal distribution centered around 28, range 18-55
  const u1 = rng.next();
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const age = Math.round(28 + z * 7);
  return Math.max(18, Math.min(55, age));
}

export function generateBio(rng: RNG, interests: string[]): string {
  const template = rng.choice(BIO_TEMPLATES);
  const replacements: Record<string, string> = {
    interest1: interests[0] || 'music',
    interest2: interests[1] || 'travel',
    trait1: rng.choice(TRAITS),
    trait2: rng.choice(TRAITS),
    vibe: rng.choice(VIBES),
    place: rng.choice(PLACES),
    dislike: rng.choice(DISLIKES),
    goal: rng.choice(GOALS),
    seeking: rng.choice(SEEKING),
    quirk: rng.choice(QUIRKS),
    bonus: rng.choice(BONUSES)
  };
  
  return template.replace(/\{(\w+)\}/g, (match, key) => replacements[key] || match);
}

export function generatePostText(rng: RNG): string {
  const template = rng.choice(POST_TEMPLATES);
  const replacements: Record<string, string> = {
    activity: rng.choice(ACTIVITIES),
    activity2: rng.choice(ACTIVITIES),
    mood: rng.choice(MOODS),
    discovery: rng.choice(DISCOVERIES),
    question: rng.choice(QUESTIONS),
    reference: rng.choice(REFERENCES),
    opinion: rng.choice(OPINIONS),
    topic: rng.choice(TOPICS)
  };
  
  return template.replace(/\{(\w+)\}/g, (match, key) => replacements[key] || match);
}

const MESSAGE_OPENERS = [
  'Hey! {question}',
  'Hi there! Love your {detail}.',
  '{detail} caught my eye. Tell me more!',
  'Hey! {question} (asking for a friend)',
  'Hi! {observation}. What do you think?'
];

const MESSAGE_QUESTIONS = [
  'What is your go-to coffee order?',
  'Best weekend adventure?',
  'Favorite local spot?',
  'What is on your playlist lately?',
  'Any good book recs?'
];

const MESSAGE_DETAILS = ['bio', 'vibe', 'energy', 'profile', 'pics'];
const MESSAGE_OBSERVATIONS = [
  'Looks like we have similar taste',
  'I see you are into the same things',
  'We should swap recommendations',
  'Your profile made me smile'
];

export function generateMessageOpener(rng: RNG): string {
  const template = rng.choice(MESSAGE_OPENERS);
  return template.replace(/\{question\}/g, rng.choice(MESSAGE_QUESTIONS))
    .replace(/\{detail\}/g, rng.choice(MESSAGE_DETAILS))
    .replace(/\{observation\}/g, rng.choice(MESSAGE_OBSERVATIONS));
}

const MESSAGE_RESPONSES = [
  'Ha! {reaction}',
  'Totally agree. {followup}',
  'Interesting! {question}',
  'Same here. {share}',
  'Love that! {enthusiasm}'
];

const MESSAGE_REACTIONS = ['I feel that', 'So true', 'Right?!', 'Exactly', 'No way'];
const MESSAGE_FOLLOWUPS = ['What else?', 'Tell me more', 'Any favorites?', 'How did you get into that?'];
const MESSAGE_RESPONSE_QUESTIONS = ['What about you?', 'Thoughts?', 'Ever tried it?', 'Sound good?'];
const MESSAGE_SHARES = ['I am the same way', 'Been there', 'I know the feeling', 'Can relate'];
const MESSAGE_ENTHUSIASM = ['Want to check it out?', 'We should go sometime', 'Down to explore?', 'Let me know'];

export function generateMessageResponse(rng: RNG): string {
  const template = rng.choice(MESSAGE_RESPONSES);
  return template.replace(/\{reaction\}/g, rng.choice(MESSAGE_REACTIONS))
    .replace(/\{followup\}/g, rng.choice(MESSAGE_FOLLOWUPS))
    .replace(/\{question\}/g, rng.choice(MESSAGE_RESPONSE_QUESTIONS))
    .replace(/\{share\}/g, rng.choice(MESSAGE_SHARES))
    .replace(/\{enthusiasm\}/g, rng.choice(MESSAGE_ENTHUSIASM));
}

export { LOCATIONS };
export type { LocationData };
