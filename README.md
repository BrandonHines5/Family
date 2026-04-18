# Basketball Stats Tracker

A simple, no-install basketball stats tracker for logging your son's games. Runs entirely in the browser and saves to `localStorage`.

## Running

Just open `index.html` in any browser — no build step, no server.

## Features

- **Live game tracking** — tap to log made/missed FTs, 2s, and 3s (auto-calculates points)
- **Counting stats** — rebounds, assists, steals, blocks, turnovers, fouls (with +/− buttons)
- **Career averages** — PPG, RPG, APG, SPG, BPG, TOPG, FG%, 3P%, FT%
- **Game history** — per-game lines with delete
- **Export** — download all data as JSON for backup
- **Auto-save** — live games persist even if you close the tab

## Files

- `index.html` — markup
- `styles.css` — styles
- `app.js` — all logic

## Workout Tracker

A companion app for logging daily workouts on a calendar. Open `workout.html` in any browser.

- Monthly calendar view with today highlighted
- Click any past or current day to toggle "worked out"
- Report of workouts over the past week, month, and 3 months
- Data persists in `localStorage`

Files: `workout.html`, `workout.css`, `workout.js`.
