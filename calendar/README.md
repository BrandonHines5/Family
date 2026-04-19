# Hines Family Calendar

A no-install family calendar and vacation planner. Runs entirely in the browser and saves to `localStorage`.

## Running

Open `calendar/index.html` in any browser — no build step, no server.

## Features

- **Month calendar view** with events for Brandon, Kelly, Montgomery, Justice, and Valor
- **Per-member assignment** for each event (with an "Everyone" toggle)
- **Prospective vs. confirmed** activities, visually distinguished
- **Vacations** capture flights, car rental, hotel, who's watching the kids staying home, who's watching Sable, and notes
- **Filter** the calendar by member and/or status
- **Suggest Trip** — enter travelers, trip length, and a date range; get ranked date windows with no confirmed conflicts
- **Auto-save** to `localStorage`

## Files

- `index.html` — markup
- `styles.css` — styles
- `app.js` — all logic (state, calendar rendering, event modal, vacations, suggestions)
