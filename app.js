const STORAGE_KEY = "infinite-board-v5";

const state = {
  boards: {},
  activeBoardId: null,
  viewport: { x: 0, y: 0, scale: 1 },
  connectMode: false,
  connectFrom: null,
};

const els = {
  boardName: document.getElementById("boardName"),
  addBoard: document.getElementById("addBoard"),
  boardList: document.getElementById("boardList"),
  workspace: document.getElementById("workspace"),
  canvas: document.getElementById("canvas"),
  connections: document.getElementById("connections"),
  nodeTemplate: document.getElementById("nodeTemplate"),
  connectMode: document.getElementById("connectMode"),
  toolButtons: [...document.querySelectorAll("[data-tool]")],
  timelineDialog: document.getElementById("timelineDialog"),
  timelineForm: document.getElementById("timelineForm"),
  timelineRows: document.getElementById("timelineRows"),
  addEventRow: document.getElementById("addEventRow"),
  addPeriodRow: document.getElementById("addPeriodRow"),
  cancelTimeline: document.getElementById("cancelTimeline"),
  openJsonImport: document.getElementById("openJsonImport"),
  exportJson: document.getElementById("exportJson"),
  jsonDialog: document.getElementById("jsonDialog"),
  jsonForm: document.getElementById("jsonForm"),
  jsonInput: document.getElementById("jsonInput"),
  jsonMessage: document.getElementById("jsonMessage"),
  cancelJson: document.getElementById("cancelJson"),
};

init();

function init() {
  load();
  if (!Object.keys(state.boards).length) createBoard("Proyecto principal");
  bindUI();
  renderBoards();
  renderBoard();
}

function bindUI() {
  els.addBoard.addEventListener("click", () => {
    const name = els.boardName.value.trim() || `Proyecto ${Object.keys(state.boards).length + 1}`;
    createBoard(name);
    els.boardName.value = "";
  });

  els.toolButtons.forEach((btn) => btn.addEventListener("click", () => addNode(btn.dataset.tool)));

  els.connectMode.addEventListener("click", () => {
    state.connectMode = !state.connectMode;
    state.connectFrom = null;
    els.connectMode.classList.toggle("active", state.connectMode);
    renderBoard();
  });

  els.openJsonImport.addEventListener("click", () => {
    els.jsonInput.value = "";
    els.jsonMessage.textContent = "";
    els.jsonDialog.showModal();
  });

  els.exportJson.addEventListener("click", exportCurrentBoardJson);
  els.cancelJson.addEventListener("click", () => els.jsonDialog.close("cancel"));
  els.jsonForm.addEventListener("submit", (e) => {
    e.preventDefault();
    importJson(els.jsonInput.value);
  });

  els.addEventRow.addEventListener("click", () => addTimelineRow("event"));
  els.addPeriodRow.addEventListener("click", () => addTimelineRow("period"));
  els.cancelTimeline.addEventListener("click", () => els.timelineDialog.close("cancel"));

  let panning = false;
  let start = { x: 0, y: 0 };

  els.workspace.addEventListener("mousedown", (e) => {
    if (!e.shiftKey || e.target.closest(".node")) return;
    panning = true;
    start = { x: e.clientX - state.viewport.x, y: e.clientY - state.viewport.y };
    els.workspace.style.cursor = "grabbing";
  });

  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    state.viewport.x = e.clientX - start.x;
    state.viewport.y = e.clientY - start.y;
    applyViewport();
  });

  window.addEventListener("mouseup", () => {
    if (!panning) return;
    panning = false;
    els.workspace.style.cursor = "grab";
    save();
  });

  els.workspace.addEventListener("wheel", (e) => {
    e.preventDefault();
    const scaleDelta = e.deltaY > 0 ? -0.08 : 0.08;
    state.viewport.scale = Math.min(2.3, Math.max(0.35, state.viewport.scale + scaleDelta));
    applyViewport();
    save();
  });
}

function importJson(raw) {
  try {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error("No hay contenido para importar.");

    let parsed;
    if (looksLikeJson(trimmed)) {
      parsed = JSON.parse(trimmed);
    } else {
      parsed = parseTsvBoard(trimmed);
    }

    if (Array.isArray(parsed)) {
      applyImportedBoard({ name: "Importado", nodes: parsed, connections: [] });
    } else if (parsed.nodes) {
      applyImportedBoard(parsed);
    } else {
      throw new Error("Formato no soportado. Usa JSON {name,nodes,connections} o TSV con cabecera.");
    }

    els.jsonMessage.textContent = "Importación correcta.";
    els.jsonDialog.close("save");
    renderBoards();
    renderBoard();
    save();
  } catch (err) {
    els.jsonMessage.textContent = `Error: ${err.message}`;
  }
}

function looksLikeJson(value) {
  return value.startsWith("{") || value.startsWith("[");
}

function parseTsvBoard(tsvRaw) {
  const lines = tsvRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error("TSV incompleto. Incluye cabecera y al menos una fila.");

  const headers = lines[0].split("	").map((h) => h.trim().toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cols = line.split("	");
    const row = {};
    headers.forEach((h, i) => { row[h] = (cols[i] || "").trim(); });
    return row;
  });

  const nodes = rows.map((r, i) => {
    const type = r.type || "note";
    const base = {
      id: r.id || crypto.randomUUID(),
      type,
      x: Number(r.x) || 120 + i * 24,
      y: Number(r.y) || 100 + i * 24,
      width: Number(r.width) || 320,
      height: Number(r.height) || (type === "timeline" ? 240 : 200),
      pillScale: Number(r.pillscale) || 1,
      title: r.title || { note: "Nota", image: "Imagen", video: "Video", timeline: "Línea de tiempo" }[type] || "Nota",
      data: {},
    };

    if (type === "note") base.data.text = r.text || "";
    if (type === "image") base.data.url = r.url || "";
    if (type === "video") base.data.url = r.url || "";
    if (type === "timeline") {
      base.data.items = [];
      if (r.date) base.data.items.push({ kind: "event", label: r.label || r.title || "Evento", date: r.date });
      if (r.start && r.end) {
        base.data.items.push({ kind: "period", label: r.label || r.title || "Periodo", start: r.start, end: r.end });
      }
    }

    return base;
  });

  return { name: "Importado TSV", nodes, connections: [] };
}

function applyImportedBoard(boardData) {
  const id = crypto.randomUUID();
  const nodes = (boardData.nodes || []).map((n, i) => ({
    id: n.id || crypto.randomUUID(),
    type: n.type || "note",
    x: Number.isFinite(n.x) ? n.x : 120 + i * 25,
    y: Number.isFinite(n.y) ? n.y : 100 + i * 25,
    width: Number.isFinite(n.width) ? n.width : 300,
    height: Number.isFinite(n.height) ? n.height : n.type === "timeline" ? 220 : 190,
    title: n.title || { note: "Nota", image: "Imagen", video: "Video", timeline: "Línea de tiempo" }[n.type || "note"],
    data: n.data || {},
    pillScale: Number.isFinite(n.pillScale) ? n.pillScale : 1,
  }));

  const validIds = new Set(nodes.map((n) => n.id));
  const connections = (boardData.connections || [])
    .filter((c) => validIds.has(c.from) && validIds.has(c.to))
    .map((c) => ({ id: c.id || crypto.randomUUID(), from: c.from, to: c.to }));

  state.boards[id] = {
    id,
    name: boardData.name || `Importado ${new Date().toLocaleTimeString()}`,
    nodes,
    connections,
  };
  state.activeBoardId = id;
}

function exportCurrentBoardJson() {
  const board = activeBoard();
  if (!board) return;
  const payload = JSON.stringify({ name: board.name, nodes: board.nodes, connections: board.connections }, null, 2);
  navigator.clipboard.writeText(payload).then(() => {
    alert("JSON copiado al portapapeles.");
  }).catch(() => {
    prompt("Copia este JSON:", payload);
  });
}

async function addNode(type) {
  const board = activeBoard();
  if (!board) return;

  const base = {
    id: crypto.randomUUID(),
    type,
    x: 140 + board.nodes.length * 20,
    y: 120 + board.nodes.length * 20,
    width: 320,
    height: type === "timeline" ? 240 : 200,
    title: { note: "Nota", image: "Imagen", video: "Video", timeline: "Línea de tiempo" }[type],
    data: {},
  };

  if (type === "note") base.data.text = prompt("Escribe tu nota:", "Idea principal") || "";
  if (type === "image") base.data.url = prompt("URL de imagen:", "https://images.unsplash.com/photo-1509099836639-18ba1795216d?w=800") || "";
  if (type === "video") base.data.url = prompt("URL de YouTube o Vimeo:", "https://www.youtube.com/watch?v=dQw4w9WgXcQ") || "";
  if (type === "timeline") {
    const items = await openTimelineDialog();
    if (items === null) return;
    base.data.items = items.length ? items : [{ kind: "event", label: "Inicio", date: "2026-01-10" }];
  }

  board.nodes.push(base);
  save();
  renderBoard();
}

function openTimelineDialog() {
  els.timelineRows.innerHTML = "";
  addTimelineRow("event");
  addTimelineRow("period");

  return new Promise((resolve) => {
    const onSubmit = (e) => {
      e.preventDefault();
      const items = collectTimelineRows();
      cleanup();
      els.timelineDialog.close("save");
      resolve(items);
    };
    const onClose = () => {
      if (els.timelineDialog.returnValue !== "save") resolve(null);
      cleanup();
    };
    const cleanup = () => {
      els.timelineForm.removeEventListener("submit", onSubmit);
      els.timelineDialog.removeEventListener("close", onClose);
    };
    els.timelineForm.addEventListener("submit", onSubmit);
    els.timelineDialog.addEventListener("close", onClose);
    els.timelineDialog.showModal();
  });
}

function addTimelineRow(type) {
  const row = document.createElement("div");
  row.className = "timeline-row";
  row.dataset.type = type;
  row.innerHTML = type === "event"
    ? `<span class="badge">Evento</span><input data-field="label" value="Nuevo evento" /><input data-field="date" type="date" /><button type="button" class="remove-row">✕</button>`
    : `<span class="badge">Periodo</span><input data-field="label" value="Nuevo periodo" /><input data-field="start" type="date" /><input data-field="end" type="date" /><button type="button" class="remove-row">✕</button>`;
  row.querySelector(".remove-row").addEventListener("click", () => row.remove());
  els.timelineRows.append(row);
}

function collectTimelineRows() {
  return [...els.timelineRows.querySelectorAll(".timeline-row")].map((row) => {
    const f = Object.fromEntries([...row.querySelectorAll("input")].map((i) => [i.dataset.field, i.value.trim()]));
    if (row.dataset.type === "event" && f.label && f.date) return { kind: "event", label: f.label, date: f.date };
    if (row.dataset.type === "period" && f.label && f.start && f.end) return { kind: "period", label: f.label, start: f.start, end: f.end };
    return null;
  }).filter(Boolean);
}

function renderBoards() {
  els.boardList.innerHTML = "";
  Object.values(state.boards).forEach((board) => {
    const li = document.createElement("li");
    if (board.id === state.activeBoardId) li.classList.add("active");
    const name = document.createElement("span");
    name.textContent = board.name;
    name.className = "name";
    name.onclick = () => { state.activeBoardId = board.id; save(); renderBoards(); renderBoard(); };
    const remove = document.createElement("button");
    remove.textContent = "🗑";
    remove.onclick = () => {
      if (Object.keys(state.boards).length === 1) return;
      delete state.boards[board.id];
      if (state.activeBoardId === board.id) state.activeBoardId = Object.keys(state.boards)[0];
      save(); renderBoards(); renderBoard();
    };
    li.append(name, remove);
    els.boardList.append(li);
  });
}

function renderBoard() {
  const board = activeBoard();
  if (!board) return;
  els.canvas.innerHTML = "";
  els.connections.innerHTML = "";

  board.nodes.forEach((node) => {
    const el = els.nodeTemplate.content.firstElementChild.cloneNode(true);
    el.dataset.id = node.id;
    el.dataset.type = node.type;
    el.style.left = `${node.x}px`;
    el.style.top = `${node.y}px`;
    el.style.width = `${node.width || 320}px`;
    el.style.height = `${node.height || 200}px`;
    el.querySelector(".title").textContent = node.title;
    if (state.connectFrom === node.id) el.classList.add("selected-for-connection");
    el.style.setProperty("--pill-scale", node.pillScale || 1);

    const content = el.querySelector(".content");
    if (node.type === "note") content.innerHTML = `<div class="note-pill">${escapeHtml(node.data.text || "")}</div>`;
    if (node.type === "image") content.innerHTML = `<img src="${node.data.url}" alt="Imagen" />`;
    if (node.type === "video") content.innerHTML = videoEmbed(node.data.url);
    if (node.type === "timeline") content.append(timeline(node.data.items || []));


    const canResizePill = node.type === "note" || node.type === "timeline";
    const smallerBtn = el.querySelector(".pill-smaller");
    const biggerBtn = el.querySelector(".pill-bigger");
    smallerBtn.style.display = canResizePill ? "inline-block" : "none";
    biggerBtn.style.display = canResizePill ? "inline-block" : "none";
    if (canResizePill) {
      smallerBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        node.pillScale = Math.max(0.7, (node.pillScale || 1) - 0.1);
        save();
        renderBoard();
      });
      biggerBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        node.pillScale = Math.min(1.8, (node.pillScale || 1) + 0.1);
        save();
        renderBoard();
      });
    }

    el.querySelector(".delete").addEventListener("click", (ev) => {
      ev.stopPropagation();
      board.nodes = board.nodes.filter((n) => n.id !== node.id);
      board.connections = board.connections.filter((c) => c.from !== node.id && c.to !== node.id);
      if (state.connectFrom === node.id) state.connectFrom = null;
      save(); renderBoard();
    });

    el.querySelector(".resize-handle").addEventListener("mousedown", (ev) => { ev.stopPropagation(); resizeNode(ev, node); });

    let moved = false;
    el.addEventListener("mousedown", (ev) => {
      if (ev.button !== 0 || ev.target.closest(".resize-handle")) return;
      moved = false;
      dragNode(ev, node, () => { moved = true; });
    });
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (!state.connectMode || moved) return;
      connectNode(node.id);
    });

    els.canvas.append(el);
  });

  board.connections.forEach((conn) => drawConnection(conn, board));
  applyViewport();
}

function connectNode(targetId) {
  const board = activeBoard();
  if (!board) return;
  if (!state.connectFrom) { state.connectFrom = targetId; renderBoard(); return; }
  if (state.connectFrom === targetId) { state.connectFrom = null; renderBoard(); return; }
  const exists = board.connections.some((c) => (c.from === state.connectFrom && c.to === targetId) || (c.from === targetId && c.to === state.connectFrom));
  if (!exists) board.connections.push({ id: crypto.randomUUID(), from: state.connectFrom, to: targetId });
  state.connectFrom = null;
  save();
  renderBoard();
}

function timeline(items) {
  const wrap = document.createElement("div");
  wrap.className = "timeline-wrap";
  if (!items.length) { wrap.textContent = "Sin eventos todavía."; return wrap; }

  const parsed = items.map((item) => {
    const start = item.kind === "event" ? parseDate(item.date) : parseDate(item.start);
    const end = item.kind === "period" ? parseDate(item.end) : start;
    if (!start || !end) return null;
    return { ...item, _start: start, _end: end };
  }).filter(Boolean).sort((a,b)=>a._start-b._start);

  if (!parsed.length) { wrap.textContent = "Fechas inválidas en la línea de tiempo."; return wrap; }

  const min = Math.min(...parsed.map((p) => p._start));
  const max = Math.max(...parsed.map((p) => p._end));
  const range = Math.max(max - min, 1);
  const track = document.createElement("div");
  track.className = "timeline-track";

  parsed.forEach((item) => {
    if (item.kind === "period") {
      const period = document.createElement("div");
      period.className = "timeline-period";
      period.style.left = `${((item._start - min) / range) * 100}%`;
      period.style.width = `${Math.max(4, ((item._end - item._start) / range) * 100)}%`;
      period.innerHTML = `<span>${item.label} (${item.start} → ${item.end})</span>`;
      track.append(period);
    } else {
      const mark = document.createElement("div");
      mark.className = "timeline-event";
      mark.style.left = `${((item._start - min) / range) * 100}%`;
      mark.innerHTML = `<strong>${item.label}</strong><small>${item.date}</small>`;
      track.append(mark);
    }
  });

  wrap.append(track);
  return wrap;
}


function escapeHtml(value) {
  const text = String(value);
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function videoEmbed(url = "") {
  if (url.includes("youtube.com/watch")) {
    const id = new URL(url).searchParams.get("v");
    return `<iframe height="150" src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe><a href="${url}" target="_blank">Abrir video</a>`;
  }
  if (url.includes("youtu.be/")) {
    const id = url.split("youtu.be/")[1].split("?")[0];
    return `<iframe height="150" src="https://www.youtube.com/embed/${id}" allowfullscreen></iframe><a href="${url}" target="_blank">Abrir video</a>`;
  }
  return `<a href="${url}" target="_blank">${url}</a>`;
}

function dragNode(ev, node, onMoveDetected) {
  ev.preventDefault();
  const start = { mouseX: ev.clientX, mouseY: ev.clientY, nodeX: node.x, nodeY: node.y };
  function onMove(e) {
    const dx = (e.clientX - start.mouseX) / state.viewport.scale;
    const dy = (e.clientY - start.mouseY) / state.viewport.scale;
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) onMoveDetected();
    node.x = start.nodeX + dx;
    node.y = start.nodeY + dy;
    renderBoard();
  }
  function onUp() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    save();
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function resizeNode(ev, node) {
  ev.preventDefault();
  const start = { mouseX: ev.clientX, mouseY: ev.clientY, width: node.width || 320, height: node.height || 200 };
  function onMove(e) {
    const dx = (e.clientX - start.mouseX) / state.viewport.scale;
    const dy = (e.clientY - start.mouseY) / state.viewport.scale;
    node.width = Math.max(220, start.width + dx);
    node.height = Math.max(130, start.height + dy);
    renderBoard();
  }
  function onUp() {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    save();
  }
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function drawConnection(conn, board) {
  const from = board.nodes.find((n) => n.id === conn.from);
  const to = board.nodes.find((n) => n.id === conn.to);
  if (!from || !to) return;

  const x1 = from.x + (from.width || 320) / 2;
  const y1 = from.y + (from.height || 200) / 2;
  const x2 = to.x + (to.width || 320) / 2;
  const y2 = to.y + (to.height || 200) / 2;

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("class", "connection-line");
  line.setAttribute("x1", x1);
  line.setAttribute("y1", y1);
  line.setAttribute("x2", x2);
  line.setAttribute("y2", y2);
  els.connections.append(line);
}

function createBoard(name) {
  const id = crypto.randomUUID();
  state.boards[id] = { id, name, nodes: [], connections: [] };
  state.activeBoardId = id;
  save();
  renderBoards();
  renderBoard();
}

function activeBoard() {
  return state.boards[state.activeBoardId];
}

function applyViewport() {
  const t = `translate(${state.viewport.x}px, ${state.viewport.y}px) scale(${state.viewport.scale})`;
  els.canvas.style.transform = t;
  els.connections.style.transform = t;
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const parsed = JSON.parse(raw);
  state.boards = parsed.boards || {};
  state.activeBoardId = parsed.activeBoardId || null;
  state.viewport = parsed.viewport || state.viewport;
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ boards: state.boards, activeBoardId: state.activeBoardId, viewport: state.viewport }));
}
