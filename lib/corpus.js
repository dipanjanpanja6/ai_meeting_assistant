import fs from 'node:fs';
import path from 'node:path';

const STOPWORDS = new Set(`a an and are as at be been but by can could do does did for from has have how i in into is it
its more most of on or so such than that the their them then there these they this to was were what when where which
while who why will with would about should us we you your our between versus vs`.split(/\s+/));

/** Tiny suffix stripper: batteries -> battery, pumps -> pump, heating -> heat, pumped -> pump. */
export function stem(t) {
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`;
  if (t.endsWith('ing') && t.length > 5) return t.slice(0, -3);
  if (t.endsWith('ed') && t.length > 4) return t.slice(0, -2);
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
}

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map(stem);
}

/** Split every markdown file into paragraph passages; the first `# ` heading is the title. */
export function loadCorpus(corpusDir) {
  const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.md')).sort();
  const passages = [];
  for (const file of files) {
    const raw = fs.readFileSync(path.join(corpusDir, file), 'utf8');
    let title = file.replace(/\.md$/, '').replace(/_/g, ' ');
    let i = 0;
    for (const block of raw.split(/\r?\n\s*\r?\n/)) {
      const text = block.trim();
      if (!text) continue;
      if (text.startsWith('# ')) {
        title = text.slice(2).trim();
        continue;
      }
      passages.push({ id: `${file}#${i}`, source: file, title, text: text.split(/\s+/).join(' ') });
      i += 1;
    }
  }
  return passages;
}

/** Okapi BM25 over passages; each paragraph is indexed together with its document title. */
export class BM25Index {
  constructor(passages, { k1 = 1.5, b = 0.75 } = {}) {
    this.passages = passages;
    this.k1 = k1;
    this.b = b;
    this.docs = passages.map((p) => {
      const tf = new Map();
      for (const t of tokenize(`${p.title} ${p.text}`)) tf.set(t, (tf.get(t) || 0) + 1);
      return tf;
    });
    this.lengths = this.docs.map((d) => [...d.values()].reduce((a, c) => a + c, 0));
    this.avgLen = this.lengths.reduce((a, c) => a + c, 0) / (this.lengths.length || 1);
    const df = new Map();
    for (const d of this.docs) for (const t of d.keys()) df.set(t, (df.get(t) || 0) + 1);
    const n = passages.length;
    this.idf = new Map([...df].map(([t, f]) => [t, Math.log(1 + (n - f + 0.5) / (f + 0.5))]));
  }

  get sources() {
    return [...new Set(this.passages.map((p) => p.source))].sort();
  }

  /** Top-k passages, at most `perSource` from any one file so results cover several files. */
  search(query, k = 3, perSource = 1) {
    const terms = tokenize(query);
    const scored = [];
    this.passages.forEach((p, i) => {
      const doc = this.docs[i];
      let score = 0;
      for (const t of terms) {
        const tf = doc.get(t);
        if (!tf) continue;
        const norm = (tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * this.lengths[i]) / this.avgLen));
        score += this.idf.get(t) * norm;
      }
      if (score > 0) scored.push({ passage: p, score });
    });
    scored.sort((a, b) => b.score - a.score);
    const perFile = new Map();
    const picked = [];
    for (const hit of scored) {
      const used = perFile.get(hit.passage.source) || 0;
      if (used >= perSource) continue;
      perFile.set(hit.passage.source, used + 1);
      picked.push(hit);
      if (picked.length === k) break;
    }
    return picked;
  }
}
