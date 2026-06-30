import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Sun, Dumbbell, Utensils, Moon, CalendarCheck, Sparkles,
  ChevronLeft, ChevronRight, Bell, BellOff, Check, X, Activity, Flame, Clock
} from "lucide-react";

/* ----------------------------- schema ----------------------------- */
const BLOCKS = [
  { id: "morning", label: "Morning", time: "7–8:30 am", icon: Sun, tint: "#E8B06A",
    items: [
      { id: "b12", name: "Vitamin B12", note: "1500mcg · after breakfast" },
      { id: "amla", name: "Amla", note: "empty stomach" },
      { id: "acv", name: "Apple cider vinegar", note: "diluted, before food" },
      { id: "honey", name: "Honey", note: "optional · warm water" },
      { id: "coffee", name: "Coffee", note: "½ packet · Mon–Thu", only: "mon-thu" },
    ] },
  { id: "pre", label: "Pre-workout", time: "before gym", icon: Dumbbell, tint: "#6FB1C9",
    items: [
      { id: "creatine", name: "Creatine", note: "3–5g · extra water" },
      { id: "citrulline", name: "L-citrulline", note: "30–40 min before" },
      { id: "beetroot", name: "Beetroot powder", note: "~90 min before" },
      { id: "electrolytes", name: "Electrolytes", note: "around workout" },
    ] },
  { id: "meals", label: "With meals", time: "~1 pm lunch", icon: Utensils, tint: "#C9A96F",
    items: [
      { id: "d3k2", name: "Vitamin D3 + K2", note: "fatty meal", fat: true },
      { id: "fishoil", name: "Fish oil", note: "fatty meal", fat: true },
      { id: "turmeric", name: "Turmeric mix", note: "with ghee", fat: true },
      { id: "garlic", name: "Garlic extract", note: "with food" },
      { id: "flax", name: "Flax / sesame", note: "ground" },
      { id: "chia", name: "Chia / basil", note: "soaked + water" },
      { id: "whey", name: "Whey", note: "post-workout" },
      { id: "pepper", name: "Black pepper", note: "with food" },
      { id: "fennel", name: "Variyal / ajmo", note: "after meals" },
    ] },
  { id: "evening", label: "Evening / bed", time: "7–11 pm", icon: Moon, tint: "#8E7BC9",
    items: [
      { id: "magzinc", name: "Mag + Zinc", note: "light food · away from whey" },
      { id: "magcit", name: "Mag citrate+glycinate", note: "bedtime" },
      { id: "triphala", name: "Triphala", note: "bedtime · gut" },
      { id: "arjun", name: "Arjun chaal", note: "warm water" },
    ] },
  { id: "weekly", label: "Weekly", time: "Sat dinner", icon: CalendarCheck, tint: "#C97BA9",
    items: [
      { id: "ciplad", name: "Cipla Vit D 60k", note: "buffalo milk", only: "sat", fat: true },
    ] },
  { id: "optional", label: "Optional", time: "anytime", icon: Sparkles, tint: "#7B8794",
    items: [
      { id: "traya", name: "Traya hair", note: "per card" },
      { id: "heart", name: "Heart juice", note: "anytime" },
      { id: "oats", name: "Oats / soya", note: "meals" },
      { id: "seedsmix", name: "Seedsmix", note: "into whey" },
    ] },
];
const DEFAULT_TIMES = { morning: "08:00", pre: "17:30", meals: "13:00", evening: "22:30", weekly: "20:30" };
const CORE_IDS = ["b12", "d3k2", "fishoil", "magzinc", "magcit", "ciplad"]; // the ones that move July bloodwork

/* ----------------------------- config ----------------------------- */
// 1) In your Google Sheet: Extensions > Apps Script, paste the Code.gs Claude gave you.
// 2) Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > copy the URL.
// 3) Paste that URL between the quotes below. Leave blank to skip syncing.
const SHEET_URL = "";

/* ----------------------------- storage ----------------------------- */
// Uses Claude's built-in storage inside the Claude app; falls back to the browser's
// own storage when you host the file yourself (Vercel / Netlify / GitHub Pages).
const store = (typeof window !== "undefined" && window.storage)
  ? window.storage
  : { get: async (k) => { const v = window.localStorage.getItem(k); return v == null ? null : { value: v }; },
      set: async (k, v) => window.localStorage.setItem(k, v) };
const hasStore = typeof window !== "undefined";
const dayKey = (d) => `day:${d}`;
async function loadKey(k) { try { const r = await store.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } }
async function saveKey(k, v) { try { await store.set(k, JSON.stringify(v)); } catch (e) { console.error(e); } }

// Fire-and-forget POST to Google Sheets. text/plain avoids a CORS preflight, so the row
// gets written even though we don't read the response.
// NOTE: external calls are blocked inside the Claude preview — this only reaches Google
// when you run the file from a host or locally, not in the in-chat preview.
async function syncToSheet(date, day, derived) {
  if (!/^https?:/.test(SHEET_URL)) return;
  try {
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        date, slept: day.slept, woke: day.woke, hours: derived.hours,
        energy: day.energy, classes: day.classes, gym: day.gym, studied: day.studied,
        taken: derived.taken, total: derived.total, pct: derived.pct,
        studyNote: day.studyNote, winNote: day.winNote, supps: JSON.stringify(day.supps),
      }),
    });
  } catch (e) { console.error("sheet sync failed", e); }
}

const iso = (date) => { const d = new Date(date); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const isApplicable = (item, dateStr) => {
  const wd = new Date(dateStr + "T00:00").getDay(); // 0 Sun .. 6 Sat
  if (item.only === "mon-thu") return wd >= 1 && wd <= 4;
  if (item.only === "sat") return wd === 6;
  return true;
};
const blockVisible = (block, dateStr) => block.items.some((it) => isApplicable(it, dateStr));

/* ----------------------------- app ----------------------------- */
export default function App() {
  const [dateStr, setDateStr] = useState(iso(new Date()));
  const [day, setDay] = useState(null);
  const [index, setIndex] = useState({});
  const [tab, setTab] = useState("today");
  const [settings, setSettings] = useState({ remindersOn: false, times: DEFAULT_TIMES });
  const [saved, setSaved] = useState(true);
  const [toast, setToast] = useState(null);
  const saveTimer = useRef(null);
  const timers = useRef([]);

  const blankDay = () => ({ supps: {}, slept: "", woke: "", energy: 0, classes: 0, gym: 0, studied: 0, studyNote: "", winNote: "" });

  useEffect(() => { (async () => {
    if (hasStore) { const s = await loadKey("settings"); if (s) setSettings(s); const ix = await loadKey("index"); if (ix) setIndex(ix); }
  })(); }, []);

  useEffect(() => { (async () => {
    setDay(null);
    const d = hasStore ? await loadKey(dayKey(dateStr)) : null;
    setDay(d || blankDay());
  })(); }, [dateStr]);

  const applicableItems = BLOCKS.flatMap((b) => b.items).filter((it) => isApplicable(it, dateStr));
  const takenCount = day ? applicableItems.filter((it) => day.supps[it.id] === "yes").length : 0;
  const pct = applicableItems.length ? Math.round((takenCount / applicableItems.length) * 100) : 0;

  const persist = useCallback((next) => {
    setDay(next); setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      if (!hasStore) { setSaved(true); return; }
      await saveKey(dayKey(dateStr), next);
      const appl = BLOCKS.flatMap((b) => b.items).filter((it) => isApplicable(it, dateStr));
      const t = appl.filter((it) => next.supps[it.id] === "yes").length;
      const p = appl.length ? Math.round((t / appl.length) * 100) : 0;
      const ix = { ...index, [dateStr]: p }; setIndex(ix); await saveKey("index", ix);
      syncToSheet(dateStr, next, { hours: hours(next.slept, next.woke), taken: t, total: appl.length, pct: p });
      setSaved(true);
    }, 600);
  }, [dateStr, index]);

  const cycle = (id) => { const cur = day.supps[id]; const nx = cur === "yes" ? "no" : cur === "no" ? undefined : "yes"; const supps = { ...day.supps }; if (nx) supps[id] = nx; else delete supps[id]; persist({ ...day, supps }); };
  const setField = (k, v) => persist({ ...day, [k]: v });
  const cycleYN = (k) => { const order = [0, 1, 2]; const nx = order[(order.indexOf(day[k]) + 1) % 3]; setField(k, nx); };

  const shiftDay = (n) => { const d = new Date(dateStr + "T00:00"); d.setDate(d.getDate() + n); setDateStr(iso(d)); };
  const today = iso(new Date());

  /* reminders (best-effort, only while tab is open) */
  const scheduleReminders = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = [];
    if (!settings.remindersOn || dateStr !== today) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const now = new Date();
    Object.entries(settings.times).forEach(([blockId, hhmm]) => {
      const blk = BLOCKS.find((b) => b.id === blockId); if (!blk || !blockVisible(blk, today)) return;
      const [h, m] = hhmm.split(":").map(Number);
      const when = new Date(); when.setHours(h, m, 0, 0);
      const delay = when - now;
      if (delay > 0 && delay < 24 * 3600 * 1000) {
        const id = setTimeout(() => {
          const names = blk.items.filter((it) => isApplicable(it, today)).map((it) => it.name).slice(0, 4).join(", ");
          try { new Notification(`${blk.label} stack`, { body: names }); } catch {}
          setToast(`${blk.label}: ${names}`); setTimeout(() => setToast(null), 6000);
        }, delay);
        timers.current.push(id);
      }
    });
  }, [settings, dateStr, today]);
  useEffect(() => { scheduleReminders(); return () => timers.current.forEach(clearTimeout); }, [scheduleReminders]);

  const enableReminders = async () => {
    if (typeof Notification === "undefined") { const s = { ...settings, remindersOn: true }; setSettings(s); saveKey("settings", s); setToast("Reminders on — works while this tab is open"); setTimeout(() => setToast(null), 4000); return; }
    const perm = await Notification.requestPermission();
    const s = { ...settings, remindersOn: perm === "granted" }; setSettings(s); saveKey("settings", s);
    setToast(perm === "granted" ? "Reminders on" : "Notifications blocked — use phone alarms"); setTimeout(() => setToast(null), 5000);
  };
  const setTime = (b, v) => { const s = { ...settings, times: { ...settings.times, [b]: v } }; setSettings(s); saveKey("settings", s); };

  /* streak from index */
  const streak = (() => { let n = 0; const d = new Date(); for (;;) { const k = iso(d); if ((index[k] || 0) >= 60) { n++; d.setDate(d.getDate() - 1); } else break; } return n; })();

  return (
    <div className="wrap">
      <style>{CSS}</style>

      {/* header */}
      <header className="hd">
        <div className="ring" style={{ background: `conic-gradient(var(--gold) ${pct * 3.6}deg, var(--track) 0deg)` }}>
          <div className="ring-in"><span className="ring-pct">{pct}</span><span className="ring-lbl">%</span></div>
        </div>
        <div className="hd-mid">
          <div className="datenav">
            <button onClick={() => shiftDay(-1)} aria-label="Previous day"><ChevronLeft size={18} /></button>
            <div className="dlabel">
              <span className="dweek">{new Date(dateStr + "T00:00").toLocaleDateString("en-US", { weekday: "long" })}</span>
              <span className="ddate">{new Date(dateStr + "T00:00").toLocaleDateString("en-US", { day: "numeric", month: "short" })}</span>
            </div>
            <button onClick={() => shiftDay(1)} aria-label="Next day"><ChevronRight size={18} /></button>
          </div>
          <div className="hd-sub">
            {dateStr !== today && <button className="todaybtn" onClick={() => setDateStr(today)}>Today</button>}
            <span className="count">{takenCount}/{applicableItems.length} taken</span>
            <span className={"savedot " + (saved ? "ok" : "")}>{saved ? "saved" : "saving…"}</span>
          </div>
        </div>
      </header>

      {/* tabs */}
      <nav className="tabs">
        {[["today", "Today", Activity], ["history", "History", Flame], ["setup", "Reminders", Bell]].map(([id, lbl, Ic]) => (
          <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}><Ic size={15} /> {lbl}</button>
        ))}
      </nav>

      {!day ? <div className="loading">loading…</div> : (
        <main>
          {tab === "today" && <>
            {/* life log */}
            <section className="card life">
              <div className="row2">
                <label className="fld"><span>Slept</span><input type="time" value={day.slept} onChange={(e) => setField("slept", e.target.value)} /></label>
                <label className="fld"><span>Woke</span><input type="time" value={day.woke} onChange={(e) => setField("woke", e.target.value)} /></label>
                <div className="fld hrs"><span>Hours</span><b>{hours(day.slept, day.woke)}</b></div>
              </div>
              <div className="energy">
                <span className="elab">Energy</span>
                <div className="edots">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={"edot " + (day.energy >= n ? "fill" : "")} style={day.energy >= n ? { background: energyColor(day.energy) } : {}} onClick={() => setField("energy", day.energy === n ? 0 : n)} aria-label={`Energy ${n}`} />
                  ))}
                </div>
              </div>
              <div className="showed">
                {[["classes", "Classes"], ["gym", "Gym"], ["studied", "Studied"]].map(([k, lbl]) => (
                  <button key={k} className={"chip yn s" + day[k]} onClick={() => cycleYN(k)}>
                    {day[k] === 1 ? <Check size={13} /> : day[k] === 2 ? <X size={13} /> : null}{lbl}
                  </button>
                ))}
              </div>
              <input className="note" placeholder="Study note — what / how long" value={day.studyNote} onChange={(e) => setField("studyNote", e.target.value)} />
              <input className="note" placeholder="One win today" value={day.winNote} onChange={(e) => setField("winNote", e.target.value)} />
            </section>

            {/* supplement blocks */}
            {BLOCKS.filter((b) => blockVisible(b, dateStr)).map((b) => {
              const items = b.items.filter((it) => isApplicable(it, dateStr));
              const done = items.filter((it) => day.supps[it.id] === "yes").length;
              const Ic = b.icon;
              return (
                <section className="card blk" key={b.id} style={{ "--tint": b.tint }}>
                  <div className="blkhead">
                    <span className="blkicon"><Ic size={15} /></span>
                    <span className="blkname">{b.label}</span>
                    <span className="blktime"><Clock size={11} /> {b.time}</span>
                    <span className="blkdone">{done}/{items.length}</span>
                  </div>
                  <div className="chips">
                    {items.map((it) => {
                      const st = day.supps[it.id];
                      return (
                        <button key={it.id} className={"chip supp " + (st === "yes" ? "yes" : st === "no" ? "no" : "") + (CORE_IDS.includes(it.id) ? " core" : "")} onClick={() => cycle(it.id)}>
                          <span className="cmark">{st === "yes" ? <Check size={13} /> : st === "no" ? <X size={13} /> : null}</span>
                          <span className="cname">{it.name}{it.fat && <i className="fat">fat</i>}</span>
                          <span className="cnote">{it.note}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <p className="foot">A blank is just data, not a verdict. The ones that decide July are marked <b className="core inline">core</b>.</p>
          </>}

          {tab === "history" && <History index={index} streak={streak} onPick={(d) => { setDateStr(d); setTab("today"); }} />}

          {tab === "setup" && (
            <section className="card setup">
              <div className="setrow">
                <div>
                  <h3>Reminders</h3>
                  <p className="dim">Nudges per time-block. These fire only while this tab is open in your browser.</p>
                </div>
                <button className={"toggle " + (settings.remindersOn ? "on" : "")} onClick={settings.remindersOn ? () => { const s = { ...settings, remindersOn: false }; setSettings(s); saveKey("settings", s); } : enableReminders}>
                  {settings.remindersOn ? <><Bell size={14} /> On</> : <><BellOff size={14} /> Off</>}
                </button>
              </div>
              {Object.entries(DEFAULT_TIMES).map(([b]) => {
                const blk = BLOCKS.find((x) => x.id === b);
                return (
                  <label className="trow" key={b}><span style={{ color: blk.tint }}>● </span><span className="tname">{blk.label}</span>
                    <input type="time" value={settings.times[b]} onChange={(e) => setTime(b, e.target.value)} /></label>
                );
              })}
              <div className="realnote">
                <b>For reminders that fire when the app is closed:</b> add these as repeating phone alarms or calendar events — that's the only reliable background nudge from a web app. Want them as a calendar file? Ask in chat and I'll generate one.
              </div>
            </section>
          )}
        </main>
      )}

      {toast && <div className="toast"><Bell size={14} /> {toast}</div>}
      {!hasStore && <div className="toast warn">Open inside Claude to save your logs.</div>}
    </div>
  );
}

/* ----------------------------- history view ----------------------------- */
function History({ index, streak, onPick }) {
  const days = [];
  const start = new Date(); start.setDate(start.getDate() - 41);
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(iso(d)); }
  const vals = days.map((d) => index[d] || 0);
  const avg = (() => { const last7 = vals.slice(-7); return Math.round(last7.reduce((a, b) => a + b, 0) / 7); })();
  return (
    <>
      <section className="card stats">
        <div className="stat"><b>{streak}</b><span>day streak</span></div>
        <div className="stat"><b>{avg}%</b><span>7-day avg</span></div>
        <div className="stat"><b>{Object.keys(index).length}</b><span>days logged</span></div>
      </section>
      <section className="card">
        <h3 className="hm-title">Last 6 weeks</h3>
        <div className="heat">
          {days.map((d) => { const v = index[d] || 0; return (
            <button key={d} className="hcell" onClick={() => onPick(d)} title={`${d} · ${v}%`}
              style={{ background: v === 0 ? "var(--track)" : `rgba(224,168,91,${0.18 + (v / 100) * 0.82})` }} />
          ); })}
        </div>
        <div className="hm-legend"><span>less</span><i style={{ background: "var(--track)" }} /><i style={{ background: "rgba(224,168,91,.35)" }} /><i style={{ background: "rgba(224,168,91,.65)" }} /><i style={{ background: "rgba(224,168,91,1)" }} /><span>more</span></div>
      </section>
    </>
  );
}

/* ----------------------------- helpers ----------------------------- */
function hours(s, w) { if (!s || !w) return "—"; const [sh, sm] = s.split(":").map(Number); const [wh, wm] = w.split(":").map(Number); let mins = (wh * 60 + wm) - (sh * 60 + sm); if (mins < 0) mins += 1440; return (mins / 60).toFixed(1); }
function energyColor(n) { return ["#D9655B", "#D9655B", "#E0A85B", "#C9C26F", "#8FBF6F", "#6FBF8C"][n] || "#8A93A3"; }

/* ----------------------------- styles ----------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap');
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
.wrap{--ink:#0E1116;--panel:#151A21;--panel2:#1A212B;--line:#252C38;--text:#E6E9EF;--muted:#8A93A3;--gold:#E0A85B;--red:#D9655B;--green:#6FBF8C;--track:#222934;
  max-width:460px;margin:0 auto;min-height:100vh;background:radial-gradient(120% 60% at 50% -10%,#16202b 0%,var(--ink) 55%);color:var(--text);
  font-family:'Inter',system-ui,sans-serif;padding:0 14px 40px;}
@media(prefers-reduced-motion:no-preference){.card{animation:rise .35s ease both}}
@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.loading{padding:60px;text-align:center;color:var(--muted);font-family:'JetBrains Mono',monospace}

.hd{display:flex;gap:14px;align-items:center;padding:18px 4px 14px}
.ring{width:74px;height:74px;border-radius:50%;flex:none;display:grid;place-items:center;transition:background .5s ease}
.ring-in{width:58px;height:58px;border-radius:50%;background:var(--ink);display:flex;align-items:baseline;justify-content:center;gap:1px}
.ring-pct{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:22px;line-height:1}
.ring-lbl{font-size:11px;color:var(--muted)}
.hd-mid{flex:1;min-width:0}
.datenav{display:flex;align-items:center;justify-content:space-between;gap:8px}
.datenav button{background:var(--panel);border:1px solid var(--line);color:var(--text);width:30px;height:30px;border-radius:9px;display:grid;place-items:center;cursor:pointer}
.dlabel{display:flex;flex-direction:column;align-items:center;line-height:1.15}
.dweek{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:16px}
.ddate{font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.hd-sub{display:flex;align-items:center;gap:10px;margin-top:8px;justify-content:center}
.todaybtn{background:transparent;border:1px solid var(--gold);color:var(--gold);font-size:11px;padding:2px 9px;border-radius:20px;cursor:pointer}
.count{font-size:12px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.savedot{font-size:10px;color:var(--gold);font-family:'JetBrains Mono',monospace;opacity:.9}
.savedot.ok{color:var(--muted);opacity:.5}

.tabs{display:flex;gap:6px;background:var(--panel);border:1px solid var(--line);padding:4px;border-radius:13px;margin-bottom:14px}
.tabs button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;background:transparent;border:0;color:var(--muted);font-family:inherit;font-weight:600;font-size:13px;padding:9px 0;border-radius:9px;cursor:pointer}
.tabs button.on{background:var(--panel2);color:var(--text);box-shadow:inset 0 0 0 1px var(--line)}

.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:14px;margin-bottom:12px}
.life .row2{display:flex;gap:8px;margin-bottom:12px}
.fld{flex:1;display:flex;flex-direction:column;gap:4px}
.fld span{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.fld input{background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--text);padding:8px;font-family:'JetBrains Mono',monospace;font-size:13px}
.fld.hrs{align-items:flex-start}
.fld.hrs b{font-family:'Space Grotesk',sans-serif;font-size:18px;padding:5px 2px}
.energy{display:flex;align-items:center;gap:12px;margin-bottom:12px}
.elab{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.edots{display:flex;gap:7px}
.edot{width:26px;height:26px;border-radius:50%;border:1.5px solid var(--line);background:var(--panel2);cursor:pointer;transition:transform .12s}
.edot:active{transform:scale(.88)}
.showed{display:flex;gap:7px;margin-bottom:10px}
.chip{font-family:inherit;cursor:pointer;border:1px solid var(--line);background:var(--panel2);color:var(--text);border-radius:10px}
.chip.yn{flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:9px 0;font-weight:600;font-size:13px}
.chip.yn.s1{background:rgba(111,191,140,.16);border-color:var(--green);color:var(--green)}
.chip.yn.s2{background:rgba(217,101,91,.14);border-color:var(--red);color:var(--red)}
.note{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:9px;color:var(--text);padding:9px;font-family:inherit;font-size:13px;margin-top:7px}
.note::placeholder{color:var(--muted)}

.blk{border-left:3px solid var(--tint)}
.blkhead{display:flex;align-items:center;gap:8px;margin-bottom:11px}
.blkicon{color:var(--tint);display:grid;place-items:center}
.blkname{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:15px}
.blktime{display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.blkdone{margin-left:auto;font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--tint)}
.chips{display:flex;flex-direction:column;gap:6px}
.chip.supp{display:flex;align-items:center;gap:9px;padding:9px 10px;text-align:left;transition:transform .1s,border-color .15s,background .15s}
.chip.supp:active{transform:scale(.985)}
.cmark{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--line);display:grid;place-items:center;flex:none;color:var(--ink)}
.chip.supp.yes{background:rgba(224,168,91,.12);border-color:rgba(224,168,91,.5)}
.chip.supp.yes .cmark{background:var(--gold);border-color:var(--gold)}
.chip.supp.no{background:rgba(217,101,91,.1);border-color:rgba(217,101,91,.4);opacity:.75}
.chip.supp.no .cmark{background:var(--red);border-color:var(--red)}
.cname{font-weight:600;font-size:14px;flex:1;display:flex;align-items:center;gap:6px}
.cnote{font-size:11px;color:var(--muted);font-family:'JetBrains Mono',monospace}
.fat{font-style:normal;font-size:9px;background:rgba(224,168,91,.18);color:var(--gold);padding:1px 5px;border-radius:5px;letter-spacing:.04em}
.chip.supp.core{box-shadow:inset 2px 0 0 var(--gold)}
.core.inline{color:var(--gold)}
.foot{font-size:12px;color:var(--muted);text-align:center;line-height:1.5;padding:4px 14px 0}

.stats{display:flex;justify-content:space-around;text-align:center}
.stat b{font-family:'Space Grotesk',sans-serif;font-size:26px;display:block}
.stat span{font-size:11px;color:var(--muted)}
.hm-title{font-family:'Space Grotesk',sans-serif;font-size:14px;margin:0 0 12px}
.heat{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.hcell{aspect-ratio:1;border-radius:5px;border:0;cursor:pointer}
.hm-legend{display:flex;align-items:center;gap:4px;justify-content:flex-end;margin-top:10px;font-size:10px;color:var(--muted)}
.hm-legend i{width:13px;height:13px;border-radius:3px}

.setrow{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.setup h3{font-family:'Space Grotesk',sans-serif;margin:0 0 4px;font-size:16px}
.dim{font-size:12px;color:var(--muted);margin:0;line-height:1.45}
.toggle{display:flex;align-items:center;gap:6px;background:var(--panel2);border:1px solid var(--line);color:var(--muted);font-family:inherit;font-weight:600;font-size:13px;padding:8px 14px;border-radius:20px;cursor:pointer;flex:none}
.toggle.on{background:rgba(224,168,91,.15);border-color:var(--gold);color:var(--gold)}
.trow{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--line)}
.tname{flex:1;font-weight:500}
.trow input{background:var(--panel2);border:1px solid var(--line);border-radius:8px;color:var(--text);padding:6px 8px;font-family:'JetBrains Mono',monospace}
.realnote{margin-top:14px;background:var(--panel2);border:1px solid var(--line);border-radius:11px;padding:11px;font-size:12px;color:var(--muted);line-height:1.55}
.realnote b{color:var(--text)}

.toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:var(--panel2);border:1px solid var(--gold);color:var(--text);padding:11px 16px;border-radius:12px;font-size:13px;display:flex;align-items:center;gap:8px;box-shadow:0 8px 30px rgba(0,0,0,.5);max-width:90%}
.toast.warn{border-color:var(--red);bottom:auto;top:14px}
`;
