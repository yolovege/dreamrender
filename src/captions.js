// Captions: grammatical sentences that mean nothing.

import { NOUNS, VERBS, PLACES, ADJECTIVES, TIMES, TEMPLATES } from './words.js';
import { WRITTEN } from './captions-written.js';

const FILLERS = { noun: NOUNS, verb: VERBS, place: PLACES, adj: ADJECTIVES, time: TIMES };
const WRITTEN_SHARE = 0.6;

export function makeSentence(rng) {
  return rng.pick(TEMPLATES).replace(/\{(\w+)\}/g, (_, key) =>
    key === 'num' ? String(rng.int(2, 99)) : rng.pick(FILLERS[key]),
  );
}

// Mixes the hand-written captions (dealt like a shuffled deck, so none repeats
// until all have been shown) with freshly assembled ones.
export function createCaptionStream(rng, written = WRITTEN) {
  let deck = [];
  let last = null;

  const draw = () => {
    if (!rng.chance(WRITTEN_SHARE)) return makeSentence(rng);
    if (deck.length === 0) deck = rng.shuffle(written);
    return deck.pop();
  };

  return {
    next() {
      let caption = draw();
      while (caption === last) caption = draw();
      last = caption;
      return caption;
    },
  };
}
