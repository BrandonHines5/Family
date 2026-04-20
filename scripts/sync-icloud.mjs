// Fetches published iCloud calendar feeds and upserts them into Supabase
// as read-only events tagged with the owning family member.
//
// Run by .github/workflows/sync-icloud.yml on a schedule. The Supabase
// URL + anon key are public (same ones embedded in the family calendar
// web app), and Row Level Security on the `events` table allows the
// anonymous role to insert/update/delete.

import { readFile } from "node:fs/promises";

const SUPABASE_URL = "https://amsstzzeuyuxqymkkeey.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFtc3N0enpldXl1eHF5bWtrZWV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQ0NTAsImV4cCI6MjA5MjE5MDQ1MH0.9oOxlqacqpwNjL_a0HPIzryFTFhqlkrlF1qluGQGxmI";

const HEADERS = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
};

function icsToHttps(url) {
  return url.replace(/^webcal:\/\//, "https://");
}

// --- ICS parser: just enough VEVENT / RRULE to cover typical iCloud feeds.
function unfold(text) {
  return text.replace(/\r\n/g, "\n").split("\n").reduce((out, line) => {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
    return out;
  }, []);
}

function parseIcsDate(val) {
  // Forms: 20260419, 20260419T120000, 20260419T120000Z, TZID=...:20260419T120000
  const m = val.match(/(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseVEvents(ics) {
  const lines = unfold(ics);
  const events = [];
  let inEvent = false;
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { inEvent = true; current = {}; continue; }
    if (line === "END:VEVENT") {
      if (current && current.summary && current.dtstart) events.push(current);
      inEvent = false;
      current = null;
      continue;
    }
    if (!inEvent || !current) continue;

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const rawKey = line.slice(0, colon);
    const val = line.slice(colon + 1);
    const key = rawKey.split(";")[0].toUpperCase();

    switch (key) {
      case "SUMMARY":     current.summary = unescape(val); break;
      case "UID":         current.uid = val; break;
      case "DTSTART":     current.dtstart = parseIcsDate(val); break;
      case "DTEND":       current.dtend = parseIcsDate(val); break;
      case "DESCRIPTION": current.description = unescape(val); break;
      case "LOCATION":    current.location = unescape(val); break;
      case "RRULE":       current.rrule = val; break;
      case "STATUS":      current.status = val; break;
    }
  }
  return events;
}

function unescape(s) {
  return s.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}

function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function dayDiff(aIso, bIso) {
  const a = Date.UTC(...aIso.split("-").map(Number).map((v, i) => i === 1 ? v - 1 : v));
  const b = Date.UTC(...bIso.split("-").map(Number).map((v, i) => i === 1 ? v - 1 : v));
  return Math.round((b - a) / 86400000);
}

// Expand simple RRULE (FREQ=DAILY/WEEKLY/MONTHLY[;INTERVAL=N][;UNTIL=...][;COUNT=N])
// across a 180-day window starting today. Good enough for typical personal feeds.
function expandRecurrence(ev, windowStartIso, windowEndIso) {
  const durationDays = ev.dtend ? dayDiff(ev.dtstart, ev.dtend) : 0;
  if (!ev.rrule) return [{ ...ev, startDate: ev.dtstart, endDate: ev.dtend || ev.dtstart }];

  const parts = {};
  ev.rrule.split(";").forEach(p => {
    const [k, v] = p.split("=");
    parts[k.toUpperCase()] = v;
  });
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || "1", 10);
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
  const untilIso = parts.UNTIL ? parseIcsDate(parts.UNTIL) : null;

  const step = freq === "DAILY" ? 1 : freq === "WEEKLY" ? 7 : freq === "MONTHLY" ? 30 : null;
  if (!step) return [{ ...ev, startDate: ev.dtstart, endDate: ev.dtend || ev.dtstart }];

  const out = [];
  let cursor = ev.dtstart;
  let produced = 0;
  const hardLimit = 200;
  while (cursor <= windowEndIso && (!untilIso || cursor <= untilIso) && (count == null || produced < count) && out.length < hardLimit) {
    if (cursor >= windowStartIso) {
      out.push({
        ...ev,
        startDate: cursor,
        endDate: durationDays ? addDays(cursor, durationDays) : cursor,
      });
    }
    cursor = addDays(cursor, step * interval);
    produced++;
  }
  return out;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function feedLabel(feed) {
  return feed.label || slug(feed.person || "feed");
}
function feedMembers(feed) {
  if (Array.isArray(feed.members) && feed.members.length) return feed.members;
  if (feed.person) return [feed.person];
  return [];
}

function toRow(feed, ev) {
  const label = feedLabel(feed);
  return {
    id: `ical-${label}-${ev.uid || slug(ev.summary + ev.startDate)}-${ev.startDate}`,
    title: ev.summary,
    type: "activity",
    status: "confirmed",
    start_date: ev.startDate,
    end_date: ev.endDate,
    members: feedMembers(feed),
    notes: "From Apple Calendar" + (ev.location ? `\nLocation: ${ev.location}` : "") + (ev.description ? `\n\n${ev.description}` : ""),
    vacation: null,
  };
}

async function main() {
  const cfgRaw = await readFile(new URL("./ical-feeds.json", import.meta.url), "utf8");
  const cfg = JSON.parse(cfgRaw);
  const feeds = cfg.feeds || [];
  if (!feeds.length) { console.log("No feeds configured."); return; }

  const today = new Date().toISOString().slice(0, 10);
  const horizon = addDays(today, 180);

  const rows = [];
  for (const feed of feeds) {
    const url = icsToHttps(feed.url);
    const label = feedLabel(feed);
    console.log(`Fetching feed "${label}" — ${url}`);
    const res = await fetch(url, { headers: { "User-Agent": "hines-family-calendar-sync" } });
    if (!res.ok) {
      console.error(`  failed: HTTP ${res.status}`);
      continue;
    }
    const ics = await res.text();
    const events = parseVEvents(ics);
    console.log(`  parsed ${events.length} VEVENT(s)`);
    for (const ev of events) {
      const expanded = expandRecurrence(ev, today, horizon);
      for (const occ of expanded) {
        rows.push(toRow(feed, occ));
      }
    }
  }
  console.log(`Total rows to upsert: ${rows.length}`);

  // Delete existing ical rows for each configured feed before re-inserting so
  // removed iCloud events disappear. Scoped by feed label so manually created
  // events and other feeds are untouched.
  for (const feed of feeds) {
    const prefix = `ical-${feedLabel(feed)}-`;
    const delUrl = `${SUPABASE_URL}/rest/v1/events?id=like.${encodeURIComponent(prefix + "*")}`;
    const delRes = await fetch(delUrl, { method: "DELETE", headers: HEADERS });
    if (!delRes.ok) {
      console.error(`Delete failed for "${feedLabel(feed)}": HTTP ${delRes.status} ${await delRes.text()}`);
    }
  }

  // Upsert in batches to keep requests small.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/events`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) {
      console.error(`Upsert batch failed: HTTP ${res.status} ${await res.text()}`);
      process.exitCode = 1;
      return;
    }
  }
  console.log("Done.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
