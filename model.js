// One versioned document, committed as one existing synced plugin-data operation.
(function (root) {
  const empty = () => ({ version: 1, objectives: [] });
  function parse(raw) {
    if (raw === null) return empty();
    const doc = JSON.parse(raw);
    const validItem = (x) =>
      x && typeof x.id === 'string' && x.id.length > 0 && typeof x.title === 'string';
    const unique = (items) => new Set(items.map((x) => x.id)).size === items.length;
    if (
      !doc ||
      doc.version !== 1 ||
      !Array.isArray(doc.objectives) ||
      !unique(doc.objectives) ||
      !doc.objectives.every(
        (o) =>
          validItem(o) &&
          Array.isArray(o.keyResults) &&
          unique(o.keyResults) &&
          o.keyResults.every(validItem),
      )
    ) {
      throw new Error('Invalid OKR document');
    }
    return doc;
  }
  function move(items, id, beforeId) {
    const item = items.find((x) => x.id === id);
    if (!item || id === beforeId) return items;
    const rest = items.filter((x) => x.id !== id);
    const target =
      beforeId === null ? rest.length : rest.findIndex((x) => x.id === beforeId);
    if (target < 0) return items;
    return [...rest.slice(0, target), item, ...rest.slice(target)];
  }
  function apply(doc, action) {
    const title = action.title?.trim();
    switch (action.type) {
      case 'addObjective':
        if (!title || doc.objectives.some((o) => o.id === action.id)) return doc;
        return {
          ...doc,
          objectives: [...doc.objectives, { id: action.id, title, keyResults: [] }],
        };
      case 'deleteObjective':
        return { ...doc, objectives: doc.objectives.filter((o) => o.id !== action.id) };
      case 'moveObjective':
        return { ...doc, objectives: move(doc.objectives, action.id, action.beforeId) };
      default:
        return {
          ...doc,
          objectives: doc.objectives.map((o) => {
            if (o.id !== action.objectiveId) return o;
            if (
              action.type === 'addKeyResult' &&
              title &&
              !o.keyResults.some((k) => k.id === action.id)
            )
              return { ...o, keyResults: [...o.keyResults, { id: action.id, title }] };
            if (action.type === 'deleteKeyResult')
              return { ...o, keyResults: o.keyResults.filter((k) => k.id !== action.id) };
            if (action.type === 'moveKeyResult')
              return { ...o, keyResults: move(o.keyResults, action.id, action.beforeId) };
            return o;
          }),
        };
    }
  }
  const api = { empty, parse, apply };
  if (typeof module !== 'undefined') module.exports = api;
  else root.OkrModel = api;
})(globalThis);
