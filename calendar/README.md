# Hines Family Calendar

A family calendar and vacation planner. Shared across phones via Supabase — every family member sees the same data in real time.

## Setup (one-time, ~10 minutes)

### 1. Create the Supabase backend

1. Go to [supabase.com](https://supabase.com) and sign up (free).
2. Click **New project** — pick any name (e.g. "hines-family"), region near you, set a database password (save it but you won't need it for the app).
3. When the project finishes provisioning, open **SQL Editor → New query**, paste the contents of `supabase-schema.sql` from this folder, and click **Run**. This creates the `events` table and opens it up for reads/writes from the app.
4. Open **Database → Replication** and confirm realtime is on for the `events` table (the SQL script enables it, but double-check the toggle).
5. Open **Project Settings → API**. Copy two values:
   - **Project URL** (looks like `https://xxxxxxxx.supabase.co`)
   - **anon public** key (a long `eyJ…` JWT)

### 2. Paste credentials into `config.js`

Edit `calendar/config.js` and replace the two placeholder strings:

```js
window.FAMILY_CAL_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi…",
};
```

Commit and push. The **anon key is safe to commit** — it only grants the permissions defined by the Row Level Security policies in `supabase-schema.sql`.

### 3. Publish with GitHub Pages

1. In this repo on GitHub: **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main` (or whichever branch you merge this into) and folder `/ (root)`. Save.
3. Wait ~1 minute for the first deploy. Your URL will be:
   ```
   https://brandonhines5.github.io/Family/calendar/
   ```
4. Share that link with the family. On iPhone/Android, open it in the browser and **Add to Home Screen** so it behaves like an app.

## Using it

- **Calendar tab** — month view. Tap a day to add an event, tap a pill to edit. Filter by member or by confirmed/prospective status.
- **Vacations tab** — richer view for trips: flights, car rental, hotel, who's watching kids staying home, who's watching Sable, and notes.
- **Suggest Trip tab** — pick travelers, trip length, and a date window; it returns ranked date ranges with no confirmed conflicts, preferring those with more weekend days.
- Every edit syncs to everyone's phone within a second or two (thanks to Supabase realtime).

## Security model

With the default schema, anyone who has the site URL can read and write events. For a family calendar that nobody else knows about, this is reasonable. To tighten:

- Edit the RLS policies in Supabase to require Supabase Auth (email magic links or a shared password) — ask for guidance when you're ready.
- Regenerate the anon key in Supabase if you ever want to rotate it.

## Files

- `index.html` — markup
- `styles.css` — styles
- `config.js` — Supabase URL + anon key (fill this in)
- `app.js` — all logic (state, calendar rendering, event modal, vacations, suggestions, Supabase sync)
- `supabase-schema.sql` — run once in Supabase SQL editor
