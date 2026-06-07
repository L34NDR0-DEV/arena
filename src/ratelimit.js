'use strict';
// Rate limiting simples em memória (suficiente para um único processo;
// um cluster precisaria de um armazenamento compartilhado, ex. Redis).
const buckets = new Map(); // key -> [timestamps...]

function rateLimit(key, max, windowMs) {
  const now = Date.now();
  let hits = buckets.get(key);
  if (!hits) { hits = []; buckets.set(key, hits); }

  while (hits.length && now - hits[0] > windowMs) hits.shift();

  if (hits.length >= max) return false;
  hits.push(now);
  return true;
}

// Limpeza periódica para não acumular chaves antigas indefinidamente.
setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of buckets) {
    while (hits.length && now - hits[0] > 10 * 60 * 1000) hits.shift();
    if (hits.length === 0) buckets.delete(key);
  }
}, 5 * 60 * 1000).unref();

module.exports = { rateLimit };
