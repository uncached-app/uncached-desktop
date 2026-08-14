// Matching for the command palette.
//
// The whole quality of a palette is here: what a half-typed query is allowed to
// find, and in what order. Kept pure so the ranking can be argued about in
// tests rather than by opening the window and squinting.
//
// The rules, in the order they win:
//
//   1. the title starts with what was typed;
//   2. a word inside the title starts with it;
//   3. the title contains it anywhere;
//   4. something else about the item contains it — a path, a branch, a keyword;
//   5. the title contains the letters in order, with other letters between.
//
// Rule 5 is what makes `wsmp` find "Workspace map", and it scores last on
// purpose: a subsequence match is the loosest claim of relevance there is, and
// a palette that ranks it above a real prefix feels like it is guessing.

const EXACT = 1000;
const WORD = 800;
const SUBSTRING = 600;
const CONTEXT = 400;
const SUBSEQUENCE = 200;

/** Letters in order, gaps allowed. Returns the number of gaps, or null. */
function subsequenceGaps(haystack, needle) {
  let index = 0;
  let gaps = 0;
  let previous = -1;
  for (const character of needle) {
    const found = haystack.indexOf(character, index);
    if (found === -1) return null;
    if (previous !== -1 && found > previous + 1) gaps += 1;
    previous = found;
    index = found + 1;
  }
  return gaps;
}

/**
 * How well one item answers a query, or null if it does not.
 *
 * `context` is everything about the item that is worth finding it by but is
 * not its name: a path, a git branch, the words someone might reach for
 * instead of the ones on screen.
 */
export function scoreCommand(item, query) {
  if (!query) return 0;
  const needle = query.toLowerCase().trim();
  if (!needle) return 0;

  const title = (item.title ?? "").toLowerCase();
  const context = [item.subtitle ?? "", ...(item.keywords ?? [])].join(" ").toLowerCase();

  if (title.startsWith(needle)) return EXACT;
  if (title.split(/[\s/\-_.]+/).some((word) => word.startsWith(needle))) return WORD;
  if (title.includes(needle)) return SUBSTRING;
  if (context.includes(needle)) return CONTEXT;

  const gaps = subsequenceGaps(title, needle);
  // Every gap costs, so a tight match beats a scattered one — but no
  // subsequence ever outranks something that actually contains the query.
  if (gaps !== null) return Math.max(1, SUBSEQUENCE - gaps * 10);
  return null;
}

/**
 * Filters and orders a list of items for a query.
 *
 * Stable: items that score the same keep the order they were given, which is
 * how the caller expresses that one group matters more than another. An empty
 * query changes nothing at all.
 */
export function rankCommands(items, query) {
  if (!query || !query.trim()) return [...items];
  return items
    .map((item, position) => ({ item, position, score: scoreCommand(item, query) }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => right.score - left.score || left.position - right.position)
    .map((entry) => entry.item);
}

/**
 * Splits a ranked list into the sections it will be drawn as.
 *
 * Sections follow the ranking rather than the other way round: whichever group
 * holds the best match comes first, so typing a project name never leaves the
 * project below a row of commands that matched less well.
 */
export function groupCommands(items) {
  const groups = [];
  for (const item of items) {
    const existing = groups.find((group) => group.id === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ id: item.group, items: [item] });
  }
  return groups;
}
