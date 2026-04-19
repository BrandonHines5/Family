// Hines Family Calendar
// Uses Supabase for shared state (with realtime sync across phones).
// Falls back to localStorage if Supabase config isn't provided.

const STORAGE_KEY = "hines-family-calendar-v1";
const MEMBERS = ["Brandon", "Kelly", "Montgomery", "Justice", "Valor"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

// ---------- Backend (Supabase or local) ----------
const cfg = window.FAMILY_CAL_CONFIG || {};
const SUPABASE_CONFIGURED =
  cfg.SUPABASE_URL &&
  cfg.SUPABASE_ANON_KEY &&
  !cfg.SUPABASE_URL.includes("YOUR-PROJECT-REF") &&
  !cfg.SUPABASE_ANON_KEY.includes("YOUR-ANON-KEY");

let supabase = null;
try {
  if (SUPABASE_CONFIGURED && window.supabase?.createClient) {
    supabase = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
} catch (err) {
  console.error("Supabase init failed:", err);
  supabase = null;
}

let state = { events: [] };
let viewDate = new Date();

// ---------- Date helpers ----------
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function fromISO(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function daysBetween(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / (1000 * 60 * 60 * 24));
}
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
function formatDateRange(start, end) {
  if (start === end) return formatShort(start);
  return `${formatShort(start)} – ${formatShort(end)}`;
}
function formatShort(iso) {
  const d = fromISO(iso);
  return `${MONTH_NAMES[d.getMonth()].slice(0,3)} ${d.getDate()}, ${d.getFullYear()}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- Serialization (db row <-> event) ----------
function rowToEvent(r) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    status: r.status,
    startDate: r.start_date,
    endDate: r.end_date,
    members: r.members || [],
    notes: r.notes || "",
    vacation: r.vacation || undefined,
  };
}
function eventToRow(ev) {
  return {
    id: ev.id,
    title: ev.title,
    type: ev.type,
    status: ev.status,
    start_date: ev.startDate,
    end_date: ev.endDate,
    members: ev.members,
    notes: ev.notes || "",
    vacation: ev.vacation || null,
  };
}

// ---------- Data layer ----------
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function initData() {
  if (supabase) {
    setSyncStatus("connecting", "Connecting…");
    const { data, error } = await supabase.from("events").select("*");
    if (error) {
      console.error(error);
      setSyncStatus("error", "Offline (read error)");
      const local = loadLocal();
      if (local) state = local;
      return;
    }
    state.events = data.map(rowToEvent);
    setSyncStatus("ok", "Synced");

    // One-time migration: if the cloud is empty and local has data, push it up.
    const local = loadLocal();
    if (state.events.length === 0 && local && local.events && local.events.length) {
      setSyncStatus("connecting", "Uploading local events…");
      const rows = local.events.map(eventToRow);
      const { error: upErr } = await supabase.from("events").upsert(rows);
      if (!upErr) {
        state.events = local.events;
        setSyncStatus("ok", "Synced (migrated local)");
      }
    }

    subscribeRealtime();
  } else {
    const local = loadLocal();
    if (local) state = local;
    setSyncStatus("local", "Local only — share setup incomplete");
  }
}

async function upsertEvent(ev) {
  if (supabase) {
    const { error } = await supabase.from("events").upsert(eventToRow(ev));
    if (error) { console.error(error); alert("Save failed: " + error.message); return false; }
  } else {
    saveLocal();
  }
  return true;
}

async function deleteEvent(id) {
  if (supabase) {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { console.error(error); alert("Delete failed: " + error.message); return false; }
  } else {
    saveLocal();
  }
  return true;
}

function subscribeRealtime() {
  supabase
    .channel("events-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "events" }, (payload) => {
      if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
        const ev = rowToEvent(payload.new);
        const idx = state.events.findIndex(e => e.id === ev.id);
        if (idx >= 0) state.events[idx] = ev;
        else state.events.push(ev);
      } else if (payload.eventType === "DELETE") {
        state.events = state.events.filter(e => e.id !== payload.old.id);
      }
      renderCalendar();
      if (activeTab() === "vacations") renderVacations();
    })
    .subscribe();
}

function setSyncStatus(kind, text) {
  const el = document.getElementById("sync-status");
  if (!el) return;
  el.textContent = text;
  el.dataset.kind = kind;
}

function activeTab() {
  return document.querySelector(".tab-btn.active")?.dataset.tab;
}

// ---------- Event helpers ----------
function eventCoversDate(ev, isoDate) {
  return isoDate >= ev.startDate && isoDate <= ev.endDate;
}
function eventsOnDate(isoDate) {
  return state.events.filter(ev => eventCoversDate(ev, isoDate));
}

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("view-" + btn.dataset.tab).classList.add("active");
    if (btn.dataset.tab === "vacations") renderVacations();
    if (btn.dataset.tab === "suggest") initSuggestView();
  });
});

// ---------- Calendar grid ----------
const gridEl = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("month-label");

function renderCalendar() {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  monthLabel.textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const gridStart = addDays(firstOfMonth, -startDay);

  const activeMembers = getFilterMembers();
  const showConfirmed = document.getElementById("filter-confirmed").checked;
  const showProspective = document.getElementById("filter-prospective").checked;

  const today = new Date();
  gridEl.innerHTML = "";

  for (let i = 0; i < 42; i++) {
    const cellDate = addDays(gridStart, i);
    const iso = toISO(cellDate);
    const cell = document.createElement("div");
    cell.className = "day-cell";
    if (cellDate.getMonth() !== month) cell.classList.add("other-month");
    if (sameDay(cellDate, today)) cell.classList.add("today");

    const num = document.createElement("div");
    num.className = "day-num";
    num.textContent = cellDate.getDate();
    cell.appendChild(num);

    const dayEvents = eventsOnDate(iso).filter(ev => {
      if (ev.status === "confirmed" && !showConfirmed) return false;
      if (ev.status === "prospective" && !showProspective) return false;
      return ev.members.some(m => activeMembers.includes(m));
    });
    dayEvents.sort((a, b) => (a.type === "vacation" ? -1 : 1));

    const MAX = 4;
    dayEvents.slice(0, MAX).forEach(ev => cell.appendChild(renderEventPill(ev)));
    if (dayEvents.length > MAX) {
      const more = document.createElement("div");
      more.className = "more-indicator";
      more.textContent = `+${dayEvents.length - MAX} more`;
      more.addEventListener("click", () => alert(
        dayEvents.map(e => `• ${e.title} (${e.members.join(", ")})`).join("\n")
      ));
      cell.appendChild(more);
    }

    cell.addEventListener("click", (e) => {
      if (e.target.classList.contains("event-pill") || e.target.closest(".event-pill")) return;
      if (e.target.classList.contains("more-indicator")) return;
      openEventModal({ defaultDate: iso });
    });

    gridEl.appendChild(cell);
  }
}

function renderEventPill(ev) {
  const pill = document.createElement("div");
  pill.className = "event-pill " + ev.status + (ev.type === "vacation" ? " vacation" : "");
  const dots = document.createElement("span");
  dots.className = "dots";
  ev.members.forEach(m => {
    const dot = document.createElement("span");
    dot.className = "dot d-" + m.toLowerCase();
    dot.title = m;
    dots.appendChild(dot);
  });
  pill.appendChild(dots);
  pill.appendChild(document.createTextNode(
    (ev.type === "vacation" ? "✈ " : "") + ev.title
  ));
  pill.title = `${ev.title}\n${formatDateRange(ev.startDate, ev.endDate)}\n${ev.members.join(", ")}\n${ev.status}`;
  pill.addEventListener("click", (e) => {
    e.stopPropagation();
    openEventModal({ event: ev });
  });
  return pill;
}

function getFilterMembers() {
  return Array.from(document.querySelectorAll(".filter-member:checked")).map(el => el.value);
}

document.getElementById("prev-month").addEventListener("click", () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  renderCalendar();
});
document.getElementById("next-month").addEventListener("click", () => {
  viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
  renderCalendar();
});
document.getElementById("today-btn").addEventListener("click", () => {
  viewDate = new Date();
  renderCalendar();
});
document.getElementById("new-event-btn").addEventListener("click", () => openEventModal({}));
document.querySelectorAll(".filter-member, #filter-confirmed, #filter-prospective")
  .forEach(el => el.addEventListener("change", renderCalendar));

// ---------- Event modal ----------
const modal = document.getElementById("event-modal");
const form = document.getElementById("event-form");
const typeSelect = document.getElementById("event-type");
const vacationFields = document.getElementById("vacation-fields");
const membersContainer = document.getElementById("event-members");
const everyoneToggle = document.getElementById("event-everyone");
const flightsList = document.getElementById("flights-list");
const deleteBtn = document.getElementById("event-delete");
const modalTitle = document.getElementById("event-modal-title");

buildMemberToggles(membersContainer, "event-member");
buildMemberToggles(document.getElementById("suggest-members"), "suggest-member");

function buildMemberToggles(container, namePrefix) {
  container.innerHTML = "";
  MEMBERS.forEach(m => {
    const label = document.createElement("label");
    label.className = "member-chip";
    label.innerHTML = `<input type="checkbox" name="${namePrefix}" value="${m}" /><span class="chip c-${m.toLowerCase()}">${m}</span>`;
    container.appendChild(label);
  });
}

typeSelect.addEventListener("change", () => {
  vacationFields.hidden = typeSelect.value !== "vacation";
});
everyoneToggle.addEventListener("change", () => {
  document.querySelectorAll('[name="event-member"]').forEach(cb => {
    cb.checked = everyoneToggle.checked;
  });
});
membersContainer.addEventListener("change", () => {
  const all = Array.from(document.querySelectorAll('[name="event-member"]'));
  everyoneToggle.checked = all.every(x => x.checked);
});

document.getElementById("event-close").addEventListener("click", closeModal);
document.getElementById("event-cancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});

document.getElementById("add-flight").addEventListener("click", () => addFlightRow({}));

function addFlightRow(flight) {
  const row = document.createElement("div");
  row.className = "flight-row";
  row.innerHTML = `
    <input type="text" class="flight-input" placeholder="Who / Airline / Flight # / Dates / Confirmation" value="${escapeAttr(flight.detail || "")}" />
    <button type="button" class="secondary small remove-flight">Remove</button>
  `;
  row.querySelector(".remove-flight").addEventListener("click", () => row.remove());
  flightsList.appendChild(row);
}

function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function openEventModal({ event, defaultDate } = {}) {
  if (membersContainer.children.length === 0) {
    buildMemberToggles(membersContainer, "event-member");
  }
  form.reset();
  flightsList.innerHTML = "";
  deleteBtn.hidden = !event;
  modalTitle.textContent = event ? "Edit Event" : "New Event";

  if (event) {
    document.getElementById("event-id").value = event.id;
    document.getElementById("event-title").value = event.title;
    typeSelect.value = event.type;
    document.getElementById("event-status").value = event.status;
    document.getElementById("event-start").value = event.startDate;
    document.getElementById("event-end").value = event.endDate;
    document.getElementById("event-notes").value = event.notes || "";
    document.querySelectorAll('[name="event-member"]').forEach(cb => {
      cb.checked = event.members.includes(cb.value);
    });
    everyoneToggle.checked = event.members.length === MEMBERS.length;
    if (event.type === "vacation") {
      document.getElementById("v-car").value = event.vacation?.carRental || "";
      document.getElementById("v-hotel").value = event.vacation?.hotel || "";
      document.getElementById("v-kids-care").value = event.vacation?.kidsCare || "";
      document.getElementById("v-sable").value = event.vacation?.sableCare || "";
      (event.vacation?.flights || []).forEach(addFlightRow);
    }
  } else {
    document.getElementById("event-id").value = "";
    const d = defaultDate || toISO(new Date());
    document.getElementById("event-start").value = d;
    document.getElementById("event-end").value = d;
    document.getElementById("event-status").value = "confirmed";
    typeSelect.value = "activity";
  }
  vacationFields.hidden = typeSelect.value !== "vacation";
  modal.hidden = false;
  modal.style.display = "";
}

function closeModal() {
  modal.hidden = true;
  modal.style.display = "none";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = document.getElementById("event-id").value || uid();
  const members = Array.from(document.querySelectorAll('[name="event-member"]:checked')).map(cb => cb.value);
  if (members.length === 0) {
    alert("Select at least one family member (or toggle Everyone).");
    return;
  }
  const startDate = document.getElementById("event-start").value;
  const endDate = document.getElementById("event-end").value;
  if (endDate < startDate) {
    alert("End date must be on or after start date.");
    return;
  }
  const type = typeSelect.value;
  const ev = {
    id,
    title: document.getElementById("event-title").value.trim(),
    type,
    status: document.getElementById("event-status").value,
    startDate,
    endDate,
    members,
    notes: document.getElementById("event-notes").value.trim(),
  };
  if (type === "vacation") {
    const flights = Array.from(flightsList.querySelectorAll(".flight-input"))
      .map(i => ({ detail: i.value.trim() }))
      .filter(f => f.detail);
    ev.vacation = {
      flights,
      carRental: document.getElementById("v-car").value.trim(),
      hotel: document.getElementById("v-hotel").value.trim(),
      kidsCare: document.getElementById("v-kids-care").value.trim(),
      sableCare: document.getElementById("v-sable").value.trim(),
    };
  }

  // Optimistic local update
  const idx = state.events.findIndex(e => e.id === id);
  if (idx >= 0) state.events[idx] = ev;
  else state.events.push(ev);

  const ok = await upsertEvent(ev);
  if (!ok && !supabase) saveLocal();
  if (!supabase) saveLocal();
  closeModal();
  renderCalendar();
  if (activeTab() === "vacations") renderVacations();
});

deleteBtn.addEventListener("click", async () => {
  const id = document.getElementById("event-id").value;
  if (!id) return;
  if (!confirm("Delete this event?")) return;
  state.events = state.events.filter(e => e.id !== id);
  await deleteEvent(id);
  if (!supabase) saveLocal();
  closeModal();
  renderCalendar();
  renderVacations();
});

// ---------- Vacations view ----------
document.getElementById("new-vacation-btn").addEventListener("click", () => {
  openEventModal({});
  typeSelect.value = "vacation";
  vacationFields.hidden = false;
});

function renderVacations() {
  const list = document.getElementById("vacation-list");
  const vacations = state.events
    .filter(e => e.type === "vacation")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  if (vacations.length === 0) {
    list.innerHTML = `<div class="empty">No vacations yet. Click "+ New Vacation" to add one.</div>`;
    return;
  }
  list.innerHTML = "";
  vacations.forEach(v => list.appendChild(renderVacationCard(v)));
}

function renderVacationCard(v) {
  const card = document.createElement("div");
  card.className = "vacation-card " + v.status;
  const travelers = v.members.map(m => `<span class="chip c-${m.toLowerCase()}">${m}</span>`).join("");
  const notGoing = MEMBERS.filter(m => !v.members.includes(m));
  const vac = v.vacation || {};

  const detailRows = [];
  if (vac.flights && vac.flights.length) {
    detailRows.push(`<div class="detail-row"><div class="label">Flights</div><div>${
      vac.flights.map(f => escapeHtml(f.detail)).join("<br>")
    }</div></div>`);
  }
  if (vac.carRental) detailRows.push(`<div class="detail-row"><div class="label">Car rental</div><div>${escapeHtml(vac.carRental)}</div></div>`);
  if (vac.hotel) detailRows.push(`<div class="detail-row"><div class="label">Hotel</div><div>${escapeHtml(vac.hotel)}</div></div>`);
  if (notGoing.length && vac.kidsCare) {
    detailRows.push(`<div class="detail-row"><div class="label">Kids staying home</div><div><strong>${notGoing.join(", ")}</strong> — ${escapeHtml(vac.kidsCare)}</div></div>`);
  } else if (notGoing.length) {
    detailRows.push(`<div class="detail-row"><div class="label">Kids staying home</div><div>${notGoing.join(", ")} — <em>care not yet arranged</em></div></div>`);
  }
  if (vac.sableCare) detailRows.push(`<div class="detail-row"><div class="label">Sable's care</div><div>${escapeHtml(vac.sableCare)}</div></div>`);
  if (v.notes) detailRows.push(`<div class="detail-row"><div class="label">Notes</div><div>${escapeHtml(v.notes)}</div></div>`);

  card.innerHTML = `
    <h3>
      <span>✈ ${escapeHtml(v.title)} <span class="status-tag ${v.status}">${v.status}</span></span>
      <button class="edit-link" data-edit-id="${v.id}">Edit</button>
    </h3>
    <div class="dates">${formatDateRange(v.startDate, v.endDate)} · ${daysBetween(v.startDate, v.endDate) + 1} days</div>
    <div class="travelers">${travelers || '<span class="muted">No travelers selected</span>'}</div>
    ${detailRows.join("")}
  `;
  card.querySelector(".edit-link").addEventListener("click", () => openEventModal({ event: v }));
  return card;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  })[c]);
}

// ---------- Suggest Trip ----------
function initSuggestView() {
  const startInput = document.getElementById("suggest-start");
  const endInput = document.getElementById("suggest-end");
  if (!startInput.value) {
    const today = new Date();
    startInput.value = toISO(today);
    endInput.value = toISO(addDays(today, 180));
  }
}

document.getElementById("suggest-everyone").addEventListener("change", (e) => {
  document.querySelectorAll('[name="suggest-member"]').forEach(cb => cb.checked = e.target.checked);
});

document.getElementById("suggest-run").addEventListener("click", () => {
  const members = Array.from(document.querySelectorAll('[name="suggest-member"]:checked')).map(cb => cb.value);
  const duration = parseInt(document.getElementById("suggest-duration").value, 10);
  const start = document.getElementById("suggest-start").value;
  const end = document.getElementById("suggest-end").value;
  const avoidProspective = document.getElementById("suggest-avoid-prospective").checked;

  const resultsEl = document.getElementById("suggest-results");
  if (!members.length) {
    resultsEl.innerHTML = `<div class="empty">Pick at least one traveler.</div>`;
    return;
  }
  if (!start || !end || !duration) {
    resultsEl.innerHTML = `<div class="empty">Fill out duration and date range.</div>`;
    return;
  }
  if (fromISO(end) < fromISO(start)) {
    resultsEl.innerHTML = `<div class="empty">Latest date must be after earliest date.</div>`;
    return;
  }

  const suggestions = findAvailableWindows({ members, duration, start, end, avoidProspective });
  if (!suggestions.length) {
    resultsEl.innerHTML = `<div class="empty">No ${duration}-day windows are fully free. Try extending the date range, shortening the trip, or turning off "avoid prospective".</div>`;
    return;
  }
  resultsEl.innerHTML = "";
  const header = document.createElement("h3");
  header.textContent = `Top ${Math.min(suggestions.length, 10)} suggestions`;
  resultsEl.appendChild(header);

  suggestions.slice(0, 10).forEach(s => {
    const row = document.createElement("div");
    row.className = "suggest-result " + (s.prospectiveConflicts === 0 ? "clean" : "ok");
    const note = s.prospectiveConflicts === 0
      ? "No conflicts"
      : `${s.prospectiveConflicts} prospective conflict${s.prospectiveConflicts>1?"s":""}`;
    row.innerHTML = `
      <div>
        <div class="range">${formatDateRange(s.startDate, s.endDate)}</div>
        <div class="note">${note}${s.weekendDays ? " · " + s.weekendDays + " weekend day(s)" : ""}</div>
      </div>
      <button class="secondary small" data-plan="${s.startDate}|${s.endDate}">Plan trip</button>
    `;
    row.querySelector("[data-plan]").addEventListener("click", () => {
      openEventModal({});
      typeSelect.value = "vacation";
      vacationFields.hidden = false;
      document.getElementById("event-start").value = s.startDate;
      document.getElementById("event-end").value = s.endDate;
      document.getElementById("event-title").value = "New Trip";
      document.querySelectorAll('[name="event-member"]').forEach(cb => {
        cb.checked = members.includes(cb.value);
      });
      everyoneToggle.checked = members.length === MEMBERS.length;
    });
    resultsEl.appendChild(row);
  });
}

function findAvailableWindows({ members, duration, start, end, avoidProspective }) {
  const results = [];
  let cursor = fromISO(start);
  const endDate = fromISO(end);

  while (addDays(cursor, duration - 1) <= endDate) {
    const windowStart = toISO(cursor);
    const windowEnd = toISO(addDays(cursor, duration - 1));
    let hasConfirmedConflict = false;
    let prospectiveConflicts = 0;

    for (const ev of state.events) {
      if (!ev.members.some(m => members.includes(m))) continue;
      if (ev.endDate < windowStart || ev.startDate > windowEnd) continue;
      if (ev.status === "confirmed") { hasConfirmedConflict = true; break; }
      if (ev.status === "prospective") prospectiveConflicts++;
    }

    if (!hasConfirmedConflict && (!avoidProspective || prospectiveConflicts === 0)) {
      let weekendDays = 0;
      for (let i = 0; i < duration; i++) {
        const day = addDays(cursor, i).getDay();
        if (day === 0 || day === 6) weekendDays++;
      }
      results.push({ startDate: windowStart, endDate: windowEnd, prospectiveConflicts, weekendDays });
    }
    cursor = addDays(cursor, 1);
  }

  results.sort((a, b) =>
    a.prospectiveConflicts - b.prospectiveConflicts
    || b.weekendDays - a.weekendDays
    || a.startDate.localeCompare(b.startDate)
  );
  return results;
}

// ---------- Boot ----------
(async function boot() {
  await initData();
  renderCalendar();
})();
