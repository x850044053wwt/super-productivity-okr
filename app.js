(async () => {
  const words = /* TRANSLATIONS */ {};
  // Iframe bridge methods (including translate) return promises.
  const T = {};
  for (const key of Object.keys(words)) T[key] = await PluginAPI.translate(key);
  document.documentElement.lang = await PluginAPI.getCurrentLanguage();
  document.querySelectorAll('[data-t]').forEach((el) => {
    el.textContent = T[el.dataset.t];
  });
  const list = document.getElementById('objectives');
  const error = document.getElementById('error');
  const objectiveInput = document.getElementById('objective-title');
  const confirm = document.getElementById('confirm');
  objectiveInput.placeholder = T.OBJECTIVE;
  objectiveInput.setAttribute('aria-label', T.OBJECTIVE);
  let doc = OkrModel.empty();
  let busy = false;
  let loaded = false;
  let refreshing = false;
  let revision = 0;
  let dragged = null;
  const drafts = new Map();
  function showError() {
    error.textContent = T.ERROR;
    error.hidden = false;
  }
  function setBusy(value) {
    busy = value;
    document
      .querySelectorAll('main > form button, #refresh, #objectives button')
      .forEach((b) => {
        b.disabled = value || b.dataset.boundary === 'true';
      });
  }
  async function refresh() {
    if (busy || refreshing || confirm.open) return;
    refreshing = true;
    const startedAt = revision;
    try {
      const next = OkrModel.parse(await PluginAPI.loadSyncedData());
      if (busy || startedAt !== revision) return;
      if (!loaded || JSON.stringify(next) !== JSON.stringify(doc)) {
        doc = next;
        render();
      }
      loaded = true;
      error.hidden = true;
    } catch {
      showError();
    } finally {
      refreshing = false;
    }
  }
  async function commit(action, onSuccess) {
    if (busy) return;
    revision++;
    setBusy(true);
    try {
      // Read again before every intent so a recently received remote edit is included.
      const latest = OkrModel.parse(await PluginAPI.loadSyncedData());
      const next = OkrModel.apply(latest, action);
      await PluginAPI.persistDataSynced(JSON.stringify(next));
      doc = next;
      loaded = true;
      onSuccess?.();
      render();
      error.hidden = true;
    } catch {
      showError();
    } finally {
      setBusy(false);
    }
  }
  function element(tag, className, text) {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function button(label, text, action, disabled = false) {
    const b = element('button', '', text);
    b.type = 'button';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.disabled = disabled;
    b.dataset.boundary = String(disabled);
    b.onclick = action;
    return b;
  }
  function controls(row, items, index, objectiveId) {
    const item = items[index];
    const type = objectiveId ? 'KeyResult' : 'Objective';
    const move = (beforeId) =>
      commit({ type: `move${type}`, id: item.id, objectiveId, beforeId });
    const actions = element('div', 'actions');
    const handle = element('span', 'muted', '⠿');
    handle.draggable = true;
    handle.title = T.DRAG;
    handle.setAttribute('aria-hidden', 'true');
    handle.ondragstart = (event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      dragged = { id: item.id, objectiveId };
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    };
    handle.ondragend = () => {
      dragged = null;
    };
    row.ondragover = (event) => {
      if (dragged && dragged.objectiveId === objectiveId) event.preventDefault();
    };
    row.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (
        !dragged ||
        busy ||
        dragged.objectiveId !== objectiveId ||
        dragged.id === item.id
      )
        return;
      const source = items.findIndex((x) => x.id === dragged.id);
      const beforeId = source < index ? (items[index + 1]?.id ?? null) : item.id;
      void commit({ type: `move${type}`, id: dragged.id, objectiveId, beforeId });
      dragged = null;
    };
    actions.append(
      handle,
      button(T.MOVE_UP, '↑', () => move(items[index - 1].id), index === 0),
      button(
        T.MOVE_DOWN,
        '↓',
        () => move(items[index + 2]?.id ?? null),
        index === items.length - 1,
      ),
      button(T.DELETE, '×', async () => {
        if (!objectiveId) {
          confirm.returnValue = 'cancel';
          confirm.showModal();
          const result = await new Promise((resolve) => {
            confirm.onclose = () => resolve(confirm.returnValue);
          });
          if (result !== 'delete') return;
        }
        await commit({ type: `delete${type}`, id: item.id, objectiveId }, () =>
          drafts.delete(item.id),
        );
      }),
    );
    row.append(actions);
  }
  function render() {
    list.replaceChildren();
    if (!doc.objectives.length) list.append(element('p', 'muted', T.EMPTY));
    doc.objectives.forEach((o, i) => {
      const article = element('article', '');
      const row = element('div', 'row');
      row.append(element('h2', 'title', `O${i + 1} · ${o.title}`));
      controls(row, doc.objectives, i);
      const results = element('div', 'kr-list');
      o.keyResults.forEach((kr, j) => {
        const krRow = element('div', 'row kr');
        krRow.append(element('span', 'title', `KR${j + 1} · ${kr.title}`));
        controls(krRow, o.keyResults, j, o.id);
        results.append(krRow);
      });
      if (!o.keyResults.length) results.append(element('p', 'muted', T.NO_KEY_RESULTS));
      const form = element('form', '');
      const input = element('input', '');
      input.placeholder = T.KEY_RESULT;
      input.setAttribute('aria-label', `${T.KEY_RESULT}: ${o.title}`);
      input.maxLength = 500;
      input.required = true;
      input.value = drafts.get(o.id) || '';
      input.oninput = () => drafts.set(o.id, input.value);
      const add = element('button', '', T.ADD_KEY_RESULT);
      add.type = 'submit';
      form.append(input, add);
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!input.value.trim()) return;
        void commit(
          {
            type: 'addKeyResult',
            objectiveId: o.id,
            id: crypto.randomUUID(),
            title: input.value,
          },
          () => drafts.delete(o.id),
        );
      };
      article.append(row, results, form);
      list.append(article);
    });
  }
  document.getElementById('add-objective').onsubmit = (event) => {
    event.preventDefault();
    if (!objectiveInput.value.trim()) return;
    void commit(
      { type: 'addObjective', id: crypto.randomUUID(), title: objectiveInput.value },
      () => {
        objectiveInput.value = '';
      },
    );
  };
  document.getElementById('refresh').onclick = refresh;
  window.addEventListener('focus', () => {
    if (document.activeElement?.tagName !== 'INPUT') void refresh();
  });
  await PluginAPI.registerHook('persistedDataChanged', () => {
    if (!dragged && document.activeElement?.tagName !== 'INPUT') void refresh();
  });
  list.textContent = T.LOADING;
  await refresh();
})();
