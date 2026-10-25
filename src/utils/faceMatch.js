// Same math as @vladmandic/human `human.match.similarity` (src/face/match.ts).
// The browser preview and this server both call that function with no options,
// so a score computed here matches a score computed in the page.
//
// Distance is Minkowski. Order 2 is Euclidean (square each difference, sum, then
// the square root is taken when the distance is turned into a similarity).
// The library default options are order 2, multiplier 25, min 0.2, max 0.8.
// If a caller passes options and leaves multiplier out, the distance step uses 20.
// The result is clamped to 0..1. Identical descriptors return exactly 1.

const DEFAULT_OPTIONS = { order: 2, multiplier: 25, min: 0.2, max: 0.8 };

function distance(descriptor1, descriptor2, options) {
  // Unequal length cannot be scored. The check-in route rejects that case first.
  if (!descriptor1 || !descriptor2 || descriptor1.length !== descriptor2.length) {
    return Number.MAX_SAFE_INTEGER;
  }
  const order = options.order || 2;
  const multiplier = options.multiplier || 20;
  let sum = 0;
  for (let i = 0; i < descriptor1.length; i += 1) {
    const diff = order === 2
      ? descriptor1[i] - descriptor2[i]
      : Math.abs(descriptor1[i] - descriptor2[i]);
    sum += order === 2 ? diff * diff : diff ** order;
  }
  return Math.round(100 * multiplier * sum) / 100;
}

// Invert distance into a similarity and clamp it to 0..1.
function normalizeDistance(dist, order, min, max) {
  if (dist === 0) return 1;
  const root = order === 2 ? Math.sqrt(dist) : dist ** (1 / order);
  const norm = (1 - (root / 100) - min) / (max - min);
  return Math.round(100 * Math.max(Math.min(norm, 1), 0)) / 100;
}

export function similarity(descriptor1, descriptor2, options = DEFAULT_OPTIONS) {
  const order = options.order || 2;
  const dist = distance(descriptor1, descriptor2, options);
  return normalizeDistance(dist, order, options.min || 0, options.max || 1);
}
