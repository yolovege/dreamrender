// Deals items like a shuffled deck: every item once per round, a fresh
// shuffle each round, and never the same item twice in a row.

export function createDeck(items, rng) {
  const all = [...items];
  let pile = [];
  let last;

  return {
    next() {
      if (pile.length === 0) {
        pile = rng.shuffle(all);
        // The new round must not open with the card that closed the last one.
        if (pile.length > 1 && pile[pile.length - 1] === last) {
          [pile[0], pile[pile.length - 1]] = [pile[pile.length - 1], pile[0]];
        }
      }
      last = pile.pop();
      return last;
    },
  };
}
