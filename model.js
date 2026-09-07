// One versioned document, committed as one existing synced plugin-data operation.
(function (root) {
  const empty = () => ({ version: 1, objectives: [] });
  // Fixed two-month periods keyed by their odd start month: 2026-01 = Jan–Feb 2026.
  const PERIOD = /^\d{4}-(01|03|05|07|09|11)$/;
  const isPeriod = (value) => typeof value === 'string' && PERIOD.test(value);
  const pad = (n) => String(n).padStart(2, '0');
  const periodForDate = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() - (date.getMonth() % 2) + 1)}`;
  function shiftPeriod(periodId, delta) {
    const [year, month] = periodId.split('-').map(Number);
    return periodForDate(new Date(year, month - 1 + delta * 2, 1));
  }
  // First day of each month in the period, for locale-aware range labels.
  function periodMonths(periodId) {
    const [year, month] = periodId.split('-').map(Number);
    return [new Date(year, month - 1, 1), new Date(year, month, 1)];
  }
  const objectivesForPeriod = (doc, periodId) =>
    doc.objectives.filter((o) => o.periodId === periodId);
  const unassignedObjectives = (doc) =>
    doc.objectives.filter((o) => o.periodId === undefined);
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
          (o.periodId === undefined || isPeriod(o.periodId)) &&
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
    // Actions carrying a periodId only touch objectives in that period, so a
    // command aimed at one period can never alter another one.
    const scoped = action.periodId !== undefined;
    const inScope = (o) => !scoped || o.periodId === action.periodId;
    const find = (id) => doc.objectives.find((o) => o.id === id);
    if (scoped && !isPeriod(action.periodId)) return doc;
    switch (action.type) {
      case 'addObjective':
        if (!title || find(action.id)) return doc;
        return {
          ...doc,
          objectives: [
            ...doc.objectives,
            scoped
              ? {
                  id: action.id,
                  title,
                  keyResults: [],
                  periodId: action.periodId,
                }
              : { id: action.id, title, keyResults: [] },
          ],
        };
      case 'deleteObjective': {
        const target = find(action.id);
        if (!target || !inScope(target)) return doc;
        return {
          ...doc,
          objectives: doc.objectives.filter((o) => o.id !== action.id),
        };
      }
      case 'moveObjective': {
        const target = find(action.id);
        const before = action.beforeId === null ? null : find(action.beforeId);
        if (!target || !inScope(target) || (before && !inScope(before))) return doc;
        return {
          ...doc,
          objectives: move(doc.objectives, action.id, action.beforeId),
        };
      }
      case 'setObjectivePeriod': {
        const target = find(action.id);
        if (!target || !inScope(target) || !isPeriod(action.toPeriodId)) return doc;
        if (target.periodId === action.toPeriodId) return doc;
        return {
          ...doc,
          objectives: doc.objectives.map((o) =>
            o.id === action.id ? { ...o, periodId: action.toPeriodId } : o,
          ),
        };
      }
      case 'assignUnassigned':
        if (!scoped || !unassignedObjectives(doc).length) return doc;
        return {
          ...doc,
          objectives: doc.objectives.map((o) =>
            o.periodId === undefined ? { ...o, periodId: action.periodId } : o,
          ),
        };
      default:
        return {
          ...doc,
          objectives: doc.objectives.map((o) => {
            if (o.id !== action.objectiveId || !inScope(o)) return o;
            if (
              action.type === 'addKeyResult' &&
              title &&
              !o.keyResults.some((k) => k.id === action.id)
            )
              return {
                ...o,
                keyResults: [...o.keyResults, { id: action.id, title }],
              };
            if (action.type === 'deleteKeyResult')
              return {
                ...o,
                keyResults: o.keyResults.filter((k) => k.id !== action.id),
              };
            if (action.type === 'moveKeyResult')
              return {
                ...o,
                keyResults: move(o.keyResults, action.id, action.beforeId),
              };
            return o;
          }),
        };
    }
  }
  const api = {
    empty,
    parse,
    apply,
    isPeriod,
    periodForDate,
    shiftPeriod,
    periodMonths,
    objectivesForPeriod,
    unassignedObjectives,
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.OkrModel = api;
})(globalThis);
