(() => {
  const STORAGE_KEY = "workoutTracker.days";
  const GOAL_PER_WEEK = 4;

  // State: a Set of "YYYY-MM-DD" strings for days worked out.
  let workoutDays = loadWorkouts();
  let viewDate = startOfMonth(new Date());

  const calendarEl = document.getElementById("calendar");
  const monthLabel = document.getElementById("monthLabel");
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");
  const todayBtn = document.getElementById("todayBtn");
  const reportWeek = document.getElementById("reportWeek");
  const reportMonth = document.getElementById("reportMonth");
  const reportQuarter = document.getElementById("reportQuarter");
  const statusWeek = document.getElementById("statusWeek");
  const statusMonth = document.getElementById("statusMonth");
  const statusQuarter = document.getElementById("statusQuarter");
  const totalCount = document.getElementById("totalCount");

  prevBtn.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    render();
  });

  nextBtn.addEventListener("click", () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    render();
  });

  todayBtn.addEventListener("click", () => {
    viewDate = startOfMonth(new Date());
    render();
  });

  function loadWorkouts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  function saveWorkouts() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...workoutDays]));
  }

  function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  function countWorkoutsInLastNDays(n) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      if (workoutDays.has(toKey(d))) count++;
    }
    return count;
  }

  function renderReport() {
    const week = countWorkoutsInLastNDays(7);
    const month = countWorkoutsInLastNDays(30);
    const quarter = countWorkoutsInLastNDays(90);
    reportWeek.textContent = week;
    reportMonth.textContent = month;
    reportQuarter.textContent = quarter;
    renderStatus(statusWeek, week, 7);
    renderStatus(statusMonth, month, 30);
    renderStatus(statusQuarter, quarter, 90);
    const total = workoutDays.size;
    totalCount.textContent = `${total} total workout${total === 1 ? "" : "s"}`;
  }

  function renderStatus(el, count, days) {
    const target = Math.round((GOAL_PER_WEEK * days) / 7);
    const onTrack = count >= target;
    el.classList.toggle("on-track", onTrack);
    el.classList.toggle("behind", !onTrack);
    el.textContent = onTrack
      ? `✓ On track (goal ${target})`
      : `✗ Behind (goal ${target})`;
  }

  function renderCalendar() {
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    monthLabel.textContent = `${monthNames[viewDate.getMonth()]} ${viewDate.getFullYear()}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstDay = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const leadingBlanks = firstDay.getDay();

    calendarEl.innerHTML = "";

    for (let i = 0; i < leadingBlanks; i++) {
      const cell = document.createElement("div");
      cell.className = "day empty";
      calendarEl.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
      const key = toKey(date);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "day";
      cell.textContent = day;
      cell.dataset.date = key;

      const isFuture = date.getTime() > today.getTime();
      if (sameDay(date, today)) cell.classList.add("today");
      if (workoutDays.has(key)) cell.classList.add("worked");
      if (isFuture) {
        cell.classList.add("future");
        cell.disabled = true;
        cell.title = "Future date";
      } else {
        cell.title = workoutDays.has(key)
          ? "Click to unmark workout"
          : "Click to mark as worked out";
        cell.addEventListener("click", () => toggleDay(key));
      }

      calendarEl.appendChild(cell);
    }
  }

  function toggleDay(key) {
    if (workoutDays.has(key)) workoutDays.delete(key);
    else workoutDays.add(key);
    saveWorkouts();
    render();
  }

  function render() {
    renderCalendar();
    renderReport();
  }

  render();
})();
