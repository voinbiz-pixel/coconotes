(() => {
'use strict';
const cfg = window.MP_CONFIG || {};
const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY);
const sb = DEMO ? null : window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

const TYPES = [['task', 'To-do'], ['call', 'Call'], ['request', 'Request'], ['reminder', 'Reminder'], ['content', 'Content']];
const STAGES = [['idea','Idea'],['script','Script'],['shoot','Shoot'],['edit','Edit'],['review','Review'],['ready','Ready'],['posted','Posted']];
const PALETTE = [['Navy','#2B4C7E'],['Plum','#7A4A6B'],['Teal','#0F5C63'],['Forest','#2F5D3A'],['Brass','#7D6230'],['Cocoa','#6B4A2F'],['Violet','#5B4B8A'],['Slate','#4A545E']];
const state = {
  me: null, profiles: [], brands: [], items: [], activity: [], notes: [], noteFolder: 'all', notesMissing: false,
  view: 'today', who: 'me', showDone: {}, calOpen: false, calMonth: null, calDay: null, actScope: 'mine', search: '',
  sheet: null, authMode: 'signin', flash: null, counts: {}, segPos: {}, prevChips: new Set(), introPlayed: false, calToken: null
};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const REDUCED = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DESKTOP = () => matchMedia('(min-width: 900px)').matches;
const wait = ms => new Promise(r => setTimeout(r, ms));
const EASE = 'cubic-bezier(.22,1,.36,1)', SPRING = 'cubic-bezier(.3,1.25,.5,1)', EASE_IN = 'cubic-bezier(.4,0,.2,1)';
function anim(el, frames, opts) { if (!el || REDUCED() || !el.animate) return Promise.resolve(); return el.animate(frames, opts).finished.catch(() => {}); }
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2));
const nowISO = () => new Date().toISOString();
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

/* ---------- Dates and times ---------- */
const pad = n => String(n).padStart(2, '0');
const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => toISO(new Date());
const parts = iso => { const [y, m, d] = iso.split('-').map(Number); return [y, m - 1, d]; };
const addDays = (iso, n) => { const [y, m, d] = parts(iso); return toISO(new Date(y, m, d + n)); };
const diffDays = (from, to) => Math.round((Date.UTC(...parts(to)) - Date.UTC(...parts(from))) / 864e5);
const fmtDate = (iso, opts) => { const [y, m, d] = parts(iso); return new Date(y, m, d).toLocaleDateString('en-US', opts); };
const short = iso => fmtDate(iso, { month: 'short', day: 'numeric' });
const dayOf = ts => toISO(new Date(ts));
const clock = ts => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const atLocal = (iso, h, m = 0) => { const [y, mo, d] = parts(iso); return new Date(y, mo, d, h, m).toISOString(); };
const toLocalInput = ts => { const d = new Date(ts); return `${toISO(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
function rel(iso) {
  const n = diffDays(today(), iso);
  if (n < -1) return `${-n} days ago`; if (n === -1) return 'Yesterday'; if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow';
  if (n < 7) return fmtDate(iso, { weekday: 'long' }); return short(iso);
}
const relWhen = ts => `${rel(dayOf(ts))} ${clock(ts)}`.replace(/^Today /, '');
function relTime(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'Just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`; if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/* ---------- People and lookups ---------- */
const person = id => state.profiles.find(p => p.id === id);
const other = () => state.profiles.find(p => p.id !== state.me?.id) || { id: null, name: 'Your teammate', color: PALETTE[1][1] };
const firstName = p => (p?.name || p?.email || 'Someone').split(/[\s@]/)[0];
const nameOf = id => !id ? 'coconotes' : id === state.me?.id ? 'You' : firstName(person(id));
const otherName = () => firstName(other());
const colorOf = id => person(id)?.color || PALETTE[id === state.me?.id ? 0 : 1][1];
const initials = p => (p?.name || p?.email || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
const avatar = (id, size = 26) => `<span class="av" aria-hidden="true" style="width:${size}px;height:${size}px;font-size:${Math.round(size * .42)}px;background:${colorOf(id)}">${esc(initials(person(id)))}</span>`;
const owners = it => it.owner_ids || [];
const ownedByMe = it => owners(it).includes(state.me.id);
const ownedByOther = it => owners(it).includes(other().id);
const ownerKey = it => ownedByMe(it) && ownedByOther(it) ? 'both' : ownedByMe(it) ? 'me' : ownedByOther(it) ? 'other' : 'none';
const idsFor = key => key === 'both' ? [state.me.id, other().id].filter(Boolean) : key === 'other' ? [other().id].filter(Boolean) : [state.me.id];
const ownerStack = it => `<span class="stack">${owners(it).map(id => avatar(id, 22)).join('')}</span>`;
const brand = id => state.brands.find(a => a.id === id);
const itemById = id => state.items.find(i => i.id === id);
const stageName = s => (STAGES.find(x => x[0] === s) || ['', ''])[1];
const typeName = t => (TYPES.find(x => x[0] === t) || ['', 'To-do'])[1];
const isOpen = it => it.type === 'content' ? it.stage !== 'posted' : !it.done;
const whenDay = it => it.remind_at ? dayOf(it.remind_at) : it.due_date || (it.type === 'content' ? it.post_date : null);
const requestForMe = it => it.type === 'request' && isOpen(it) && ownedByMe(it) && it.created_by && it.created_by !== state.me.id;

/* ---------- Typed shorthand parser ---------- */
const WD = {sun:0,sunday:0,mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,weds:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6};
const MONTHS = 'january february march april may june july august september october november december'.split(' ');
const norm = s => s.toLowerCase().replace(/[^a-z0-9&]/g, '');
const BRAND_ALIASES = { 'greenwich & delancey': ['gd', 'g&d', 'greenwich', 'delancey'], 'chef david': ['david', 'chef'], 'madison and park': ['mp', 'm&p', 'madison', 'catering'] };
function matchBrand(q) {
  q = norm(q); if (!q) return null;
  const al = a => { const n = a.name.toLowerCase(); return [norm(n), ...(BRAND_ALIASES[n] || []), ...n.split(/\s+/).filter(w => w.length > 2).map(norm)]; };
  return state.brands.find(a => al(a).includes(q)) || state.brands.find(a => al(a).some(x => x.startsWith(q)));
}
function weekdayDate(wd, next) { const t = new Date(), day = t.getDay(); let d = (wd - day + 7) % 7; if (next) { const toSunday = (7 - day) % 7; if (d === 0 || d <= toSunday) d += 7; } return addDays(today(), d); }
function parseClause(text) {
  let s = ' ' + text.trim().replace(/[.!?]+$/, '') + ' ';
  const out = { type: 'task', title: '', owner: 'me', due_date: null, remind_at: null, contact_name: null, phone: null, brand: null, urgent: false };
  const on = otherName().toLowerCase(), low = () => s.toLowerCase();
  const take = re => { const m = s.match(re); if (m) s = s.replace(m[0], ' '); return m; };
  if (take(/\s(!+|urgent(ly)?|asap)(?=\s)/i)) out.urgent = true;
  s = s.replace(/^\s*((also|and|then|plus|oh|ok|okay|so|um|uh|alright|right)[,\s]+)+/i, ' ');
  take(/\s(and\s+)?(please|don'?t forget to|make sure to|can you)\s/i);
  const tag = take(/\s#(\S+)/); if (tag) out.brand = matchBrand(tag[1])?.id || null;
  const ph = take(/\s((?:at|on|number)\s+)?(\+?1?[\s.-]?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?=\s)/i); if (ph) out.phone = ph[2].trim();
  const re = (w) => new RegExp(`\\s(remind|ask|tell|have|get)\\s+${w}\\s+(to\\s+)?`, 'i');
  if (take(re(on))) { out.owner = 'other'; if (!/remind/i.test(text)) out.type = 'request'; }
  else if (take(new RegExp(`\\s@?${on}\\s+(needs|has|should)\\s+to\\s`, 'i')) || take(new RegExp(`\\s@${on}(?=\\s)`, 'i'))) { out.owner = 'other'; out.type = 'request'; }
  else if (take(/\s(remind\s+(us|both of us)|we\s+(need|have|should)\s+to|let'?s|@both|@us)\s+(to\s+)?/i)) out.owner = 'both';
  else take(/\s(remind\s+me\s+(to\s+)?|i\s+(need|have|should|gotta|got)\s+to\s|i'?ll\s|@me\s|todo:?\s)/i);
  const wantRemind = /\bremind/i.test(text);
  let date = null, time = null;
  let m;
  if ((m = take(/\s(today|tonight|this (morning|afternoon|evening))(?=\s)/i))) { date = today(); const w = m[1].toLowerCase(); if (w === 'tonight' || w === 'this evening') time = [20, 0]; else if (w === 'this afternoon') time = [16, 0]; else if (w === 'this morning') time = [10, 0]; }
  if ((m = s.match(/\s(in\s+(\d+|an?|half an)\s+(minutes?|mins?|hours?|hrs?))(?=\s)/i))) {
    s = s.replace(m[0], ' '); const n = /half/i.test(m[2]) ? 30 : /^an?$/i.test(m[2]) ? 1 : +m[2];
    const ms = /^h/i.test(m[3]) ? n * 3600e3 : n * 60e3; out.remind_at = new Date(Date.now() + (/half/i.test(m[2]) ? 30 * 60e3 : ms)).toISOString();
  }
  if ((m = s.match(/\s(tomorrow|tmrw|tmr)(?=\s)/i))) { s = s.replace(m[0], ' '); date = addDays(today(), 1); }
  if ((m = s.match(/\s(next\s+)?(on\s+)?(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(day|nesday|sday|urday)?(?=\s)/i))) { s = s.replace(m[0], ' '); date = weekdayDate(WD[(m[3] + (m[4] || '')).toLowerCase()] ?? WD[m[3].toLowerCase()], !!m[1]); }
  if ((m = s.match(/\s(next week)(?=\s)/i))) { s = s.replace(m[0], ' '); date = addDays(today(), 7); }
  if ((m = s.match(/\s(on\s+)?([a-z]{3,9})\s+(\d{1,2})(st|nd|rd|th)?(?=\s)/i)) && MONTHS.some(x => x.startsWith(m[2].toLowerCase()) && m[2].length >= 3)) {
    s = s.replace(m[0], ' '); const mo = MONTHS.findIndex(x => x.startsWith(m[2].toLowerCase())), t = new Date(); let d = new Date(t.getFullYear(), mo, +m[3]); if (toISO(d) < today()) d.setFullYear(t.getFullYear() + 1); date = toISO(d);
  }
  if ((m = s.match(/\s(\d{1,2})\/(\d{1,2})(?=\s)/))) { s = s.replace(m[0], ' '); const t = new Date(); let d = new Date(t.getFullYear(), +m[1] - 1, +m[2]); if (toISO(d) < today()) d.setFullYear(t.getFullYear() + 1); date = toISO(d); }
  if ((m = s.match(/\s(at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?=\s)/i)) || (m = s.match(/\s(at\s+)(\d{1,2})(?::(\d{2}))?()(?=\s)/i)) || (m = s.match(/\s(at\s+)(noon)()()(?=\s)/i))) {
    s = s.replace(m[0], ' ');
    if (m[2] === 'noon') time = [12, 0]; else { let h = +m[2]; const mi = +(m[3] || 0), ap = (m[4] || '').toLowerCase(); if (ap.startsWith('p') && h < 12) h += 12; if (ap.startsWith('a') && h === 12) h = 0; if (!ap && h < 8) h += 12; time = [h, mi]; }
  }
  s = s.replace(/(\s(by|on|for|before|at|to|and))+\s*$/i, ' ');
  if (!out.remind_at && time) { const d0 = date || today(); let r = atLocal(d0, time[0], time[1]); if (!date && new Date(r) < new Date()) r = atLocal(addDays(d0, 1), time[0], time[1]); out.remind_at = r; }
  else if (!out.remind_at && wantRemind && date) out.remind_at = atLocal(date, 9);
  else if (date) out.due_date = date;
  if ((m = s.match(/(?:^|\s)(call|phone|ring|dial|facetime)\s+(back\s+)?(?:with\s+)?(.+?)(?=\s+(about|re|regarding|to|for|and|on|at|by)\s|\s*$)/i))) {
    out.type = 'call'; out.contact_name = cap(m[3].trim().replace(/^(the|a|an)\s+/i, '').replace(/\s+back$/i, ''));
  } else if (/(?:^|\s)(call|phone|ring|dial|facetime)(?=\s|$)|\bgive\s+.+?\s+a\s+(call|ring)\b|\b(call|phone)\s+back\b/i.test(s)) out.type = 'call';
  if ((m = s.match(/\bgive\s+(.+?)\s+a\s+(call|ring)\b/i))) { out.type = 'call'; out.contact_name = out.contact_name || cap(m[1].trim()); }
  else if (out.type === 'task' && wantRemind && !s.trim()) out.type = 'reminder';
  out.title = cap(s.replace(/\s+/g, ' ').trim().replace(/^(to|and)\s+/i, ''));
  if (!out.title) out.title = out.type === 'call' && out.contact_name ? `Call ${out.contact_name}` : 'Reminder';
  if (out.type === 'task' && wantRemind && out.remind_at && out.owner !== 'other') out.type = out.title.split(' ').length <= 6 ? 'reminder' : 'task';
  return out;
}
function localParse(text) {
  const on = otherName().toLowerCase();
  const pieces = text.replace(/\n+/g, '. ').split(new RegExp(`(?:[.;!?]\\s+|,?\\s+(?:and\\s+(?:then\\s+|also\\s+)?|also\\s+|then\\s+)(?=(?:i\\b|i'|we\\b|remind\\b|call\\b|ask\\b|tell\\b|have\\b|${on}\\b|email\\b|text\\b|send\\b|book\\b|order\\b|pick\\b|don'?t\\b|make\\b)))`, 'i'));
  return pieces.map(p => p.trim()).filter(p => p.split(/\s+/).length >= 2 || p.length > 5).map(parseClause);
}

/* ---------- Demo data ---------- */
function seedDemo() {
  const t = today(), ago = h => new Date(Date.now() - h * 3600e3).toISOString(), later = h => new Date(Date.now() + h * 3600e3).toISOString();
  state.me = { id: 'me', name: 'Nikita', email: 'nikita@company.com', color: '#2B4C7E' };
  state.profiles = [state.me, { id: 'mk', name: 'Masha', email: 'masha@company.com', color: '#7A4A6B' }];
  state.brands = [['LOX', '#0F5C63'], ['Greenwich & Delancey', '#7D6230'], ['Chef David', '#6B4A2F'], ['Madison and Park', '#2F5D3A']].map(([name, color], i) => ({ id: 'b' + i, name, color, sort: i }));
  const B = n => state.brands.find(a => a.name === n).id;
  const mk = (type, title, o = {}) => ({ id: uid(), type, title, brand_id: null, done: false, status: o.done ? 'done' : 'todo', nag: false, nag_count: 0, last_fired_at: null, urgent: false, owner_ids: ['me'], due_date: null, remind_at: null, reminded: false, contact_name: null, phone: null, notes: '', links: [], stage: null, post_date: null, created_by: 'me', created_at: ago(30), updated_at: ago(2), completed_at: null, ...o });
  const h = new Date().getHours(), at = (hr, mi = 0) => atLocal(t, hr, mi);
  const note = (body, o = {}) => ({ id: uid(), body, brand_id: null, created_by: 'me', created_at: ago(30), updated_at: ago(2), ...o });
  state.notes = [
    note('Supper club opening night\nJazz trio, low light, 1920s cocktail list. Ask David about a three-course prix fixe.', { brand_id: B('Greenwich & Delancey'), created_by: 'mk', updated_at: ago(1) }),
    note('LOX reel ideas\nSlicing close-ups at 120 fps. Bagel steam in morning light. A "how we cure it" series.', { brand_id: B('LOX'), updated_at: ago(5) }),
    note('Ask Imperial for a matte black napkin sample', { updated_at: ago(26) }),
    note('Babka launch\nPre-order page live a week before. Gift box with ribbon in the brand color.', { brand_id: B('Madison and Park'), created_by: 'mk', updated_at: ago(50) })];
  state.items = [
    mk('request', 'Approve the tea reel music', { id: 'r1', brand_id: B('LOX'), created_by: 'mk', owner_ids: ['me'], due_date: t, notes: 'Two options in the Drive folder.' }),
    mk('request', 'Send the supper club mood photos', { id: 'r2', brand_id: B('Greenwich & Delancey'), created_by: 'mk', owner_ids: ['me'], due_date: addDays(t, 1) }),
    mk('call', 'Harney rep about tea samples', { id: 'c1', contact_name: 'Harney rep', phone: '(800) 555-0144', brand_id: B('LOX'), owner_ids: ['me'], remind_at: h < 14 ? at(14) : later(2) }),
    mk('call', 'Imperial about napkin proof', { id: 'c2', contact_name: 'Imperial', phone: '(212) 555-0187', owner_ids: ['mk'], remind_at: h < 11 ? at(11, 30) : later(1) }),
    mk('call', 'Call back the photographer', { id: 'c3', contact_name: 'Photographer', owner_ids: ['me', 'mk'], due_date: addDays(t, 1) }),
    mk('reminder', 'Check in with Masha about the shoot', { id: 'm1', owner_ids: ['me'], due_date: t, nag: true, remind_at: new Date(Date.now() + 50e3).toISOString() }),
    mk('reminder', 'Post the babka story', { id: 'm2', brand_id: B('LOX'), owner_ids: ['mk'], remind_at: h < 17 ? at(17) : later(3) }),
    mk('task', 'Send David the rough cut', { brand_id: B('Chef David'), owner_ids: ['me'], due_date: addDays(t, 1), urgent: true }),
    mk('task', 'Book studio for Thursday', { owner_ids: ['me'], due_date: addDays(t, 2) }),
    mk('call', 'Call David about the tasting menu', { contact_name: 'David', brand_id: B('Chef David'), owner_ids: ['me', 'mk'], due_date: t }),
    mk('task', 'Edit the tea reel captions', { owner_ids: ['me'], status: 'doing', due_date: t, brand_id: B('LOX') }),
    mk('task', 'Supper club menu cards', { owner_ids: ['mk'], status: 'doing', due_date: addDays(t, 2), brand_id: B('Greenwich & Delancey') }),
    mk('task', 'Order new ring light', { owner_ids: ['mk'], due_date: addDays(t, -1) }),
    mk('task', 'Draft holiday menu captions', { brand_id: B('Madison and Park'), owner_ids: ['mk'], due_date: addDays(t, 3) }),
    mk('task', 'Pick bag sizes with Imperial', { owner_ids: ['me', 'mk'], due_date: addDays(t, 4) }),
    mk('request', 'Find three 1920s font options', { brand_id: B('Greenwich & Delancey'), created_by: 'me', owner_ids: ['mk'], due_date: addDays(t, 2) }),
    mk('content', 'Tea blend reveal reel', { brand_id: B('LOX'), stage: 'edit', owner_ids: ['mk'], post_date: addDays(t, 3) }),
    mk('task', 'Confirm Friday load-in', { owner_ids: ['me'], done: true, completed_at: ago(3) })];
  const act = o => ({ id: uid(), read: false, body: '', created_at: ago(1), ...o });
  state.activity = [
    act({ item_id: 'r1', actor_id: 'mk', to_id: 'me', kind: 'request', body: 'Need this before 3 if possible.', created_at: ago(0.5) }),
    act({ item_id: 'r2', actor_id: 'mk', to_id: 'me', kind: 'request', body: '', created_at: ago(4) }),
    act({ item_id: 'r1', actor_id: 'mk', to_id: 'me', kind: 'comment', body: 'Option B feels warmer to me, but your call.', created_at: ago(0.2) }),
    act({ item_id: 'c1', actor_id: 'me', to_id: 'mk', kind: 'comment', body: 'They said samples ship Monday.', created_at: ago(5), read: true }),
    act({ item_id: 'c2', actor_id: 'mk', to_id: 'me', kind: 'call_log', body: 'Left a voicemail. Trying again before lunch.', created_at: ago(20), read: true })];
}

/* ---------- Data layer ---------- */
async function run(q) { if (DEMO) return true; const { error } = await q; if (error) { fail(error); return false; } return true; }
const api = {
  async loadAll() {
    if (DEMO) return;
    const r = await Promise.all([sb.from('profiles').select('*').order('created_at'), sb.from('brands').select('*').order('sort'), sb.from('items').select('*').order('created_at'),
      sb.from('activity').select('*').order('created_at', { ascending: false }).limit(300)]);
    for (const x of r) if (x.error) throw x.error;
    [state.profiles, state.brands, state.items, state.activity] = r.map(x => x.data);
    const nr = await sb.from('notes').select('*').order('updated_at', { ascending: false });
    state.notesMissing = !!nr.error; state.notes = nr.error ? [] : nr.data;
    state.me = state.profiles.find(x => x.id === state.me.id) || state.me;
  },
  async addItem(row) {
    const it = { id: uid(), type: 'task', title: '', brand_id: null, done: false, status: 'todo', nag: false, nag_count: 0, last_fired_at: null, urgent: false, owner_ids: [state.me.id], due_date: null, remind_at: null, reminded: false, contact_name: null, phone: null, notes: '', links: [], stage: null, post_date: null, created_by: state.me.id, created_at: nowISO(), updated_at: nowISO(), completed_at: null, ...row };
    if (it.type === 'content') it.stage = it.stage || 'idea';
    state.items.push(it); return (await run(sb?.from('items').insert(it))) ? it : null;
  },
  async updateItem(id, patch) {
    const it = itemById(id); if (!it) return;
    patch.updated_at = nowISO();
    if ('status' in patch && !('done' in patch)) patch.done = patch.status === 'done';
    if ('done' in patch && !('status' in patch)) patch.status = patch.done ? 'done' : (it.status === 'doing' ? 'doing' : 'todo');
    if ('done' in patch) patch.completed_at = patch.done ? nowISO() : null;
    if ('stage' in patch) patch.completed_at = patch.stage === 'posted' ? nowISO() : null;
    if ('remind_at' in patch) { patch.reminded = false; patch.nag_count = 0; }
    Object.assign(it, patch); return run(sb?.from('items').update(patch).eq('id', id));
  },
  async deleteItem(id) { state.items = state.items.filter(x => x.id !== id); state.activity = state.activity.filter(a => a.item_id !== id); return run(sb?.from('items').delete().eq('id', id)); },
  async log(item_id, kind, body = '', to = other().id) {
    if (!to) return;
    const a = { id: uid(), item_id, actor_id: state.me.id, to_id: to, kind, body, read: to === state.me.id, created_at: nowISO() };
    state.activity.unshift(a); return run(sb?.from('activity').insert(a));
  },
  async addNote(row) { const n = { id: uid(), body: '', brand_id: null, created_by: state.me.id, created_at: nowISO(), updated_at: nowISO(), ...row }; state.notes.unshift(n); return (await run(sb?.from('notes').insert(n))) ? n : null; },
  async updateNote(id, patch) { const n = noteById(id); if (!n) return; patch.updated_at = nowISO(); Object.assign(n, patch); return run(sb?.from('notes').update(patch).eq('id', id)); },
  async deleteNote(id) { state.notes = state.notes.filter(x => x.id !== id); return run(sb?.from('notes').delete().eq('id', id)); },
  async markRead(ids) { if (!ids.length) return; state.activity.forEach(a => { if (ids.includes(a.id)) a.read = true; }); updateBadge(); return run(sb?.from('activity').update({ read: true }).in('id', ids)); },
  async updateProfile(patch) { Object.assign(state.me, patch); const p = person(state.me.id); if (p && p !== state.me) Object.assign(p, patch); return run(sb?.from('profiles').update(patch).eq('id', state.me.id)); },
  async addBrand(name) { const a = { id: uid(), name, color: PALETTE[(state.brands.length + 2) % PALETTE.length][1], sort: state.brands.length }; state.brands.push(a); return (await run(sb?.from('brands').insert(a))) ? a : null; },
  async updateBrand(id, patch) { const a = brand(id); if (!a) return; Object.assign(a, patch); return run(sb?.from('brands').update(patch).eq('id', id)); },
  async calToken(reset) {
    if (reset) { const d = await sb.from('calendar_tokens').delete().eq('profile_id', state.me.id); if (d.error) throw d.error; }
    let { data, error } = await sb.from('calendar_tokens').select('token').eq('profile_id', state.me.id).maybeSingle();
    if (error) throw error;
    if (!data) { const r = await sb.from('calendar_tokens').insert({ profile_id: state.me.id }).select('token').single(); if (r.error) throw r.error; data = r.data; }
    return data.token;
  }
};
function fail(err) { console.error(err); toast("That change didn't save. Check your connection, then try again."); if (!DEMO) api.loadAll().then(refresh).catch(() => {}); }

/* ---------- Selections ---------- */
const urgency = it => requestForMe(it) ? 0 : (whenDay(it) && whenDay(it) < today() && isOpen(it)) ? 1 : it.urgent ? 2 : 3;
const bySoonest = (a, b) => (urgency(a) - urgency(b)) || ((a.remind_at || (a.due_date ? a.due_date + 'T23' : '9999')).localeCompare(b.remind_at || (b.due_date ? b.due_date + 'T23' : '9999'))) || a.created_at.localeCompare(b.created_at);
const sel = {
  inbox: () => state.activity.filter(a => a.to_id === state.me.id),
  unread: () => state.activity.filter(a => a.to_id === state.me.id && !a.read),
  actionable: () => state.activity.filter(a => a.to_id === state.me.id && !a.read && ['request', 'handoff', 'created', 'comment', 'reminder'].includes(a.kind)),
};
function updateBadge() {
  const n = sel.actionable().length;
  $$('.badge').forEach(b => { b.textContent = n; b.hidden = !n; });
  const due = state.items.filter(it => it.type !== 'content' && isOpen(it) && ownedByMe(it) && (it.remind_at ? dayOf(it.remind_at) : it.due_date) && (it.remind_at ? dayOf(it.remind_at) : it.due_date) <= today()).length;
  try { if (navigator.setAppBadge) due ? navigator.setAppBadge(due) : navigator.clearAppBadge(); } catch {}
}

/* ---------- Brand mark ---------- */
const MARK = (size = 28, cls = '') => `<svg class="mark ${cls}" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round"><path class="arc-o" d="M76.01 26.58A35 35 0 1 0 76.01 73.42"/><path class="arc-i" d="M63.38 37.96A18 18 0 1 0 63.38 62.04"/></g><circle class="arc-d" cx="50" cy="50" r="6" fill="currentColor"/></svg>`;

/* ---------- Icons ---------- */
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  today: svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="1.6"/>'),
  upcoming: svg('<rect x="3.5" y="4.5" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M8 2.5v4M16 2.5v4M8 14h2M14 14h2M8 17.5h2"/>'),
  all: svg('<path d="M4 6.5h16M4 12h16M4 17.5h10"/>'),
  activity: svg('<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  call: svg('<path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5A16.5 16.5 0 0 1 3.5 5.6 1.5 1.5 0 0 1 5 4z"/>'),
  task: svg('<circle cx="12" cy="12" r="8"/><path d="M8.5 12.2l2.4 2.4 4.6-4.8"/>'),
  request: svg('<path d="M4 12h12M12 7l5 5-5 5"/><path d="M20 5v14"/>'),
  reminder: svg('<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4.5 5.5 7 3.5M19.5 5.5 17 3.5"/>'),
  content: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>'),
  mic: svg('<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>'),
  send: svg('<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5 20 4"/>'),
  notes: svg('<rect x="4.5" y="3.5" width="15" height="17" rx="3"/><path d="M8 8.5h8M8 12h8M8 15.5h5"/>'),
  flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  chat: svg('<path d="M4.5 5.5h15a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V17.5h-1A1.5 1.5 0 0 1 3 16V7a1.5 1.5 0 0 1 1.5-1.5z"/>'),
  snooze: svg('<path d="M4 9h5l-5 6h5"/><path d="M13 5h4l-4 5h4"/><path d="M12 14.5a6.5 6.5 0 1 0 6.3 4.9"/>'),
  dots: svg('<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  play: svg('<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5v5l4.5-2.5z"/>'),
  folder: svg('<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2.5h6.5A2.5 2.5 0 0 1 21 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z"/>'),
  left: svg('<path d="M15 5l-7 7 7 7"/>'), right: svg('<path d="M9 5l7 7-7 7"/>'), x: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  note: svg('<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8.5 12h7M8.5 16h5"/>')
};
ICON.calendar = ICON.upcoming;
const VIEWS = [['today', 'Today'], ['upcoming', 'Upcoming'], ['all', 'All'], ['notes', 'Notes']];

/* ---------- Helpers for the list ---------- */
const fromOther = it => false; // duo app: every task belongs to both of you
const unreadFor = it => state.activity.some(a => a.item_id === it.id && a.to_id === state.me.id && !a.read);
const matchWho = it => true;
const visible = it => it.type !== 'content';
const lastMsg = it => state.activity.filter(a => a.item_id === it.id && a.kind === 'comment').reduce((m, a) => !m || a.created_at > m.created_at ? a : m, null);
const unreadMsg = it => state.activity.some(a => a.item_id === it.id && a.kind === 'comment' && a.to_id === state.me.id && !a.read);
const doing = it => isOpen(it) && it.status === 'doing';
const missed = it => isOpen(it) && it.remind_at && new Date(it.remind_at) < new Date();
const isCall = it => it.type === 'call' || !!it.phone;
const SMART = [
  ['calls', 'Calls', 'call', it => isCall(it)],
  ['doing', 'In progress', 'half', it => doing(it)],
  ['urgent', 'Urgent', 'flag', it => it.urgent],
  ['undated', 'No date', 'all', it => !dateOf(it)],
  ['msgs', 'New messages', 'chat', it => unreadMsg(it)]];
const smartLabel = k => SMART.find(x => x[0] === k)?.[1].replace('{o}', otherName()) || brand(k)?.name || k;
const smartTest = k => SMART.find(x => x[0] === k)?.[3] || (it => it.brand_id === k);
function snoozeStops() {
  const now = Date.now(), d = new Date(), t = today(), out = [];
  const push = (label, ts) => { if (new Date(ts).getTime() > (out.length ? new Date(out[out.length - 1][1]).getTime() : now) + 5 * 60e3) out.push([label, ts]); };
  [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [180, '3 hours']].forEach(([m, l]) => push(l, new Date(now + m * 60e3).toISOString()));
  if (d.getHours() < 17) push('This evening', atLocal(t, 18)); else if (d.getHours() < 20) push('Tonight', atLocal(t, 21));
  push('Tomorrow morning', atLocal(addDays(t, 1), 9));
  push('Tomorrow afternoon', atLocal(addDays(t, 1), 14));
  const dow = d.getDay(), toMon = ((8 - dow) % 7) || 7; push('Next week', atLocal(addDays(t, toMon), 9));
  return out;
}
const untilText = ts => { const d = dayOf(ts); return d === today() ? clock(ts) : `${rel(d)}, ${clock(ts)}`; };
const atText = ts => { const d = dayOf(ts), r = rel(d); return d === today() ? `at ${clock(ts)}` : `${/^(Tomorrow|Yesterday)$/.test(r) ? r.toLowerCase() : r} at ${clock(ts)}`; };
function snoozeSlider() {
  const stops = state.snoozeStops = snoozeStops(), i = Math.min(2, stops.length - 1), pct = stops.length > 1 ? i / (stops.length - 1) * 100 : 0;
  return `<div class="slider-card snooze-card">
    <div class="sl-head"><span class="sl-lbl">Snooze</span><span class="sl-val" id="sn-val">${esc(stops[i][0])}</span></div>
    <div class="sl-wrap"><input type="range" class="range" id="sn-range" min="0" max="${stops.length - 1}" step="1" value="${i}" style="--p:${pct}%" aria-label="Snooze for" aria-valuetext="${esc(stops[i][0])}, until ${esc(untilText(stops[i][1]))}">
      <div class="ticks" aria-hidden="true">${stops.map((_, k) => `<i style="--x:${stops.length > 1 ? k / (stops.length - 1) : 0}"></i>`).join('')}</div></div>
    <div class="sl-ends" aria-hidden="true"><span>15 min</span><span>${esc(stops[stops.length - 1][0])}</span></div>
    <button class="btn solid wide" data-snooze-go="1" id="sn-go">Snooze until ${esc(untilText(stops[i][1]))}</button></div>`;
}
function onSnoozeInput(el) {
  const st = state.snoozeStops?.[+el.value]; if (!st) return;
  el.style.setProperty('--p', `${(+el.value / (+el.max || 1)) * 100}%`);
  $('#sn-val').textContent = st[0]; $('#sn-go').textContent = `Snooze until ${untilText(st[1])}`;
  el.setAttribute('aria-valuetext', `${st[0]}, until ${untilText(st[1])}`);
  if (navigator.vibrate) navigator.vibrate(4);
}
/* ---------- time of day as a slider ---------- */
const TMIN = 6 * 60, TMAX = 23 * 60;
const minsTo = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const minsLabel = m => clock(new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toISOString());
function timeSlider(time) {
  const m = Math.min(TMAX, Math.max(TMIN, time ? +time.slice(0, 2) * 60 + +time.slice(3, 5) : 9 * 60)), pct = (m - TMIN) / (TMAX - TMIN) * 100;
  const marks = [[540, 'Morning'], [720, 'Noon'], [900, 'Afternoon'], [1080, 'Evening']];
  return `<div class="sl-wrap"><input type="range" class="range" id="tm-range" min="${TMIN}" max="${TMAX}" step="15" value="${m}" style="--p:${pct}%" aria-labelledby="tm-l" aria-valuetext="${esc(minsLabel(m))}">
</div>
    <div class="sl-ends" aria-hidden="true"><span>${esc(minsLabel(TMIN))}</span><span>${esc(minsLabel(TMAX))}</span></div>
    <div class="tm-quick">${marks.map(([v, l]) => `<button type="button" class="chip" data-tmjump="${v}" aria-pressed="${m === v}" aria-label="${l}, ${esc(minsLabel(v))}">${l}</button>`).join('')}</div>`;
}
function onTimeInput(el) {
  const m = +el.value; el.style.setProperty('--p', `${(m - TMIN) / (TMAX - TMIN) * 100}%`);
  const lbl = minsLabel(m); el.setAttribute('aria-valuetext', lbl); const v = $('#tm-val'); if (v) v.textContent = lbl;
  if (navigator.vibrate && m % 60 === 0) navigator.vibrate(4);
}
const dateOf = x => x.remind_at ? dayOf(x.remind_at) : x.due_date || null;
const timeOf = x => { if (!x.remind_at) return null; const d = new Date(x.remind_at); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const whenFrom = (date, time) => ({ due_date: date || null, remind_at: date && time ? new Date(`${date}T${time}`).toISOString() : null });
const typeFor = (x) => (x.phone || x.type === 'call') ? 'call' : (x.type === 'reminder' ? 'reminder' : 'task');
function whenLabel(it, inToday, inDay) {
  const d = dateOf(it); if (!d) return '';
  if (missed(it) && d === today()) return `Missed ${clock(it.remind_at)}`;
  if (inDay) return it.remind_at ? clock(it.remind_at) : '';
  if (it.remind_at) return d === today() ? clock(it.remind_at) : `${rel(d)}, ${clock(it.remind_at)}`;
  return inToday && d === today() ? '' : rel(d);
}
const byWhen = (a, b) => (dateOf(a) || '9999').localeCompare(dateOf(b) || '9999') || (a.remind_at ? 0 : 1) - (b.remind_at ? 0 : 1) || (a.remind_at || '').localeCompare(b.remind_at || '') || (b.urgent - a.urgent) || a.created_at.localeCompare(b.created_at);
const openFor = () => state.items.filter(it => visible(it) && isOpen(it) && matchWho(it) && (!state.smart || smartTest(state.smart)(it)));
const doneFor = () => state.items.filter(it => visible(it) && !isOpen(it) && matchWho(it)).sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));

/* ---------- Row ---------- */
function row(it, opts = {}) {
  const done = !isOpen(it), d = dateOf(it), late = !done && ((d && d < today()) || (missed(it) && d === today())), b = brand(it.brand_id);
  const tags = [], showBig = (opts.inToday || opts.inDay) && it.remind_at && !it.phone && !done && dateOf(it) >= today() && !missed(it);
  const w = showBig ? '' : whenLabel(it, opts.inToday, opts.inDay);
  if (doing(it) && !opts.inDoing) tags.push('<span class="st-doing">In progress</span>');
  if (w) tags.push(`<span class="${late ? 'red' : ''}">${esc(w)}</span>`);
  if (isCall(it) && !it.phone) tags.unshift(`<span class="calltag">${ICON.call}Call</span>`);
  if (b) tags.push(`<span class="acct"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</span>`);
  const notes = (it.notes || '').split('\n')[0].trim();
  const bt = showBig ? bigTime(it.remind_at) : null;
  const acc = it.phone && !done ? `<a class="dial sm" href="${esc(telHref(it.phone))}" aria-label="Call ${esc(it.contact_name || it.phone)}">${ICON.call}</a>` : bt ? `<span class="rtime" aria-label="at ${esc(clock(it.remind_at))}"><b>${esc(bt[0])}</b><small>${esc(bt[1])}</small></span>` : '';
  return `<div class="row-wrap" data-rowwrap="${it.id}"><div class="row-actions" aria-hidden="true"><button class="ra ra-flag" data-rurgent="${it.id}" tabindex="-1">${ICON.flag}<span>${it.urgent ? 'Not urgent' : 'Urgent'}</span></button><button class="ra ra-del" data-rdelete="${it.id}" tabindex="-1">${ICON.trash}<span>Delete</span></button></div>
    <div class="row${done ? ' is-done' : ''}${state.flash === it.id ? ' enter' : ''}" data-swipe="${it.id}">
    <button class="check${it.urgent && !done ? ' urgent' : ''}${done ? ' done' : ''}${doing(it) ? ' doing' : ''}" data-toggle="${it.id}" aria-label="${done ? 'Mark not done' : 'Complete'}: ${esc(it.title)}${doing(it) ? ', in progress' : ''}"></button>
    <button class="row-main" data-open="${it.id}"><span class="row-title">${it.urgent && !done ? '<span class="bang" aria-label="Urgent">!</span>' : ''}<span class="tt">${esc(it.title)}</span></span>
      ${notes ? `<span class="row-notes">${esc(notes)}</span>` : ''}${tags.length ? `<span class="row-meta">${tags.join('')}</span>` : ''}${msgLine(it)}</button>${acc}</div></div>`;
}
function msgLine(it) {
  const m = lastMsg(it); if (!m) return '';
  const unread = unreadMsg(it);
  return `<span class="row-msg${unread ? ' new' : ''}" style="--pc:${colorOf(m.actor_id)}"><span class="rm-ic">${ICON.chat}</span><b>${esc(m.actor_id === state.me.id ? 'You' : nameOf(m.actor_id))}</b><span class="rm-t">${esc(m.body)}</span>${unread ? '<span class="sr-only">, unread</span>' : ''}</span>`;
}
const section = (title, list, opts = {}) => list.length ? `<section class="sec${opts.inDay ? ' day' : ''}${opts.id && state.calDay === opts.id.slice(4) ? ' sel' : ''}"${opts.id ? ` id="${opts.id}"` : ''} data-k="s-${opts.id || title}"><h2 class="sec-h${opts.red ? ' red' : ''}"><span class="sec-t">${title}</span><span class="sec-n">${list.length}</span>${opts.action ? `<button class="gh-act" data-${opts.action[0]}="1">${esc(opts.action[1])}</button>` : ''}</h2><div class="group lst">${list.map(it => row(it, opts)).join('')}</div></section>` : '';
function actions() {
  return `<div class="page-actions"><button class="iconbtn" data-view="search" aria-label="Search">${ICON.search}</button>
    <button class="iconbtn bellbtn" data-activity="1" aria-label="Activity">${ICON.activity}<span class="badge" hidden></span></button>
    <button class="avatar-btn" data-settings="1" aria-label="Your settings">${avatar(state.me.id, 32)}</button></div>`;
}
const pageHead = (title, count = '', label = '') => `<header class="ph"><div class="ph-top"><span class="ph-label">${label}</span>${actions()}</div>
  <div class="ph-row"><h1 class="ph-title">${title}</h1>${count !== '' ? `<span class="bignum ph-count" data-count="${count}" aria-label="${count} open">${count}</span>` : ''}</div></header>`;
const bigTime = ts => { const c = clock(ts), m = c.match(/^(.*?)\s*(AM|PM)$/i); return m ? [m[1], m[2]] : [c, '']; };
function progressDots(done, total) {
  const n = Math.max(1, Math.min(total, 10)), on = total ? Math.round(done / total * n) : 0;
  return `<span class="pdots" style="--n:${n}" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span>`;
}
function whoSeg() { return ''; }
function doneBlock(list, key) {
  if (!list.length) return '';
  const showing = !!state.showDone[key];
  return `<div class="done-bar"><span>${list.length} completed</span><button class="linkbtn" data-showdone="${key}">${showing ? 'Hide' : 'Show'}</button></div>
    ${showing ? `<section class="group lst">${list.slice(0, 40).map(it => row(it)).join('')}</section>` : ''}`;
}

/* ---------- Views ---------- */
function greeting() { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; }
function renderToday() {
  const now = new Date(), t = today(), all = openFor(), prog = all.filter(doing).sort(byWhen), list = all.filter(it => !doing(it) && dateOf(it) && dateOf(it) <= t);
  const over = list.filter(it => dateOf(it) < t).sort(byWhen), tod = list.filter(it => dateOf(it) === t).sort(byWhen);
  const doneToday = doneFor().filter(it => it.completed_at && dayOf(it.completed_at) === t);
  const left = over.length + tod.length + prog.filter(it => !dateOf(it) || dateOf(it) <= t).length, who = '';
  const sub = left ? `${left} left today${who}` : doneToday.length ? 'All done for today' : `Nothing due today${who}`;
  const total = left + doneToday.length;
  return `<header class="ph ph-today"><div class="ph-top"><span class="ph-label">Today</span>${actions()}</div>
    <div class="date-row"><span class="date-num" aria-hidden="true">${now.getDate()}</span><span class="date-side"><b>${esc(now.toLocaleDateString('en-US', { weekday: 'long' }))}</b><span>${esc(now.toLocaleDateString('en-US', { month: 'long' }))}</span></span>
    <h1 class="sr-only">Today, ${esc(now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }))}</h1></div></header>
    <section class="hero" aria-label="${left} left today, ${doneToday.length} done">
      <div class="hero-top"><span class="mono">${esc(greeting())}, ${esc(firstName(state.me))}</span><span>${total ? `${doneToday.length} of ${total} done` : 'Clear day'}</span></div>
      <div class="hero-bot"><span class="hero-big"><span class="bignum" data-count="${left}">${left}</span><span class="hero-unit">${left === 0 && doneToday.length ? 'all done' : 'left'}</span></span>${progressDots(doneToday.length, total)}</div>
    </section>
    ${section('In progress', prog, { inDoing: true, inToday: true }) + section('Overdue', over, { red: true, action: ['movetoday', `Move ${over.length} to today`] }) + section('Today', tod, { inToday: true }) || `<div class="empty-big">${MARK(56)}<p><b>${doneToday.length ? 'All done for today.' : 'Nothing due today.'}</b><br>Type one in the bar below.</p></div>`}
    ${doneBlock(doneToday, 'today')}`;
}
function dayHeader(d) { const n = diffDays(today(), d); const main = n === 1 ? 'Tomorrow' : fmtDate(d, { weekday: 'long' });
  const sub = n === 1 ? fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' }) : fmtDate(d, { month: 'short', day: 'numeric' });
  return `<span class="day-main">${esc(main)}</span><span class="sec-date">${esc(sub)}</span>`; }
function calendarBlock() {
  const t = today(), items = state.items.filter(it => visible(it) && isOpen(it) && matchWho(it) && dateOf(it));
  const byDay = {}; items.forEach(it => { const d = dateOf(it) < t ? t : dateOf(it); (byDay[d] = byDay[d] || []).push(it); });
  const dots = d => '';
  const cell = (d, cls = '') => `<button class="cd${d === t ? ' is-today' : ''}${d === state.calDay ? ' is-sel' : ''}${d < t ? ' past' : ''}${(byDay[d] || []).length ? ' has' : ''} ${cls}" data-calday="${d}" aria-label="${esc(fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }))}, ${(byDay[d] || []).length} reminders">
    <span class="cd-n">${+d.slice(8)}</span><span class="cd-dots">${dots(d)}</span></button>`;
  if (!state.calOpen) {
    const start = addDays(t, -((new Date().getDay() + 6) % 7)), week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return `<div class="cal-card"><div class="cal-top"><span class="cal-m">${esc(fmtDate(t, { month: 'long' }))}</span><button class="cal-tog" data-calopen="1" aria-expanded="false">Month${ICON.right}</button></div>
      <div class="cal-grid wd">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grid">${week.map(d => cell(d)).join('')}</div></div>`;
  }
  const m = state.calMonth || t.slice(0, 7), [y, mo] = m.split('-').map(Number), first = new Date(y, mo - 1, 1), off = (first.getDay() + 6) % 7, n = new Date(y, mo, 0).getDate();
  const cells = Array.from({ length: off }, () => '<span></span>').concat(Array.from({ length: n }, (_, i) => cell(`${m}-${pad(i + 1)}`)));
  return `<div class="cal-card open" id="cal"><div class="cal-top"><button class="iconbtn sm" data-calmove="-1" aria-label="Previous month">${ICON.left}</button><span class="cal-m">${esc(first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))}</span><button class="iconbtn sm" data-calmove="1" aria-label="Next month">${ICON.right}</button>
      <button class="cal-tog" data-calopen="0" aria-expanded="true">Week</button></div>
    <div class="cal-grid wd">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span>${x}</span>`).join('')}</div><div class="cal-grid cal-days">${cells.join('')}</div></div>`;
}
function renderUpcoming() {
  const t = today(), list = openFor().filter(it => dateOf(it) && dateOf(it) > t).sort(byWhen);
  const days = [...new Set(list.map(dateOf))];
  const sd = state.calDay, sdEmpty = sd && sd > t && !days.includes(sd);
  return `${pageHead('Upcoming', list.length, 'Scheduled')}${calendarBlock()}
    ${sdEmpty ? `<div class="day-empty"><span>Nothing on ${esc(fmtDate(sd, { weekday: 'long', month: 'short', day: 'numeric' }))}.</span><button class="chip" data-newon="${sd}">${ICON.plus}Add one</button></div>` : ''}
    ${days.map(d => section(dayHeader(d), list.filter(it => dateOf(it) === d), { inDay: true, id: `day-${d}` })).join('') || '<div class="empty-big"><p><b>Nothing scheduled.</b><br>Anything with a future date shows up here.</p></div>'}`;
}
function renderAll() {
  const t = today(), list = openFor(), prog = list.filter(doing).sort(byWhen), rest = list.filter(it => !doing(it));
  const dated = rest.filter(it => dateOf(it)).sort(byWhen), none = rest.filter(it => !dateOf(it)).sort((a, b) => (b.urgent - a.urgent) || a.created_at.localeCompare(b.created_at));
  const over = dated.filter(it => dateOf(it) < t);
  const done = doneFor().filter(it => !state.smart || smartTest(state.smart)(it));
  return `${pageHead(state.smart ? `<button class="backbtn" data-smart="" aria-label="Back to All">${ICON.left}</button>${esc(smartLabel(state.smart))}` : 'Everything<br>open', list.length, state.smart ? 'Folder' : 'All')}
    ${state.smart ? '' : smartGrid()}
    ${section('In progress', prog, { inDoing: true }) + section('Overdue', over, { red: true, action: ['movetoday', `Move ${over.length} to today`] }) + section('Today', dated.filter(it => dateOf(it) === t), { inToday: true }) + section('Scheduled', dated.filter(it => dateOf(it) > t)) + section('No date', none)
      || `<div class="empty-big"><p><b>${state.smart ? 'Nothing here.' : 'All clear.'}</b><br>Type a reminder in the bar below.</p></div>`}
    ${doneBlock(done, 'all')}`;
}
function smartGrid() {
  const base = state.items.filter(it => visible(it) && isOpen(it) && matchWho(it)), cnt = k => base.filter(SMART.find(x => x[0] === k)[3]).length;
  const tile = (k, label, cls = '') => `<button class="bento-t ${cls}" data-smart="${k}" data-k="t-${k}"><span class="bt-l">${label}</span><span class="bignum bt-n" data-count="${cnt(k)}">${cnt(k)}</span></button>`;
  const msgs = cnt('msgs');
  const brands = state.brands.map(b => [b, base.filter(it => it.brand_id === b.id).length]), mx = Math.max(1, ...brands.map(x => x[1]));
  return `<div class="bento">${tile('calls', 'Calls', 'hero tall')}${tile('doing', 'In progress', 'tall')}${tile('urgent', 'Urgent')}${tile('undated', 'No date')}${msgs ? tile('msgs', 'New messages', 'wide') : ''}</div>
    ${brands.length ? `<section class="bars-card" aria-label="Open reminders by brand"><div class="bars-h"><span>By brand</span><span class="mono">Open</span></div>
      <div class="bars">${brands.map(([b, n]) => `<button class="bar" data-smart="${b.id}" data-k="b-${b.id}" aria-label="${esc(b.name)}, ${n} open"><span class="bar-track"><span class="bar-fill" style="height:${Math.max(30, Math.round(100 * n / mx))}%"><b>${n}</b></span></span><span class="bar-l">${esc(b.name)}</span></button>`).join('')}</div></section>` : ''}`;
}
/* ---------- Notes: ideas and requests, jotted fast ---------- */
const noteById = id => state.notes.find(n => n.id === id);
const noteTitle = n => (n.body || '').split('\n')[0].trim() || 'New note';
const notePreview = n => (n.body || '').split('\n').slice(1).join(' ').replace(/\s+/g, ' ').trim();
function noteWhen(ts) { const d = dayOf(ts), n = diffDays(d, today()); return n === 0 ? clock(ts) : n === 1 ? 'Yesterday' : n < 7 ? fmtDate(d, { weekday: 'long' }) : fmtDate(d, { month: 'short', day: 'numeric' }); }
function noteRow(n) {
  const b = brand(n.brand_id), pv = notePreview(n);
  return `<button class="note-row${state.flash === n.id ? ' enter' : ''}" data-note="${n.id}" data-k="${n.id}"><span class="nr-title">${esc(noteTitle(n))}</span>
    <span class="nr-meta"><span class="nr-date">${esc(noteWhen(n.updated_at))}</span>${pv ? `<span class="nr-prev">${esc(pv)}</span>` : ''}</span>
    ${b && state.noteFolder === 'all' ? `<span class="nr-folder"><span class="dot" style="background:${esc(b.color)}"></span>${esc(b.name)}</span>` : ''}</button>`;
}
function renderNotes() {
  const f = state.noteFolder || 'all', all = state.notes.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const inF = n => f === 'all' ? true : f === 'none' ? !n.brand_id : n.brand_id === f, list = all.filter(inF);
  const folders = [['all', 'All', null, all.length], ...state.brands.map(b => [b.id, b.name, b.color, all.filter(n => n.brand_id === b.id).length]), ['none', 'No folder', null, all.filter(n => !n.brand_id).length]];
  if (state.notesMissing) return `${pageHead('Notes', '', 'Notes')}<div class="empty-big"><p><b>Notes need one quick setup step.</b><br>Run upgrade-4.sql in Supabase, then reopen coconotes.</p></div>`;
  return `${pageHead('Ideas &amp;<br>requests', all.length, `Notes, shared with ${esc(otherName())}`)}
    <div class="ftiles" role="group" aria-label="Folders">${folders.map(([k, l, c, n]) => `<button class="ftile${f === k ? ' hero' : ''}" data-folder="${k}" data-k="f-${k}" aria-pressed="${f === k}"><span class="bignum ft-n" data-count="${n}">${n}</span><span class="ft-l">${c ? `<span class="dot" style="background:${esc(c)}"></span>` : ''}${esc(l)}</span></button>`).join('')}</div>
    ${list.length ? `<div class="group lst notes-list">${list.map(noteRow).join('')}</div>` : `<div class="empty-big"><p><b>Nothing here yet.</b><br>Type an idea in the bar below and it lands ${f === 'all' || f === 'none' ? 'here' : `in ${esc(brand(f)?.name || 'this folder')}`}.</p></div>`}`;
}
async function newNote(body = '', open = false) {
  const f = state.noteFolder, n = await api.addNote({ body, brand_id: f !== 'all' && f !== 'none' ? f : null }); if (!n) return;
  state.flash = n.id; renderView();
  if (open) openNote(n.id); else toast('Note saved', 'Open', () => openNote(n.id));
}
function openNote(id) { state.sheet = { kind: 'note', id }; renderNote(); }
function renderNote() {
  const n = noteById(state.sheet?.id); if (!n) return closeSheet();
  showSheet(`${top(`${n.created_by === state.me.id ? 'You' : esc(nameOf(n.created_by))}, ${esc(noteWhen(n.updated_at))}`, 'Done')}
    <textarea id="note-body" class="note-body" placeholder="Start typing. The first line becomes the title." aria-label="Note">${esc(n.body)}</textarea>
    <div class="note-tools"><span class="fc-l">Folder</span>${chipRow('nfolder', [['', 'None'], ...state.brands.map(x => [x.id, x.name, x.color])], n.brand_id || '')}</div>
    <div class="actions"><button class="act" data-note-task="1">${ICON.task}<span>Make reminder</span></button><button class="act" data-note-del="1">${ICON.trash}<span>Delete</span></button></div>`, 'Note');
  $('#sheet-root .sheet')?.classList.add('tall');
}
let noteTimer = null;
function saveNoteSoon(id, body) { clearTimeout(noteTimer); noteTimer = setTimeout(async () => { await api.updateNote(id, { body }); if (state.view === 'notes') renderView(); }, 500); }
async function noteToTask() {
  const n = noteById(state.sheet?.id); if (!n) return;
  const p = parseClause(noteTitle(n)); const rest = (n.body || '').split('\n').slice(1).join('\n').trim();
  const it = await api.addItem({ type: p.type === 'call' ? 'call' : 'task', title: p.title || noteTitle(n), notes: rest, contact_name: p.contact_name, phone: p.phone, owner_ids: idsFor('both'), due_date: p.due_date || (p.remind_at ? dayOf(p.remind_at) : null), remind_at: p.remind_at, brand_id: n.brand_id });
  if (!it) return; api.log(it.id, 'created', ''); closeSheet(); state.flash = it.id;
  toast(`Added to ${dateOf(it) ? (dateOf(it) <= today() ? 'Today' : 'Upcoming') : 'All'}`, 'Open', () => openItem(it.id));
}
async function deleteNoteUndo(id) {
  const n = noteById(id); if (!n) return; const copy = { ...n };
  closeSheet(); await api.deleteNote(id); renderView();
  toast('Note deleted', 'Undo', async () => { state.notes.unshift(copy); await run(sb?.from('notes').insert(copy)); renderView(); });
}
function searchResults() {
  const q = state.search.trim().toLowerCase(); if (!q) return '<p class="lbl" style="padding:12px 4px">Search reminders, names, numbers, and notes.</p>';
  const its = state.items.filter(it => visible(it) && [it.title, it.notes, it.contact_name, it.phone, brand(it.brand_id)?.name].join(' ').toLowerCase().includes(q)).sort((a, b) => isOpen(b) - isOpen(a) || byWhen(a, b));
  const ns = state.notes.filter(n => [n.body, brand(n.brand_id)?.name].join(' ').toLowerCase().includes(q));
  if (!its.length && !ns.length) return `<div class="group"><div class="empty" style="border:0">Nothing matches "${esc(state.search)}".</div></div>`;
  return `${its.length ? `<section class="sec"><h2 class="sec-h"><span>Reminders</span><span class="sec-n">${its.length}</span></h2><div class="group lst">${its.map(it => row(it)).join('')}</div></section>` : ''}
    ${ns.length ? `<section class="sec"><h2 class="sec-h"><span>Notes</span><span class="sec-n">${ns.length}</span></h2><div class="group lst notes-list">${ns.map(noteRow).join('')}</div></section>` : ''}`;
}
function renderSearch() { return `${pageHead('Search', '', 'Reminders and notes')}<label class="sr-only" for="search-input">Search</label><input id="search-input" class="input" type="search" placeholder="Imperial, tea, David" value="${esc(state.search)}" autocomplete="off"><div id="search-results">${searchResults()}</div>`; }

const keyOf = n => n.nodeType === 1 ? (n.id || n.getAttribute('data-k') || n.getAttribute('data-rowwrap') || n.getAttribute('data-note') || null) : null;
function morphAttrs(a, b) {
  for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && at.name !== 'style') a.removeAttribute(at.name);
  for (const at of [...b.attributes]) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
}
function morphNode(a, b) {
  if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  morphAttrs(a, b);
  if (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA') {
    if (a !== document.activeElement) { const v = a.tagName === 'TEXTAREA' ? b.textContent : (b.getAttribute('value') ?? ''); if (a.value !== v) a.value = v; }
    return;
  }
  morphChildren(a, b);
}
function morphChildren(a, b) {
  const old = [...a.childNodes], neu = [...b.childNodes], keyed = new Map(), used = new Set();
  old.forEach(n => { const k = keyOf(n); if (k) keyed.set(k, n); });
  let oi = 0;
  neu.forEach((nb, idx) => {
    const k = keyOf(nb); let match = null;
    if (k) { const c = keyed.get(k); if (c && !used.has(c) && c.nodeName === nb.nodeName) match = c; }
    else { while (oi < old.length && (used.has(old[oi]) || keyOf(old[oi]))) oi++; const c = old[oi]; if (c && c.nodeType === nb.nodeType && c.nodeName === nb.nodeName) { match = c; oi++; } }
    const ref = a.childNodes[idx] || null;
    if (match) { used.add(match); if (match !== ref) a.insertBefore(match, ref); morphNode(match, nb); }
    else a.insertBefore(nb, ref);
  });
  old.forEach(n => { if (!used.has(n) && n.parentNode === a) a.removeChild(n); });
}
function morphHTML(el, html) { const t = document.createElement('template'); t.innerHTML = html; morphChildren(el, t.content); }
function renderView(transition) {
  const v = $('#view'); if (!v) return;
  const html = { today: renderToday, upcoming: renderUpcoming, all: renderAll, notes: renderNotes, search: renderSearch }[state.view]();
  if (transition === 'page' || state.lastView !== state.view || !v.firstChild) v.innerHTML = html; else morphHTML(v, html);
  state.lastView = state.view;
  document.body.dataset.section = state.view === 'search' ? 'today' : state.view;
  const qi = $('#qa-input'); if (qi) { const ph = state.view === 'notes' ? 'New note' : 'New reminder'; if (qi.placeholder !== ph) { qi.placeholder = ph; $('label[for=qa-input]').textContent = ph; } }
  $$('[data-view]').forEach(b => { if (!b.closest('#view')) b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'); });
  if (state.view === 'today' && !state.introPlayed) { state.introPlayed = true; if (!REDUCED()) { v.classList.add('intro'); setTimeout(() => v.classList.remove('intro'), 1500); } }
  else if (transition === 'page') [...v.children].slice(0, 8).forEach((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: i * 55, easing: EASE, fill: 'backwards' }));
  else if (transition === 'filter') $$('.group', v).forEach((g, i) => anim(g, [{ opacity: .35 }, { opacity: 1 }], { duration: 320, delay: Math.min(i, 6) * 30, easing: EASE }));
  placeSegs(v); updateBadge(); countUp(v, transition === 'page' || !state.counted);
  state.counted = true;
  state.flash = null;
}
/* big numbers glide to their new value instead of jumping */
const countVals = new WeakMap();
function countUp(root, fromZero) {
  $$('.bignum[data-count]', root).forEach(el => {
    const to = +el.dataset.count, from = countVals.has(el) ? countVals.get(el) : (fromZero ? 0 : to); countVals.set(el, to);
    if (from === to || REDUCED() || isNaN(to)) { el.textContent = to; return; }
    const t0 = performance.now(), dur = Math.min(900, 380 + Math.abs(to - from) * 60);
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4); el.textContent = Math.round(from + (to - from) * e); if (k < 1 && countVals.get(el) === to) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
const placedPills = new WeakSet();
function placeSegs(root = document, instant) {
  $$('.seg[data-seg]', root).forEach(seg => {
    const pill = $('.seg-pill', seg), btn = $('button[aria-pressed=true]', seg);
    if (!pill) return; if (!btn) { pill.style.opacity = '0'; return; }
    const tf = `translateX(${btn.offsetLeft}px)`, w = btn.offsetWidth + 'px', first = instant || !placedPills.has(pill);
    if (pill.style.transform === tf && pill.style.width === w && !first) return;
    if (first) pill.style.transition = 'none';
    pill.style.transform = tf; pill.style.width = w; pill.style.opacity = '1';
    if (first) { pill.offsetWidth; pill.style.transition = ''; placedPills.add(pill); }
  });
}
function refresh() { renderView(); if (state.sheet) rerenderSheetSafe(); }

/* ---------- Shell ---------- */
function renderShell() {
  $('#app').innerHTML = `<div class="ambient" aria-hidden="true"></div><div class="statusback" aria-hidden="true"></div><div class="shell">
    <header class="topbar"><span class="sr-only">coconotes</span>
      <nav class="topnav" aria-label="Main">${VIEWS.map(([k, l]) => `<button data-view="${k}">${l}</button>`).join('')}</nav>
      <span class="top-right">${DEMO ? '<span class="demo-badge">Demo</span>' : ''}${actions()}</span></header>
    <main id="view"></main>
    <div class="dock"><div class="dock-inner">
      <div class="dock-row">
      <form class="qa" id="qa" autocomplete="off"><label class="sr-only" for="qa-input">New reminder</label>
        <input id="qa-input" enterkeyhint="done" placeholder="New reminder" aria-describedby="qa-chips">
        <button class="qa-btn" id="qa-btn" type="submit" aria-label="New reminder with details">${ICON.plus}</button></form></div>
      <div class="qa-chips" id="qa-chips" aria-live="polite"></div><div class="qa-err" id="qa-err" role="alert"></div>
      <nav class="tabs" aria-label="Main">${VIEWS.map(([k, l]) => `<button data-view="${k}"><span class="ti">${ICON[k]}</span><span>${l}</span></button>`).join('')}</nav></div></div></div>
  <div id="sheet-root"></div><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  renderView();
}

/* ---------- Quick add ---------- */
function chipsFor(p) {
  const c = [];
  if (p.remind_at) c.push(['r' + p.remind_at, `<span class="chip">${esc(relWhen(p.remind_at))}</span>`]); else if (p.due_date) c.push(['d' + p.due_date, `<span class="chip">${esc(rel(p.due_date))}</span>`]);
  if (p.type === 'call') c.push(['c' + (p.contact_name || ''), `<span class="chip"><span class="chip-ic">${ICON.call}</span>Call${p.contact_name ? ` ${esc(p.contact_name)}` : ''}</span>`]);
  if (p.phone) c.push(['p', `<span class="chip">${esc(p.phone)}</span>`]);
  if (p.brand) { const a = brand(p.brand); c.push(['a' + p.brand, `<span class="chip"><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}</span>`]); }
  if (p.urgent) c.push(['u', '<span class="chip u">Urgent</span>']);
  const prev = state.prevChips; state.prevChips = new Set(c.map(x => x[0]));
  return c.map(([k, h]) => prev.has(k) ? h : h.replace('class="chip', 'class="chip pop')).join('');
}
function quickParse(text) {
  const p = parseClause(text); p.owner = 'both';
  if (!p.due_date && !p.remind_at) { if (state.view === 'today') p.due_date = today(); else if (state.view === 'upcoming') p.due_date = addDays(today(), 1); }
  return p;
}
function qaPreview() {
  const el = $('#qa-input'); if (!el) return;
  const v = el.value.trim(), btn = $('#qa-btn'); if (!v) state.prevChips = new Set();
  $('#qa-chips').innerHTML = state.view === 'notes' ? '' : v ? chipsFor(quickParse(el.value)) : (document.activeElement === el ? `<span class="qa-hint">Type it the way you'd say it: call David at 3, or send the menu Friday #LOX</span>` : '');
  const want = v ? 'add' : 'plus';
  if (btn.dataset.mode !== want) { btn.dataset.mode = want; btn.innerHTML = v ? '<span>Add</span>' : ICON.plus; btn.setAttribute('aria-label', v ? 'Add' : state.view === 'notes' ? 'New note' : 'New reminder with details'); btn.classList.toggle('wide', !!v); }
}
async function addParsed(p) {
  const ownerIds = idsFor('both');
  const type = p.phone || p.type === 'call' ? 'call' : (p.type === 'reminder' ? 'reminder' : 'task');
  const it = await api.addItem({ type, title: p.title, owner_ids: ownerIds, due_date: p.due_date || (p.remind_at ? dayOf(p.remind_at) : null), remind_at: p.remind_at, contact_name: p.contact_name, phone: p.phone, brand_id: p.brand, urgent: !!p.urgent, notes: p.notes || '' });
  if (!it) return null;
  api.log(it.id, 'created', '');
  return it;
}
function whereItLives(it) {
  const d = dateOf(it);
  if (!d) return 'All'; return d <= today() ? 'Today' : 'Upcoming';
}
async function submitQuick(e) {
  e.preventDefault();
  const input = $('#qa-input');
  if (state.view === 'notes') { const v = input.value.trim(); input.value = ''; qaPreview(); return newNote(v, !v); }
  if (!input.value.trim()) return openNew();
  const p = quickParse(input.value);
  if (!p.title) { $('#qa-err').textContent = 'Type what needs doing, then add it.'; return input.focus(); }
  input.value = ''; $('#qa-err').textContent = ''; qaPreview();
  const it = await addParsed(p); if (!it) return;
  state.flash = it.id; refresh();
  const where = whereItLives(it), here = { today: 'Today', upcoming: 'Upcoming', all: 'All' }[state.view];
  toast(where === here || state.view === 'all' ? 'Added' : `Added to ${where}`, 'Open', () => openItem(it.id));
}

/* ---------- Complete ---------- */
function collapse(el) { const h = el.offsetHeight; el.style.overflow = 'hidden'; return anim(el, [{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 360, easing: EASE_IN, fill: 'forwards' }); }
async function toggleTask(id, btn) {
  const it = itemById(id); if (!it) return;
  const wrap = btn?.closest('.row-wrap'), was = it.done;
  if (!was && wrap) { btn.classList.add('completing'); wrap.querySelector('.row')?.classList.add('completing'); if (navigator.vibrate) navigator.vibrate(10); if (!REDUCED() && !state.showDone[state.view]) { await wait(380); await collapse(wrap); } }
  await api.updateItem(id, { done: !was });
  if (!was && (ownedByOther(it) || fromOther(it))) api.log(id, 'done', '', fromOther(it) ? it.created_by : other().id);
  state.flash = was ? id : null; refresh();
  if (!was) toast(fromOther(it) ? `Done. ${nameOf(it.created_by)} will see it.` : 'Completed', 'Undo', async () => { await api.updateItem(id, { done: false }); state.flash = id; refresh(); });
}

/* ---------- Swipe actions ---------- */
let sw = null, suppressClick = false;
function closeSwipes(except) { $$('.row.open').forEach(r => { if (r !== except) { r.classList.remove('open'); r.style.transform = ''; setTimeout(() => { if (!r.classList.contains('open')) r.parentNode?.classList.remove('reveal'); }, 300); } }); }
let lp = null;
function cancelLP() { if (lp) { clearTimeout(lp.t); lp.r.classList.remove('pressing'); lp = null; } }
function bindSwipe() {
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.range, .sheet')) return;
    const r = e.target.closest('.row[data-swipe]');
    if (r && !r.classList.contains('open') && !e.target.closest('a')) { cancelLP(); lp = { r, x: e.clientX, y: e.clientY, t: setTimeout(() => { if (!lp) return; const id = lp.r.dataset.swipe; lp.r.classList.remove('pressing'); lp = null; sw = null; suppressClick = true; setTimeout(() => { suppressClick = false; }, 450); if (navigator.vibrate) navigator.vibrate(12); openMenu(id); }, 480) }; setTimeout(() => lp?.r.classList.add('pressing'), 120); }
    if (!r || e.pointerType === 'mouse') { if (!e.target.closest('.row-actions')) closeSwipes(); return; }
    closeSwipes(r); sw = { r, x0: e.clientX, y0: e.clientY, base: r.classList.contains('open') ? -150 : 0, dx: 0, active: false };
  });
  document.addEventListener('pointermove', e => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) cancelLP();
    if (!sw) return; const dx = e.clientX - sw.x0, dy = e.clientY - sw.y0;
    if (!sw.active) { if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.2) { sw.active = true; sw.r.style.transition = 'none'; sw.r.parentNode.classList.add('reveal'); } else if (Math.abs(dy) > 10) { sw = null; return; } else return; }
    sw.dx = Math.min(0, Math.max(-190, sw.base + dx)); sw.r.style.transform = `translateX(${sw.dx}px)`;
  });
  const end = () => {
    if (!sw) return;
    if (sw.active) { sw.r.style.transition = ''; const open = sw.dx < -60; sw.r.classList.toggle('open', open); sw.r.style.transform = open ? 'translateX(-150px)' : ''; if (!open) { const w = sw.r.parentNode; setTimeout(() => w.classList.remove('reveal'), 300); } suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
      $('.row-actions', sw.r.parentNode)?.setAttribute('aria-hidden', String(!open)); if (open && navigator.vibrate) navigator.vibrate(6); }
    sw = null;
  };
  document.addEventListener('pointerup', () => { cancelLP(); end(); }); document.addEventListener('pointercancel', () => { cancelLP(); end(); });
  document.addEventListener('contextmenu', e => { const r = e.target.closest('.row[data-swipe]'); if (!r) return; e.preventDefault(); cancelLP(); openMenu(r.dataset.swipe); });
}
function openMenu(id) {
  const it = itemById(id); if (!it) return;
  closeSwipes();
  const wrap = $(`[data-rowwrap="${id}"]`), rowEl = wrap?.querySelector('.row'), r = rowEl?.getBoundingClientRect();
  state.sheet = { kind: 'menu', id }; lastFocus = document.activeElement;
  const st = it.done ? 'done' : it.status === 'doing' ? 'doing' : 'todo';
  const clone = rowEl ? rowEl.cloneNode(true) : null;
  if (clone) { clone.classList.remove('pressing', 'open', 'enter'); clone.style.transform = ''; clone.removeAttribute('data-swipe'); clone.querySelectorAll('[data-toggle],[data-open]').forEach(x => { x.removeAttribute('data-toggle'); x.removeAttribute('data-open'); x.setAttribute('tabindex', '-1'); }); clone.querySelectorAll('a').forEach(a => a.setAttribute('tabindex', '-1')); }
  $('#sheet-root').innerHTML = `<div class="ctx" role="dialog" aria-modal="true" aria-label="Actions for ${esc(it.title)}">
    <div class="ctx-dim"></div>
    <div class="ctx-scroll" data-ctxout="1">
      <div class="ctx-card group lst" id="ctx-card" aria-hidden="true"></div>
      <div class="ctx-menu">
        <div class="mstatus" role="radiogroup" aria-label="Status">${[['todo', 'Not started', ''], ['doing', 'In progress', 'doing'], ['done', 'Done', 'done']].map(([k, l, c]) => `<button class="ms" data-mstatus="${k}" role="radio" aria-checked="${st === k}"><span class="check ${c}" aria-hidden="true"></span><span>${l}</span></button>`).join('')}</div>
        ${isOpen(it) ? snoozeSlider() : ''}
        <div class="menu-list">
          <button class="mi" data-murgent="1">${ICON.flag}<span>${it.urgent ? 'Not urgent' : 'Mark urgent'}</span></button>
          <button class="mi" data-mopen="1">${ICON.dots}<span>Details</span></button>
          <button class="mi red" data-mdelete="1">${ICON.trash}<span>Delete</span></button></div>
        <button class="btn quiet wide ctx-cancel sheet-close" data-close="1">Cancel</button>
      </div></div></div>`;
  const card = $('#ctx-card'); if (clone) card.appendChild(clone); else card.innerHTML = row(it);
  document.body.style.overflow = 'hidden'; document.body.classList.add('sheet-open');
  wrap?.classList.add('lifted');
  if (!REDUCED()) {
    const cr = card.getBoundingClientRect();
    if (r && r.height) anim(card, [{ transform: `translate(${(r.left - cr.left).toFixed(1)}px,${(r.top - cr.top).toFixed(1)}px) scale(${(r.width / cr.width).toFixed(4)})`, boxShadow: '0 0 0 rgba(0,0,0,0)', borderRadius: '0px' },
      { transform: 'translate(0,0) scale(1.025)', offset: .72 }, { transform: 'none' }], { duration: 620, easing: EASE });
    anim($('.ctx-dim'), [{ opacity: 0 }, { opacity: 1 }], { duration: 480, easing: 'ease-out' });
    $$('.ctx-menu > *').forEach((el, k) => anim(el, [{ opacity: 0, transform: 'translateY(16px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 140 + k * 70, easing: EASE, fill: 'backwards' }));
  }
  setTimeout(() => $('.ctx [data-mstatus]')?.focus({ preventScroll: true }), 80);
}
function closeMenu() {
  const ctx = $('#sheet-root .ctx:not(.closing)'); if (!ctx) return;
  const id = state.sheet?.id; state.sheet = null; document.body.style.overflow = ''; document.body.classList.remove('sheet-open');
  const wrap = $(`[data-rowwrap="${id}"]`), card = $('#ctx-card', ctx), menu = $('.ctx-menu', ctx);
  const done = () => { ctx.remove(); wrap?.classList.remove('lifted'); };
  ctx.classList.add('closing'); if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  if (REDUCED()) return done();
  anim($('.ctx-dim', ctx), [{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-in-out', fill: 'forwards' });
  anim(menu, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12px) scale(.98)' }], { duration: 300, easing: EASE_IN, fill: 'forwards' });
  const r = wrap?.querySelector('.row')?.getBoundingClientRect(), cr = card.getBoundingClientRect();
  if (r && r.height && wrap.isConnected) anim(card, [{ transform: 'none' }, { transform: `translate(${(r.left - cr.left).toFixed(1)}px,${(r.top - cr.top).toFixed(1)}px) scale(${(r.width / cr.width).toFixed(4)})`, boxShadow: '0 0 0 rgba(0,0,0,0)', borderRadius: '0px' }], { duration: 460, easing: EASE, fill: 'forwards' }).then(done);
  else anim(card, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.96)' }], { duration: 320, easing: EASE_IN, fill: 'forwards' }).then(done);
}
async function setStatus(id, st) {
  const it = itemById(id); if (!it) return; const was = it.done;
  await api.updateItem(id, { status: st });
  if (st === 'done' && !was && (ownedByOther(it) || fromOther(it))) api.log(id, 'done', '', fromOther(it) ? it.created_by : other().id);
  state.flash = id; renderView();
  toast(st === 'doing' ? 'In progress' : st === 'done' ? 'Completed' : 'Not started', 'Undo', async () => { await api.updateItem(id, { status: was ? 'done' : 'todo' }); refresh(); });
}
async function snoozeItem(id, ts) {
  await api.updateItem(id, { due_date: dayOf(ts), remind_at: ts });
  state.flash = id; refresh(); toast(`Snoozed. Reminding you ${atText(ts)}.`);
}
async function moveOverdueToToday() {
  const t = today(), over = openFor().filter(it => !doing(it) && dateOf(it) && dateOf(it) < t), before = over.map(it => [it.id, it.due_date, it.remind_at]);
  for (const it of over) {
    let r = null; if (it.remind_at) { const d = new Date(it.remind_at), c = new Date(); c.setHours(d.getHours(), d.getMinutes(), 0, 0); if (c > new Date()) r = c.toISOString(); }
    await api.updateItem(it.id, { due_date: t, remind_at: r });
  }
  refresh(); toast(`Moved ${over.length} to today`, 'Undo', async () => { for (const [id, d, r] of before) await api.updateItem(id, { due_date: d, remind_at: r }); refresh(); });
}

/* ---------- Sheets ---------- */
let lastFocus = null;
function showSheet(html, label) {
  const ex = $('#sheet-root .sheet:not(.closing)'), key = `${state.sheet?.kind}:${state.sheet?.id || ''}`;
  if (ex) { const same = ex.dataset.key === key; ex.dataset.key = key; ex.setAttribute('aria-label', label);
    if (same) { morphHTML(ex, `<div class="grabber"></div>${html}`); return; }
    ex.innerHTML = `<div class="grabber"></div>${html}`; ex.scrollTop = 0; ex.classList.remove('tall');
    anim(ex, [{ opacity: .4 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' }); return; }
  lastFocus = document.activeElement;
  $('#sheet-root').innerHTML = `<div class="scrim" data-close="1"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" data-key="${esc(key)}"><div class="grabber"></div>${html}</div>`;
  document.body.style.overflow = 'hidden'; document.body.classList.add('sheet-open');
  enableDrag($('#sheet-root .sheet'));
  setTimeout(() => { const sh = $('#sheet-root .sheet:not(.closing)'); if (sh && !sh.contains(document.activeElement)) sh.querySelector('.sheet-close')?.focus({ preventScroll: true }); }, 60);
}
function enableDrag(sheet) {
  if (!sheet) return; let y0 = null, t0 = 0, dy = 0;
  sheet.addEventListener('pointerdown', e => { if (DESKTOP() || !e.target.closest('.grabber, .sheet-top') || e.target.closest('button')) return; y0 = e.clientY; t0 = performance.now(); dy = 0; sheet.setPointerCapture(e.pointerId); });
  sheet.addEventListener('pointermove', e => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; const s = $('#sheet-root .scrim'); if (s) s.style.opacity = String(Math.max(0, 1 - dy / 500)); });
  const end = async () => { if (y0 === null) return; y0 = null; if (dy > 110 || dy / Math.max(1, performance.now() - t0) > 0.6) return closeSheet(dy);
    await anim(sheet, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 460, easing: EASE }); sheet.style.transform = ''; const s = $('#sheet-root .scrim'); if (s) s.style.opacity = ''; };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
}
function closeSheet(fromDy = 0) {
  if (state.sheet?.kind === 'menu' || $('#sheet-root .ctx:not(.closing)')) return closeMenu();
  if (state.sheet?.kind === 'note') { const n = noteById(state.sheet.id), body = $('#note-body')?.value; clearTimeout(noteTimer);
    if (n && body !== undefined && body !== n.body) api.updateNote(n.id, { body });
    if (n && !(body ?? n.body).trim()) { api.deleteNote(n.id); }
    setTimeout(() => state.view === 'notes' && renderView(), 0); }
  state.sheet = null; document.body.style.overflow = ''; document.body.classList.remove('sheet-open');
  const root = $('#sheet-root'), sheet = root.querySelector('.sheet:not(.closing)'), scrim = root.querySelector('.scrim:not(.closing)');
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  if (!sheet) { root.innerHTML = ''; return; }
  sheet.classList.add('closing'); scrim?.classList.add('closing');
  const done = () => { sheet.remove(); scrim?.remove(); }; if (REDUCED()) return done();
  anim(scrim, [{ opacity: scrim ? getComputedStyle(scrim).opacity : 1 }, { opacity: 0 }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
  anim(sheet, DESKTOP() ? [{ opacity: 1, scale: 1 }, { opacity: 0, scale: .97 }] : [{ transform: `translateY(${fromDy}px)` }, { transform: 'translateY(100%)' }], { duration: DESKTOP() ? 260 : 380, easing: EASE_IN, fill: 'forwards' }).then(done);
}
function rerenderSheetSafe() {
  const s = state.sheet; if (!s) return;
  if (s.kind === 'activity') return renderActivity();
  if (s.kind !== 'item' || !s.id) return;
  const a = document.activeElement; if (a && $('#sheet-root').contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'range') return;
  if (!itemById(s.id)) return closeSheet(); renderItem();
}
const top = (left, btn = 'Done') => `<div class="sheet-top"><span class="lbl">${left}</span><button class="sheet-close" data-close="1">${btn}</button></div>`;
function autoGrow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

/* Details: one form for new and existing reminders */
function openItem(id) {
  if (!itemById(id)) return toast('That was deleted.');
  delete state.segPos.iowner; delete state.segPos.istatus; state.sheet = { kind: 'item', id, mode: null }; renderItem();
  const ids = state.activity.filter(a => a.item_id === id && a.to_id === state.me.id && !a.read).map(a => a.id); if (ids.length) api.markRead(ids);
}
function openNew(preset = {}) {
  delete state.segPos.iowner;
  const owner = 'both';
  const date = preset.date ?? (state.view === 'today' ? today() : state.view === 'upcoming' ? addDays(today(), 1) : null);
  state.sheet = { kind: 'item', id: null, mode: null, draft: { title: '', notes: '', owner, due_date: date, remind_at: null, phone: '', type: 'task', urgent: false, brand_id: null, ...preset } };
  renderItem(); setTimeout(() => $('#f-title')?.focus(), 80);
}
const cur = () => state.sheet.id ? itemById(state.sheet.id) : state.sheet.draft;
const curOwner = () => state.sheet.id ? ownerKey(cur()) : state.sheet.draft.owner;
function renderItem() {
  const s = state.sheet, isNew = !s.id, it = cur(); if (!it) return closeSheet();
  const o = otherName(), date = dateOf(it), time = timeOf(it), ok = curOwner();
  const dates = [['', 'None'], [today(), 'Today'], [addDays(today(), 1), 'Tomorrow'], [addDays(today(), 2), fmtDate(addDays(today(), 2), { weekday: 'long' })], [addDays(today(), 7), 'Next week']];
  const customDate = date && !dates.some(d => d[0] === date);
  const thread = isNew ? [] : state.activity.filter(x => x.item_id === it.id).slice().reverse();
  let panel = '';
  if (s.mode === 'log') panel = `<div class="act-panel"><textarea id="log-note" class="input" rows="2" placeholder="How did it go?" aria-label="Call notes"></textarea>
    <h3 class="mini-h">Call again</h3>${chipRow('follow', [['', 'No'], [atLocal(addDays(today(), 1), 10), 'Tomorrow'], [atLocal(addDays(today(), 3), 10), 'In 3 days'], [atLocal(addDays(today(), 7), 10), 'Next week']], s.follow || '')}
    <div class="btnrow tight"><button class="btn quiet" data-mode="">Cancel</button><button class="btn solid grow" data-log-go="1">Save and complete</button></div></div>`;
  const callBar = !isNew && it.phone && isOpen(it) ? `<div class="actions${s.mode ? ' has-panel' : ''}"><a class="act primary" href="${esc(telHref(it.phone))}">${ICON.call}<span>Call ${esc(it.contact_name || '')}</span></a><button class="act" data-mode="log">${ICON.note}<span>Log call</span></button></div>${panel}` : '';
  const fromLine = '', nudge = '';
  const msgs = isNew ? '' : `<section class="msg-card" aria-label="Messages"><div class="msg-h"><span>${ICON.chat}Messages</span><span class="lbl">${thread.filter(x => x.kind === 'comment').length || ''}</span></div>
    <div class="thread">${thread.filter(x => x.kind === 'comment').map(x => `<div class="bubble${x.actor_id === state.me.id ? ' me' : ''}" style="--pc:${colorOf(x.actor_id)}"><span class="b-text">${esc(x.body)}</span><span class="lbl">${esc(x.actor_id === state.me.id ? 'You' : nameOf(x.actor_id))}, ${esc(relTime(x.created_at))}</span></div>`).join('') || `<p class="lbl msg-empty">Leave a note for ${esc(o)} about this.</p>`}</div>
    <form id="comment-form" class="composer"><input id="c-in" class="input" placeholder="Message ${esc(o)}" autocomplete="off" aria-label="Message ${esc(o)}"><button class="send-btn" type="submit" aria-label="Send">${ICON.send}</button></form><div class="err" id="c-err" role="alert"></div></section>`;
  showSheet(`${top(isNew ? 'New reminder' : 'Details', isNew ? 'Cancel' : 'Done')}
    ${fromLine}
    <div class="done-row">${isNew ? '<span class="check lg ghost" aria-hidden="true"></span>' : `<button class="check lg${it.done ? ' done' : ''}${it.urgent && !it.done ? ' urgent' : ''}" data-sheet-done="1" aria-label="${it.done ? 'Mark not done' : 'Complete'}"></button>`}
      <textarea id="f-title" class="title-input" rows="1" data-ifield="title" placeholder="What do you need to remember?" aria-label="Title">${esc(it.title)}</textarea></div>
    <textarea class="bare notes-input" data-ifield="notes" rows="1" placeholder="Notes" aria-label="Notes">${esc(it.notes || '')}</textarea>
    ${!isNew ? `<div class="seg status-seg" data-seg="istatus" role="radiogroup" aria-label="Status"><span class="seg-pill" aria-hidden="true"></span>${[['todo', 'Not started'], ['doing', 'In progress'], ['done', 'Done']].map(([k, l]) => `<button data-status="${k}" aria-pressed="${(it.status || (it.done ? 'done' : 'todo')) === k}">${l}</button>`).join('')}</div>` : ''}
    ${!isNew && missed(it) ? `<div class="missed-note"><span class="red">Missed ${esc(clock(it.remind_at))}.</span> Pick a new time below.</div>${snoozeSlider()}` : ''}
    ${callBar}${msgs}
    <div class="form-card">
      <div class="fc-row col"><span class="fc-l">Date</span><div class="chips wrap">${dates.map(([v, l]) => `<button type="button" class="chip" data-date="${v}" aria-pressed="${(date || '') === v && !customDate}">${esc(l)}</button>`).join('')}
        <label class="chip datechip${customDate ? ' on' : ''}"><span>${customDate ? esc(rel(date)) : 'Pick'}</span><input type="date" data-date-input="1" value="${date || ''}" aria-label="Pick a date"></label></div></div>
      ${date ? `<div class="fc-row"><span class="fc-l stack-l" id="tm-l">Time<span class="fc-sub">${time ? 'You get a notification then' : 'Optional'}</span></span>
        <span class="tm-right">${time ? `<span class="tm-val" id="tm-val">${esc(clock(it.remind_at))}</span>` : ''}<button class="switch" role="switch" aria-labelledby="tm-l" aria-checked="${!!time}" data-timeon="1"></button></span></div>
        ${time ? `<div class="fc-row col slider-row">${timeSlider(time)}</div>` : ''}` : ''}
      ${time ? `<div class="fc-row"><span class="fc-l stack-l" id="nag-l">Keep reminding me<span class="fc-sub">Every 30 minutes until it's done</span></span><button class="switch" role="switch" aria-labelledby="nag-l" aria-checked="${!!it.nag}" data-nag="1"></button></div>` : ''}
      <div class="fc-row"><span class="fc-l stack-l" id="call-l">Call<span class="fc-sub">Shows in Calls, with a call button</span></span><button class="switch" role="switch" aria-labelledby="call-l" aria-checked="${isCall(it)}" data-callon="1"></button></div>
      ${isCall(it) ? `<label class="fc-row"><span class="fc-l">Number</span><input class="bare fc-in" type="tel" data-ifield="phone" value="${esc(it.phone || '')}" placeholder="Optional" autocomplete="tel"></label>` : ''}
      <div class="fc-row"><span class="fc-l" id="urg-l">Urgent</span><button class="switch" role="switch" aria-labelledby="urg-l" aria-checked="${!!it.urgent}" data-urgent="1"></button></div>
      <div class="fc-row col"><span class="fc-l">Brand <span class="fc-sub">Optional</span></span>${chipRow('ibrand', [['', 'None'], ...state.brands.map(x => [x.id, x.name, x.color])], it.brand_id || '')}</div>
    </div>
    ${isNew ? `<div class="err" id="c-err" role="alert"></div><button class="btn solid wide" data-save-new="1">Add reminder</button>` : `
    <div style="margin-top:28px"><button class="btn danger" data-delete="${it.id}">Delete reminder</button></div>`}`, isNew ? 'New reminder' : 'Details');
  autoGrow($('#f-title')); autoGrow($('.notes-input')); placeSegs($('#sheet-root'));
}
async function patchCur(patch, quiet) {
  const s = state.sheet;
  if (!s.id) { Object.assign(s.draft, patch); return; }
  await api.updateItem(s.id, patch);
  const it = itemById(s.id), t = typeFor(it);
  if (t !== it.type) await api.updateItem(s.id, { type: t });
  if (!quiet) renderView();
}
async function setWhen(date, time) {
  const w = whenFrom(date, time);
  await patchCur(w); renderItem();
  if (state.sheet.id && w.remind_at) toast(`You'll get a notification ${atText(w.remind_at)}.`);
}
async function saveNew() {
  const s = state.sheet, d = s.draft; d.title = ($('#f-title')?.value || '').trim(); d.notes = $('.notes-input')?.value || '';
  if (!d.title) { $('#c-err').textContent = 'Give it a title first.'; return $('#f-title').focus(); }
  const it = await api.addItem({ type: d.phone || d.type === 'call' ? 'call' : 'task', title: d.title, notes: d.notes, owner_ids: idsFor('both'), due_date: d.due_date, remind_at: d.remind_at, phone: d.phone || null, urgent: !!d.urgent, brand_id: d.brand_id });
  closeSheet(); if (!it) return;
  api.log(it.id, 'created', '');
  state.flash = it.id; refresh();
  const where = whereItLives(it), here = { today: 'Today', upcoming: 'Upcoming', all: 'All' }[state.view];
  toast(where === here || state.view === 'all' ? 'Added' : `Added to ${where}`, 'Open', () => openItem(it.id));
}

/* Activity (opened from the bell) */
function actText(a) {
  const it = itemById(a.item_id), t = `<b>${esc(it ? it.title : 'something')}</b>`, who = esc(nameOf(a.actor_id)), to = a.to_id === state.me.id ? 'you' : esc(nameOf(a.to_id));
  return ({ request: `${who} asked ${to}: ${t}`, handoff: `${who} gave ${to} ${t}`, comment: `${who} wrote on ${t}`, created: `${who} added ${t}`, done: `${who} completed ${t}`,
    call_log: `${who} logged a call: ${t}`, reminder: `Reminder: ${t}` })[a.kind] || `${who} updated ${t}`;
}
function openActivity() { state.sheet = { kind: 'activity' }; renderActivity(); setTimeout(() => { if (state.sheet?.kind === 'activity') { const ids = sel.unread().map(a => a.id); if (ids.length) api.markRead(ids); } }, 1500); }
function renderActivity() {
  const list = state.actScope === 'mine' ? sel.inbox() : state.activity;
  showSheet(`${top('Activity')}<div class="seg" data-seg="ascope" role="group" aria-label="Show"><span class="seg-pill" aria-hidden="true"></span><button data-ascope="mine" aria-pressed="${state.actScope === 'mine'}">For you</button><button data-ascope="all" aria-pressed="${state.actScope === 'all'}">Everything</button></div>
    <div class="group" style="margin-top:8px">${list.slice(0, 80).map(a => `<button class="arow${!a.read && a.to_id === state.me.id ? ' unread' : ''}" data-open="${a.item_id}" data-act="${a.id}">${a.actor_id ? avatar(a.actor_id, 34) : `<span class="av sys" style="width:34px;height:34px">${MARK(18)}</span>`}
      <span class="a-body"><span class="a-text">${actText(a)}</span>${a.body ? `<span class="a-quote">${esc(a.body)}</span>` : ''}<span class="lbl">${esc(relTime(a.created_at))}</span></span><span class="udot"></span></button>`).join('')
      || `<div class="empty" style="border:0">When ${esc(otherName())} adds or finishes something, writes you a message, or a reminder goes off, it shows up here.</div>`}</div>
    ${notifPromo()}`, 'Activity');
  placeSegs($('#sheet-root'));
}
const chipRow = (key, list, curV) => `<div class="chips wrap" role="radiogroup">${list.map(([v, l, color]) => `<button type="button" class="chip" data-chip="${key}" data-val="${esc(v)}" aria-pressed="${v === curV}">${color ? `<span class="dot" style="background:${esc(color)}"></span>` : ''}${esc(l)}</button>`).join('')}</div>`;
const telHref = p => 'tel:' + String(p).replace(/[^\d+]/g, '');

/* ---------- Settings, notifications, calendar ---------- */
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
function notifState() { if (DEMO) return 'demo'; if (!cfg.VAPID_PUBLIC_KEY || /YOUR_/.test(cfg.VAPID_PUBLIC_KEY)) return 'nokey'; if (isIOS() && !standalone()) return 'install'; if (!pushSupported()) return 'unsupported'; return Notification.permission; }
function notifPromo(force) {
  const st = notifState(); if (st === 'granted' && !force) return '';
  const copy = { demo: ['Get pinged for reminders and requests', 'Works once coconotes is connected. See SETUP.'], nokey: ['Notifications need one more setup step', 'Add your push key to config.js. See SETUP, step 6.'],
    install: ['Add coconotes to your home screen first', 'iPhone only notifies apps on the home screen. Tap Share, then Add to Home Screen.'], unsupported: ["This browser can't show notifications", 'Use Safari on iPhone from the home screen, or Chrome.'],
    denied: ['Notifications are blocked', "Turn them on for coconotes in your phone's Settings."], default: ['Turn on notifications', `Reminders at the right time, and a ping when ${otherName()} asks you for something.`], granted: ['Notifications are on', 'Reminders, requests, and messages will ping your phone.'] }[st];
  return `<button class="calpromo${st === 'default' ? ' hot' : ''}" data-notif="${st}"><span class="calpromo-ic">${ICON.activity}</span><span><b>${esc(copy[0])}</b><span class="lbl">${esc(copy[1])}</span></span>${st === 'default' ? ICON.right : ''}</button>`;
}
function b64ToBytes(b64) { const p = '='.repeat((4 - b64.length % 4) % 4), s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(s, c => c.charCodeAt(0)); }
async function enablePush(silent) {
  try {
    if (!silent) { const perm = await Notification.requestPermission(); if (perm !== 'granted') { refresh(); return toast('Notifications stay off. Turn them on later in Settings.'); } }
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({ profile_id: state.me.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
    if (error) throw error;
    if (!silent) { refresh(); if (state.sheet?.kind === 'settings') openSettings(); toast('Notifications on.'); }
  } catch (er) { console.error(er); if (!silent) toast("Couldn't turn on notifications. Check SETUP, step 6."); }
}
function notifClick(st) {
  if (st === 'default') return enablePush(false);
  if (st === 'demo') return toast('In the demo, reminders pop up right here. On your phone they buzz.');
  if (st === 'install') return toast('Tap Share in Safari, then Add to Home Screen. Open coconotes from there.');
}
function openSettings() {
  state.sheet = { kind: 'settings' }; const o = other();
  showSheet(`${top(esc(state.me.email || ''))}<h2 class="title-input" style="padding-top:0">Settings</h2>
    <label class="field"><span>Your name</span><input class="input" id="me-name" value="${esc(state.me.name || '')}" autocomplete="name"></label>
    <h2 class="section-h">Your color</h2><div class="swatches">${PALETTE.filter(([, c]) => c !== o.color && !state.brands.some(b => b.color.toLowerCase() === c.toLowerCase())).map(([n, c]) => `<button class="sw" data-mycolor="${c}" aria-label="${n}" aria-checked="${c === state.me.color}" role="radio" style="background:${c}"></button>`).join('')}</div>
    <h2 class="section-h">Notifications</h2>${notifPromo(true)}
    <h2 class="section-h">Quick capture</h2><button class="calpromo" data-capture="1"><span class="calpromo-ic">${ICON.mic}</span><span><b>Jot from your Lock Screen</b><span class="lbl">Type a note without unlocking. Claude sorts out the time and brand.</span></span>${ICON.right}</button>
    <h2 class="section-h">Calendar</h2><button class="calpromo" data-calsync="1"><span class="calpromo-ic">${ICON.calendar}</span><span><b>Calendar sync</b><span class="lbl">Calls, reminders, and due dates in Google or Apple Calendar</span></span>${ICON.right}</button>
    <h2 class="section-h">Brands</h2><div class="tile" style="padding:4px 16px">${state.brands.map(a => `<div class="acct-edit"><span class="dot lg" style="background:${esc(a.color)}"></span><input class="bare" data-brand-name="${a.id}" value="${esc(a.name)}" aria-label="Brand name"></div>`).join('')}</div>
    <form id="brand-form" class="row-form"><input id="brand-in" class="input" placeholder="Add a brand" autocomplete="off" aria-label="New brand"><button class="btn" type="submit">Add</button></form>
    <h2 class="section-h">Put coconotes on your home screen</h2><p class="lbl" style="margin:0;font-size:0.824rem">${isIOS() ? 'In Safari, tap Share, then Add to Home Screen.' : 'In Chrome, open the menu, then Install app.'}</p>
    ${DEMO ? '<p class="lbl" style="margin-top:16px">Demo mode. Changes reset when you reload.</p>' : '<div style="margin-top:24px"><button class="btn quiet" data-signout="1">Sign out</button></div>'}`, 'Settings');
}
function openCalSync() {
  state.sheet = { kind: 'calsync' };
  const tok = state.calToken, url = tok ? `${cfg.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/calendar?token=${tok}` : '';
  let link;
  if (DEMO) link = `<div class="note">Your private link appears here once coconotes is connected. See SETUP, step 7.</div>`;
  else if (!tok) link = `<button class="btn solid wide" data-cal-get="1" style="margin-top:4px">Get my calendar link</button>`;
  else link = `<input id="cal-url" class="input mono-link" readonly value="${esc(url)}" aria-label="Your calendar link">
    <div class="btnrow" style="margin-top:10px"><button class="btn solid" data-cal-copy="1">Copy link</button><a class="btn quiet" href="${esc(url.replace(/^https:/, 'webcal:'))}">Add to Apple Calendar</a></div>
    <h2 class="section-h">Add it to Google Calendar</h2><ol class="steps"><li>On a computer, open calendar.google.com. It shows up on your phone after.</li><li>Next to Other calendars, click +, then From URL.</li><li>Paste your link and click Add calendar.</li></ol>
    <p class="lbl" style="margin-top:12px">Google refreshes it every few hours. Keep the link private.</p><button class="linkbtn" data-cal-reset="1">Reset my link</button>`;
  const up = state.items.filter(it => isOpen(it) && ownedByMe(it) && whenDay(it) && whenDay(it) >= today()).sort(bySoonest).slice(0, 6);
  showSheet(`${top('Calendar sync')}<h2 class="title-input" style="padding-top:0">Show it on your calendar</h2>
    <p class="lbl" style="margin:0 0 4px;font-size:0.882rem">Your calls and reminders appear at their times, and due dates as all-day items, right next to your meetings.</p>
    <h2 class="section-h">Coming up</h2><div class="tile" style="padding:4px 16px">${up.map(it => { const d = whenDay(it); return `<div class="calrow"><span class="cal-date"><b>${+d.slice(8)}</b>${esc(fmtDate(d, { month: 'short' }))}</span><span class="cal-label">${it.remind_at ? esc(clock(it.remind_at)) + ' ' : ''}${esc(it.type === 'call' && it.contact_name ? `Call ${it.contact_name}` : it.title)}</span></div>`; }).join('') || '<div class="empty" style="border:0">Nothing dated yet.</div>'}</div>
    <h2 class="section-h">Your private link</h2>${link}`, 'Calendar sync');
}
function openCapture() {
  state.sheet = { kind: 'capture' };
  const tok = state.capToken, url = tok ? `${cfg.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/capture?key=${tok}` : '';
  let link;
  if (DEMO) link = `<div class="note">Your personal capture link appears here once coconotes is connected. See SETUP, step 9.</div>`;
  else if (!tok) link = `<button class="btn solid wide" data-cap-get="1">Get my capture link</button>`;
  else link = `<input id="cap-url" class="input mono-link" readonly value="${esc(url)}" aria-label="Your capture link"><div class="btnrow" style="margin-top:10px"><button class="btn solid" data-cap-copy="1">Copy link</button><button class="linkbtn" data-cap-reset="1">Reset link</button></div>`;
  showSheet(`${top('Quick capture')}<h2 class="title-input" style="padding-top:0">Jot it down without unlocking</h2>
    <p class="lbl" style="margin:0;font-size:.882rem">A one-time Shortcut on your iPhone. Press it from the Lock Screen, the Action Button, or say "Hey Siri, Coconote." Talk, and it lands in coconotes already sorted, even mid-meeting.</p>
    <h2 class="section-h">1. Your personal link</h2>${link}
    <h2 class="section-h">2. Make the Shortcut (2 minutes)</h2>
    <ol class="steps"><li>Open the <b>Shortcuts</b> app, tap <b>+</b>, and name it <b>Coconote</b>.</li>
      <li>Add the action <b>Ask for Input</b>. Set Input Type to <b>Text</b> and the prompt to <b>New reminder</b>.</li>
      <li>Add <b>Get Contents of URL</b>. Paste your link. Tap the arrow, set Method to <b>POST</b>, Request Body to <b>JSON</b>, add a Text field named <b>text</b>, and set its value to <b>Provided Input</b>.</li>
      <li>Add <b>Show Notification</b> with <b>Contents of URL</b>, so you see what was added.</li></ol>
    <h2 class="section-h">3. Put it where your thumb is</h2>
    <ol class="steps"><li><b>Lock Screen:</b> touch and hold the Lock Screen, tap Customize, tap the flashlight or camera button, and choose Shortcut, then Coconote.</li>
      <li><b>Action Button</b> (iPhone 15 Pro and later): Settings, Action Button, Shortcut, Coconote.</li>
      <li><b>Siri:</b> just say "Hey Siri, Coconote."</li></ol>
    <p class="lbl" style="margin-top:12px">Keep the link private: anyone with it can add to your list. Depending on your settings, iPhone may ask you to unlock for the network step.</p>`, 'Quick capture');
}
async function loadCapToken(reset) {
  try {
    if (reset) { const d = await sb.from('capture_tokens').delete().eq('profile_id', state.me.id); if (d.error) throw d.error; }
    let { data, error } = await sb.from('capture_tokens').select('token').eq('profile_id', state.me.id).maybeSingle(); if (error) throw error;
    if (!data) { const r = await sb.from('capture_tokens').insert({ profile_id: state.me.id }).select('token').single(); if (r.error) throw r.error; data = r.data; }
    state.capToken = data.token; if (state.sheet?.kind === 'capture') openCapture(); if (reset) toast('New link made. Update it in your Shortcut.');
  } catch (er) { console.error(er); toast("Quick capture isn't set up yet. See SETUP, step 9."); }
}
async function loadCalToken(reset) {
  try { state.calToken = await api.calToken(reset); if (state.sheet?.kind === 'calsync') openCalSync(); if (reset) toast('New link made. The old one stopped working.'); }
  catch (er) { console.error(er); toast("Calendar sync isn't set up yet. See SETUP, step 7."); }
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, action, fn, action2, fn2) {
  const el = $('#toast'); if (!el) return;
  clearTimeout(toastTimer); el.getAnimations?.().forEach(a => a.cancel());
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button data-t="1">${esc(action)}</button>` : ''}${action2 ? `<button data-t="2">${esc(action2)}</button>` : ''}`;
  el.style.animation = 'none'; el.offsetWidth; el.style.animation = '';
  if (action) el.querySelector('[data-t="1"]').onclick = () => { el.innerHTML = ''; fn(); };
  if (action2) el.querySelector('[data-t="2"]').onclick = () => { el.innerHTML = ''; fn2(); };
  const hide = async () => { await anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' }); el.getAnimations?.().forEach(a => a.cancel()); el.innerHTML = ''; };
  const arm = () => { clearTimeout(toastTimer); toastTimer = setTimeout(hide, action ? 8000 : 5000); };
  el.onpointerenter = el.onfocusin = el.onpointerdown = () => clearTimeout(toastTimer); el.onpointerleave = el.onfocusout = arm; arm();
}
function reminderToast(it) {
  toast(`${it.nag_count ? 'Still waiting' : it.type === 'call' ? 'Time to call' : 'Reminder'}: ${it.type === 'call' && it.contact_name ? it.contact_name : it.title}`, 'Snooze', () => snoozeItem(it.id, new Date(Date.now() + 3600e3).toISOString()), 'Open', () => openItem(it.id));
  if (navigator.vibrate) navigator.vibrate([12, 60, 12]);
  $$('.bellbtn').filter(x => x.offsetParent).forEach(bell => anim(bell, [{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(0)' }], { duration: 500, easing: EASE }));
}

/* ---------- Interactions ---------- */
function go(view, transition = 'page') { state.view = view; closeSwipes(); renderView(transition); window.scrollTo(0, 0); }
async function deleteWithUndo(id) {
  const it = itemById(id); if (!it) return; const copy = { ...it };
  const wrap = $(`[data-rowwrap="${id}"]`); if (wrap && !REDUCED()) await collapse(wrap);
  await api.deleteItem(id); refresh();
  toast('Deleted', 'Undo', async () => { const back = await api.addItem(copy); if (back) { state.flash = back.id; refresh(); } });
}
function bind() {
  bindSwipe();
  document.addEventListener('click', async e => {
    if (suppressClick) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.target.matches?.('[data-ctxout]')) return closeSheet();
    const openRow = e.target.closest('.row.open'); if (openRow) { e.preventDefault(); closeSwipes(); return; }
    const b = e.target.closest('button, [data-close]'); if (!b) return;
    const d = b.dataset, s = state.sheet;
    if (d.close) return closeSheet();
    if (d.view) { if (d.view === 'all' && state.smart && state.view === 'all') { state.smart = null; return renderView('page'); } if (state.view === d.view) { window.scrollTo({ top: 0, behavior: REDUCED() ? 'auto' : 'smooth' }); return; } go(d.view); if (d.view === 'search') $('#search-input')?.focus(); return; }
    if (d.calopen) { state.calOpen = d.calopen === '1'; state.calMonth = null; renderView(); anim($('.cal-card .cal-grid:not(.wd)'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE }); return; }
    if (d.calmove) { const [y, m] = (state.calMonth || today().slice(0, 7)).split('-').map(Number), n = new Date(y, m - 1 + +d.calmove, 1); state.calMonth = toISO(n).slice(0, 7); renderView(); anim($('#cal .cal-days'), [{ opacity: 0, transform: `translateX(${+d.calmove * 20}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE }); return; }
    if (d.calday) {
      const day = d.calday, t = today();
      if (day <= t) { state.calDay = null; return go('today'); }
      state.calDay = state.calDay === day ? null : day; renderView();
      const el = document.getElementById('day-' + day); if (el && state.calDay) { el.scrollIntoView({ behavior: REDUCED() ? 'auto' : 'smooth', block: 'start' }); }
      return;
    }
    if (d.newon) return openNew({ date: d.newon });
    if ('smart' in d) { state.smart = d.smart || null; window.scrollTo(0, 0); return renderView('page'); }
    if (d.movetoday) return moveOverdueToToday();
    if (d.mstatus) { const id = s.id, ck = $('#ctx-card .check');
      $$('.ctx [data-mstatus]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
      if (ck) { ck.classList.toggle('done', d.mstatus === 'done'); ck.classList.toggle('doing', d.mstatus === 'doing'); }
      await wait(320); closeSheet(); await wait(200); return setStatus(id, d.mstatus); }
    if (d.murgent) { const it = itemById(s.id); closeSheet(); await wait(420); await api.updateItem(it.id, { urgent: !it.urgent }); return renderView(); }
    if (d.mopen) { const id = s.id; closeSheet(); await wait(260); return openItem(id); }
    if (d.mdelete) { const id = s.id; closeSheet(); await wait(420); return deleteWithUndo(id); }
    if (d.snoozeGo && s?.id) { const st = state.snoozeStops?.[+$('#sn-range').value]; if (!st) return; const id = s.id; closeSheet(); await wait(s.kind === 'menu' ? 420 : 0); return snoozeItem(id, st[1]); }
    if (d.callon && s?.kind === 'item') { const it = cur(), on = !isCall(it); await patchCur(on ? { type: 'call' } : { type: 'task', phone: null }); renderView(); return renderItem(); }
    if (d.timeon && s?.kind === 'item') { const it = cur(), dt = dateOf(it); if (timeOf(it)) return setWhen(dt, null);
      let m = 9 * 60; if (dt === today()) { const n = new Date(); m = Math.min(TMAX, Math.max(TMIN, Math.ceil((n.getHours() * 60 + n.getMinutes() + 60) / 15) * 15)); }
      return setWhen(dt, minsTo(m)); }
    if (d.tmjump && s?.kind === 'item') { return setWhen(dateOf(cur()), minsTo(+d.tmjump)); }
    if (d.snooze && s?.id) { const id = s.id; closeSheet(); return snoozeItem(id, d.snooze); }
    if (d.status && s?.kind === 'item' && s.id) { await api.updateItem(s.id, { status: d.status }); const it = cur(); if (d.status === 'done' && (ownedByOther(it) || fromOther(it))) api.log(it.id, 'done', '', fromOther(it) ? it.created_by : other().id); renderView(); return renderItem(); }
    if (d.nag && s?.kind === 'item') { const it = cur(); await patchCur({ nag: !it.nag }); b.setAttribute('aria-checked', String(!!cur().nag)); return; }
    if (d.showdone) { state.showDone[d.showdone] = !state.showDone[d.showdone]; return renderView(); }
    if (d.activity) return openActivity();
    if (d.open) { if (d.act) api.markRead([d.act]); return openItem(d.open); }
    if (d.toggle) return toggleTask(d.toggle, b);
    if (d.rurgent) { const it = itemById(d.rurgent); closeSwipes(); await api.updateItem(it.id, { urgent: !it.urgent }); return renderView(); }
    if (d.rdelete) { closeSwipes(); return deleteWithUndo(d.rdelete); }
    if (d.ascope) { state.actScope = d.ascope; return renderActivity(); }
    if (d.settings) return openSettings();
    if (d.calsync) return openCalSync();
    if (d.folder) { if (state.noteFolder === d.folder) return; state.noteFolder = d.folder; return renderView('filter'); }
    if (d.note) return openNote(d.note);
    if (d.noteTask) return noteToTask();
    if (d.noteDel) return deleteNoteUndo(state.sheet?.id);
    if (d.capture) return openCapture();
    if (d.capGet) { b.textContent = 'Making your link'; return loadCapToken(false); }
    if (d.capCopy) { const i = $('#cap-url'); try { await navigator.clipboard.writeText(i.value); } catch { i.select(); document.execCommand('copy'); } return toast('Link copied'); }
    if (d.capReset) { if (!d.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again. Your Shortcut will need the new link.'; return; } return loadCapToken(true); }
    if (d.notif) return notifClick(d.notif);
    if (d.calGet) { b.textContent = 'Making your link'; return loadCalToken(false); }
    if (d.calCopy) { const i = $('#cal-url'); try { await navigator.clipboard.writeText(i.value); } catch { i.select(); document.execCommand('copy'); } return toast('Link copied'); }
    if (d.calReset) { if (!d.armed) { b.dataset.armed = '1'; b.textContent = 'Tap again. Your current link will stop working.'; return; } return loadCalToken(true); }
    /* details */
    if ('mode' in d && s?.kind === 'item') { s.mode = d.mode || null; renderItem(); if (s.mode) $('#log-note')?.focus(); return; }
    if (d.logGo) { const it = cur(), note = ($('#log-note')?.value || '').trim();
      await api.updateItem(it.id, { done: true, notes: note ? `${it.notes ? it.notes + '\n' : ''}${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${note}` : it.notes });
      if (ownedByOther(it) || fromOther(it)) await api.log(it.id, 'call_log', note || 'Called', fromOther(it) ? it.created_by : other().id);
      if (s.follow) { const f = await api.addItem({ type: 'call', title: it.title, contact_name: it.contact_name, phone: it.phone, brand_id: it.brand_id, owner_ids: it.owner_ids, due_date: dayOf(s.follow), remind_at: s.follow }); if (f) state.flash = f.id; }
      closeSheet(); refresh(); return toast(s.follow ? `Logged. Call again ${atText(s.follow)}.` : 'Call logged'); }
    if (d.nudge) { const it = cur(); await api.log(it.id, 'request', 'Friendly nudge'); return toast(`Nudged ${otherName()}`); }
    if ('date' in d && s?.kind === 'item') { const it = cur(); return setWhen(d.date || null, d.date ? timeOf(it) : null); }
    if ('time' in d && s?.kind === 'item') { return setWhen(dateOf(cur()), d.time || null); }
    if (d.chip) {
      $$(`[data-chip="${d.chip}"]`).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      if (d.chip === 'ibrand') return patchCur({ brand_id: d.val || null });
      if (d.chip === 'nfolder') { await api.updateNote(state.sheet.id, { brand_id: d.val || null }); return renderView(); }
      if (d.chip === 'follow') s.follow = d.val || null; return;
    }
    if (d.urgent && s?.kind === 'item') { const it = cur(); await patchCur({ urgent: !it.urgent }); b.setAttribute('aria-checked', String(!!cur().urgent)); return; }
    if (d.sheetDone) { const it = cur(); if (!it.done) b.classList.add('completing'); else b.classList.remove('done'); await api.updateItem(it.id, { done: !it.done });
      if (it.done && (ownedByOther(it) || fromOther(it))) api.log(it.id, 'done', '', fromOther(it) ? it.created_by : other().id);
      renderView(); await wait(300); return renderItem(); }
    if (d.saveNew) return saveNew();
    if (d.delete) {
      if (!d.armed) { b.dataset.armed = '1'; const t = b.textContent; b.textContent = 'Tap again to delete'; setTimeout(() => { if (document.contains(b)) { delete b.dataset.armed; b.textContent = t; } }, 4000); return; }
      closeSheet(); return deleteWithUndo(d.delete);
    }
    if (d.mycolor) { await api.updateProfile({ color: d.mycolor }); renderShell(); return openSettings(); }
    if (d.signout) { await sb.auth.signOut(); location.reload(); }
  }, true);
  document.addEventListener('submit', async e => {
    const id = e.target.id;
    if (id === 'qa') return submitQuick(e);
    if (id === 'auth-form') return submitAuth(e);
    e.preventDefault();
    if (id === 'comment-form') {
      const inp = $('#c-in'), body = inp.value.trim(); if (!body) { $('#c-err').textContent = 'Write a message first.'; return inp.focus(); }
      inp.value = ''; await api.log(state.sheet.id, 'comment', body); renderItem();
      anim($('.thread')?.lastElementChild, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: EASE }); $('#c-in')?.focus();
    }
    if (id === 'brand-form') { const inp = $('#brand-in'), v = inp.value.trim(); if (!v) return inp.focus(); await api.addBrand(v); openSettings(); renderView(); toast('Brand added'); }
  });
  document.addEventListener('input', e => {
    const el = e.target, s = state.sheet;
    if (el.id === 'note-body' && s?.kind === 'note') return saveNoteSoon(s.id, el.value);
    if (el.id === 'sn-range') return onSnoozeInput(el);
    if (el.id === 'tm-range') return onTimeInput(el);
    if (el.id === 'qa-input') { $('#qa-err').textContent = ''; qaPreview(); }
    if (el.id === 'search-input') { state.search = el.value; $('#search-results').innerHTML = searchResults(); }
    if (el.classList.contains('title-input') || el.classList.contains('notes-input')) autoGrow(el);
    if (el.dataset.ifield && s?.kind === 'item' && !s.id) { s.draft[el.dataset.ifield] = el.value; if (el.dataset.ifield === 'title' && $('#c-err')) $('#c-err').textContent = ''; }
    if (el.id === 'c-in') $('#c-err').textContent = '';
  });
  document.addEventListener('change', async e => {
    const el = e.target, s = state.sheet;
    if (el.dataset.ifield && s?.kind === 'item' && s.id) {
      const f = el.dataset.ifield; let v = el.value;
      if (f === 'title') { v = v.trim(); if (!v) { el.value = cur().title; return; } }
      if (f === 'phone') { v = v.trim() || null; await patchCur({ phone: v }); return renderItem(); }
      await patchCur({ [f]: v });
    }
    if (el.dataset.ifield === 'phone' && s?.kind === 'item' && !s.id) renderItem();
    if (el.dataset.dateInput) return setWhen(el.value || null, el.value ? timeOf(cur()) : null);
    if (el.dataset.timeInput) return setWhen(dateOf(cur()) || today(), el.value || null);
    if (el.id === 'tm-range' && s?.kind === 'item') return setWhen(dateOf(cur()), minsTo(+el.value));
    if (el.id === 'me-name') { const v = el.value.trim(); if (v) { await api.updateProfile({ name: v }); renderShell(); openSettings(); toast('Name saved'); } }
    if (el.dataset.brandName) { const v = el.value.trim(); if (v) { await api.updateBrand(el.dataset.brandName, { name: v }); renderView(); } }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.sheet) return closeSheet();
    if (e.key === 'Tab' && state.sheet) { const sh = $('#sheet-root .sheet:not(.closing), #sheet-root .ctx:not(.closing)'); if (sh) { const f = $$('button, a[href], input, textarea, select', sh).filter(x => !x.disabled && x.offsetParent !== null);
      if (f.length) { const first = f[0], last = f[f.length - 1]; if (!sh.contains(document.activeElement)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } } } }
    if (e.key === 'Enter' && e.target.id === 'f-title') { e.preventDefault(); if (state.sheet && !state.sheet.id) return saveNew(); e.target.blur(); return; }
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (state.sheet) closeSheet(); go('search'); return $('#search-input').focus(); }
    if (!typing && !state.sheet && e.key === 'n') { e.preventDefault(); $('#qa-input')?.focus(); }
  });
  document.addEventListener('focusin', e => { if (e.target.id === 'qa-input') qaPreview(); });
  document.addEventListener('focusout', e => { if (e.target.id === 'qa-input') setTimeout(qaPreview, 150); });
}

/* ---------- Auth ---------- */
function renderLogin(msg = '') {
  const up = state.authMode === 'signup';
  $('#app').innerHTML = `<main class="login"><div>${MARK(64, 'login-mark')}<h1>coconotes</h1><p class="sub">Reminders and notes for two</p></div>
    <form id="auth-form" novalidate>
      ${up ? `<label class="field"><span>Your name</span><input class="input" id="a-name" autocomplete="name" placeholder="First and last name"></label>` : ''}
      <label class="field"><span>Email</span><input class="input" id="a-email" type="email" autocomplete="email" placeholder="name@company.com"></label>
      <label class="field"><span>Password</span><input class="input" id="a-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" placeholder="${up ? 'At least 8 characters' : ''}"></label>
      <div class="err" id="a-err" role="alert">${esc(msg)}</div>
      <button class="btn solid wide" type="submit">${up ? 'Create account' : 'Sign in'}</button>
      <button class="linkbtn" type="button" id="a-switch" style="margin-top:8px">${up ? 'Have an account? Sign in' : 'First time here? Create an account'}</button>
    </form><div></div></main>`;
  $('#a-switch').onclick = () => { state.authMode = up ? 'signin' : 'signup'; renderLogin(); };
}
async function submitAuth(e) {
  e.preventDefault();
  const up = state.authMode === 'signup', email = $('#a-email').value.trim().toLowerCase(), pass = $('#a-pass').value, name = up ? $('#a-name').value.trim() : '';
  const err = m => { $('#a-err').textContent = m; };
  if (up && !name) return err('Enter your name.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return err('Enter your email.');
  if (up && pass.length < 8) return err('Use at least 8 characters for your password.');
  if (!pass) return err('Enter your password.');
  err('');
  const r = up ? await sb.auth.signUp({ email, password: pass, options: { data: { name } } }) : await sb.auth.signInWithPassword({ email, password: pass });
  if (r.error) return err(up && /registered/i.test(r.error.message) ? 'That email already has an account. Sign in instead.' : /invalid/i.test(r.error.message) ? 'That email and password do not match.' : r.error.message);
  if (!r.data.session) return err('Account created. Turn off email confirmation in Supabase (SETUP, step 2), then sign in.');
  start(r.data.session);
}
async function start(session) {
  const u = session.user;
  const { data: ok } = await sb.rpc('is_team_member');
  if (!ok) { await sb.auth.signOut(); state.authMode = 'signin'; return renderLogin("This email isn't on the coconotes list yet. Add it in Supabase, then sign in again."); }
  let { data: prof } = await sb.from('profiles').select('*').eq('id', u.id).maybeSingle();
  if (!prof) {
    const { count } = await sb.from('profiles').select('id', { count: 'exact', head: true });
    prof = { id: u.id, email: u.email, name: u.user_metadata?.name || u.email.split('@')[0], color: PALETTE[(count || 0) % 2][1] };
    const { error } = await sb.from('profiles').insert(prof); if (error) console.error(error);
  }
  state.me = prof;
  try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && prof.tz !== tz) { prof.tz = tz; sb.from('profiles').update({ tz }).eq('id', prof.id).then(() => {}); } } catch {}
  try { await api.loadAll(); } catch (er) { console.error(er); return renderLogin('Could not load coconotes. Check that the setup SQL ran in Supabase.'); }
  renderShell(); openFromUrl();
  if (notifState() === 'granted') enablePush(true);
  let t; const reload = () => { clearTimeout(t); t = setTimeout(() => api.loadAll().then(refresh).catch(console.error), 200); };
  const ch = sb.channel('coconotes-live');
  ['items', 'profiles', 'brands', 'notes'].forEach(table => ch.on('postgres_changes', { event: '*', schema: 'public', table }, reload));
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, p => {
    reload(); const a = p.new; if (a?.to_id !== state.me.id || a.actor_id === state.me.id) return;
    setTimeout(() => { const it = itemById(a.item_id); if (!it) return;
      if (a.kind === 'reminder') return reminderToast(it);
      const who = nameOf(a.actor_id), msg = { request: `${who} asked you: ${it.title}`, handoff: `${who} sent you ${it.title}`, comment: `${who}: ${a.body}`, created: `${who} added ${it.title}`, done: `${who} finished ${it.title}`, call_log: `${who} logged a call` }[a.kind];
      if (msg) toast(msg, 'Open', () => openItem(a.item_id)); }, 400);
  }).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'activity' }, reload).subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reload(); });
}
function openFromUrl() { const id = new URLSearchParams(location.search).get('item'); if (id) { history.replaceState(null, '', location.pathname); setTimeout(() => openItem(id), 300); } }

/* ---------- Demo reminders fire in the page ---------- */
function demoTicker() {
  setInterval(() => {
    const nowMs = Date.now();
    const due = state.items.filter(it => it.remind_at && isOpen(it) && new Date(it.remind_at) <= new Date() && (!it.reminded || (it.nag && (it.nag_count || 0) < 3 && nowMs - new Date(it.last_fired_at || 0).getTime() > 45e3)));
    due.forEach(it => { if (it.reminded) it.nag_count = (it.nag_count || 0) + 1; it.reminded = true; it.last_fired_at = nowISO(); owners(it).forEach(o => state.activity.unshift({ id: uid(), item_id: it.id, actor_id: null, to_id: o, kind: 'reminder', body: '', read: false, created_at: nowISO() })); if (ownedByMe(it)) reminderToast(it); });
    if (due.length) { updateBadge(); if (!state.sheet) renderView(); }
  }, 5000);
}

/* ---------- Boot ---------- */
if (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) document.documentElement.classList.add('ios');
document.documentElement.dataset.theme = 'dark';
const checkTextSize = () => document.documentElement.classList.toggle('large-text', parseFloat(getComputedStyle(document.documentElement).fontSize) >= 21);
checkTextSize(); addEventListener('resize', checkTextSize);
bind();
document.fonts?.ready.then(() => placeSegs(document, true));
addEventListener('resize', () => placeSegs(document, true));
if (!window.MP_EMBED && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => { if (e.data?.open) openItem(e.data.open); });
}
if (DEMO) { seedDemo(); state.items.filter(it => it.remind_at && new Date(it.remind_at) <= new Date()).forEach(it => { it.reminded = true; }); renderShell(); demoTicker(); window.__parse = localParse; }
else sb.auth.getSession().then(({ data }) => data.session ? start(data.session) : renderLogin());
})();
