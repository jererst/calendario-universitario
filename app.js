// =============================================================
//  CALENDARIO ACADÉMICO v2 - Lógica completa
// =============================================================

const today0 = new Date();
const state = {
  currentDate: new Date(today0.getFullYear(), today0.getMonth(), 1),
  view: 'month',
  selectedDate: new Date(today0.getFullYear(), today0.getMonth(), today0.getDate()),
  events: [],
  notes: {}, // { 'YYYY-MM-DD': 'texto' } legacy
  noteLists: {}, // { 'YYYY-MM-DD': [{id, title, content, color, attachments:[], createdAt, updatedAt}] }
  tasks: [],
  categories: [],
  settings: { weekStart: 1, defaultView: 'month', showWeekNumbers: false, timeFormat: '24h' },
  editingEventId: null,
  editingTaskId: null,
  currentNoteId: null, // id de la nota seleccionada del día
  notesCollapsed: false
};

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DOW_SHORT_ES = ['L','M','X','J','V','S','D'];
const DOW_FULL_ES = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const DOW_AGENDA_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const MONTHS_SHORT_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// ===== Utilidades =====
const pad = n => n < 10 ? '0' + n : '' + n;
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parseDate = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const sameDay = (a, b) => a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
const uid = () => 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2,7);
const isWeekend = d => d.getDay() === 0 || d.getDay() === 6;
const escapeHtml = s => String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stripHtml = html => { const tmp = document.createElement('div'); tmp.innerHTML = html||''; return tmp.textContent || tmp.innerText || ''; };
const countWords = s => { const t = stripHtml(s).trim(); return t ? t.split(/\s+/).length : 0; };
const formatTime = (t, fmt) => {
  if (!t) return '';
  if (fmt === '12h') {
    const [h, m] = t.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${pad(m)} ${period}`;
  }
  return t;
};

function startOfWeek(d) {
  const r = new Date(d);
  const ws = state.settings.weekStart || 0;
  const dow = (r.getDay() - ws + 7) % 7;
  r.setDate(r.getDate() - dow);
  r.setHours(0,0,0,0);
  return r;
}

function getWeekNumber(d) {
  const date = new Date(d);
  date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 4 - (date.getDay()||7));
  const yearStart = new Date(date.getFullYear(),0,1);
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function getEventsForDate(d) {
  const dateStr = ymd(d);
  const result = [];
  state.events.forEach(e => {
    if (e.allDay) {
      // Verificar rango
      const start = e.startDate, end = e.endDate || e.startDate;
      if (dateStr >= start && dateStr <= end) result.push(e);
    } else {
      if (e.startDate === dateStr) result.push(e);
    }
  });
  return result.sort((a,b) => {
    if (a.allDay && !b.allDay) return -1;
    if (!a.allDay && b.allDay) return 1;
    return (a.startTime||'00:00').localeCompare(b.startTime||'00:00');
  });
}

function getTasksForDate(d) {
  const dateStr = ymd(d);
  return state.tasks.filter(t => t.dueDate === dateStr);
}

function getOverdueTasks() {
  const today = new Date(); today.setHours(0,0,0,0);
  return state.tasks.filter(t => !t.completed && t.dueDate && parseDate(t.dueDate) < today);
}

function getUpcomingEvents(limit = 5) {
  const now = new Date(); now.setHours(0,0,0,0);
  const futureEvents = state.events
    .map(e => {
      const start = parseDate(e.startDate);
      if (e.allDay) {
        const end = e.endDate ? parseDate(e.endDate) : start;
        if (end < now) return null;
        return { event: e, date: start };
      }
      return { event: e, date: start };
    })
    .filter(x => x && x.date >= now)
    .sort((a,b) => {
      const da = a.date.getTime() + (a.event.startTime ? parseInt(a.event.startTime.split(':')[0])*3600000 : 0);
      const db = b.date.getTime() + (b.event.startTime ? parseInt(b.event.startTime.split(':')[0])*3600000 : 0);
      return da - db;
    });
  // Generar ocurrencias considerando recurrencia
  const occurrences = [];
  state.events.forEach(e => {
    if (!e.recurring) return;
    const start = parseDate(e.startDate);
    const interval = e.recurringInterval || 1;
    const horizon = new Date(now); horizon.setFullYear(horizon.getFullYear() + 1); // buscamos 1 año hacia adelante
    let d = new Date(start);
    for (let i = 0; i < 260; i++) { // hasta ~5 años de semanas, cortado por horizonte igual
      d = new Date(start);
      d.setDate(start.getDate() + i*7*interval);
      if (d < now) continue;
      if (d > horizon) break;
      occurrences.push({ event: e, date: new Date(d) });
      if (occurrences.length > 100) break;
    }
  });
  const all = [...futureEvents, ...occurrences].sort((a,b) => a.date - b.date);
  return all.slice(0, limit);
}

function colorForCategory(catId) {
  const c = state.categories.find(c => c.id === catId);
  return c ? c.color : '#007aff';
}
function categoryName(catId) {
  const c = state.categories.find(c => c.id === catId);
  return c ? c.name : 'Sin categoría';
}

// ===== Persistencia =====
async function persist() {
  await window.api.saveData({
    events: state.events,
    notes: state.notes,
    noteLists: state.noteLists,
    tasks: state.tasks,
    categories: state.categories,
    settings: state.settings
  });
}

async function init() {
  const data = await window.api.loadData();
  state.events = data.events || [];
  state.notes = data.notes || {};
  state.noteLists = data.noteLists || {};
  state.tasks = data.tasks || [];
  state.settings = Object.assign(state.settings, data.settings || {});
  state.categories = (data.categories && data.categories.length) ? data.categories : defaultCategories();
  // Migrar notas legacy a noteLists
  Object.keys(state.notes).forEach(date => {
    if (!state.noteLists[date] || !state.noteLists[date].length) {
      const txt = state.notes[date];
      if (txt && txt.trim()) {
        state.noteLists[date] = [{
          id: uid(),
          title: '',
          content: `<p>${escapeHtml(txt).replace(/\n/g, '<br>')}</p>`,
          attachments: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }];
      }
    }
  });
  if (!data.categories || !data.categories.length) await persist();
  bindUI();
  state.view = state.settings.defaultView || 'month';
  document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  render();
  startClock();
  setInterval(checkReminders, 60000);
  setTimeout(checkReminders, 2000);
}

function defaultCategories() {
  return [
    { id: 'c1', name: 'Clases', color: '#007aff' },
    { id: 'c2', name: 'Exámenes', color: '#ff3b30' },
    { id: 'c3', name: 'Trabajos', color: '#ff9500' },
    { id: 'c4', name: 'Estudios', color: '#34c759' },
    { id: 'c5', name: 'Personal', color: '#af52de' },
    { id: 'c6', name: 'Universidad', color: '#5856d6' },
    { id: 'c7', name: 'Salud', color: '#ff2d92' },
    { id: 'c8', name: 'Reuniones', color: '#5ac8fa' }
  ];
}

// ===== Render =====
function render() {
  renderMiniCal();
  renderCategories();
  renderUpcoming();
  renderMain();
  renderNotes();
  document.getElementById('current-period').textContent = periodLabel();
  document.getElementById('data-path-display').textContent = '';
}

function periodLabel() {
  const d = state.currentDate;
  if (state.view === 'month') return `${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
  if (state.view === 'week' || state.view === 'day') {
    const ws = state.view === 'day' ? new Date(d) : startOfWeek(d);
    if (state.view === 'day') {
      return `${DOW_AGENDA_ES[d.getDay()]}, ${d.getDate()} de ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
    }
    const we = new Date(ws); we.setDate(we.getDate()+6);
    if (ws.getMonth() === we.getMonth()) {
      return `${ws.getDate()} – ${we.getDate()} ${MONTHS_ES[ws.getMonth()]} ${ws.getFullYear()}`;
    }
    return `${ws.getDate()} ${MONTHS_SHORT_ES[ws.getMonth()]} – ${we.getDate()} ${MONTHS_SHORT_ES[we.getMonth()]} ${ws.getFullYear()}`;
  }
  if (state.view === 'agenda') return `Agenda · ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
  if (state.view === 'tasks') return 'Tareas';
  return '';
}

// ----- Sidebar mini calendario -----
function renderMiniCal() {
  const container = document.getElementById('mini-cal');
  const d = state.currentDate;
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const firstDow = (first.getDay() - (state.settings.weekStart||0) + 7) % 7;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const ws = state.settings.weekStart || 0;
  const dowOrder = Array.from({length:7}, (_, i) => (i + ws) % 7);
  const today = new Date();

  let html = `
    <div class="mini-cal-header">
      <div class="mini-cal-title">${MONTHS_ES[month]} ${year}</div>
      <div class="mini-cal-nav">
        <button id="mini-prev">‹</button>
        <button id="mini-next">›</button>
      </div>
    </div>
    <div class="mini-cal-grid">
      ${dowOrder.map(dow => `<div class="mini-cal-dow">${DOW_SHORT_ES[dow]}</div>`).join('')}
  `;

  for (let i = firstDow - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const date = new Date(year, month-1, day);
    html += miniDayCell(date, true);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    html += miniDayCell(date, false);
  }
  const totalCells = firstDow + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let day = 1; day <= remaining; day++) {
    const date = new Date(year, month+1, day);
    html += miniDayCell(date, true);
  }
  html += '</div>';
  container.innerHTML = html;

  document.getElementById('mini-prev').onclick = () => {
    state.currentDate = new Date(year, month-1, 1);
    render();
  };
  document.getElementById('mini-next').onclick = () => {
    state.currentDate = new Date(year, month+1, 1);
    render();
  };
}

function miniDayCell(date, otherMonth) {
  const today = sameDay(date, new Date());
  const hasEvent = getEventsForDate(date).length > 0 || getTasksForDate(date).length > 0;
  const selected = sameDay(date, state.selectedDate);
  const cls = ['mini-cal-day'];
  if (otherMonth) cls.push('other-month');
  if (today) cls.push('today');
  if (hasEvent) cls.push('has-event');
  if (selected && !today) cls.push('selected');
  return `<div class="${cls.join(' ')}" data-date="${ymd(date)}" style="${selected && !today ? 'background:var(--bg-active)' : ''}">${date.getDate()}</div>`;
}

// ----- Categorías -----
function renderCategories() {
  const list = document.getElementById('categories-list');
  list.innerHTML = state.categories.map(c => {
    const count = state.events.filter(e => e.categoryId === c.id).length;
    return `
      <div class="cat-item" data-cat="${c.id}">
        <div class="cat-dot" style="background:${c.color}"></div>
        <div class="cat-name">${escapeHtml(c.name)}</div>
        <div class="cat-count">${count}</div>
      </div>
    `;
  }).join('');
}

function renderUpcoming() {
  const container = document.getElementById('upcoming-events');
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate()+1);
  const items = getUpcomingEvents(5);
  if (!items.length) {
    container.innerHTML = '<div class="empty-mini">Sin eventos próximos</div>';
    return;
  }
  container.innerHTML = items.map(({event, date}) => {
    const color = colorForCategory(event.categoryId);
    let dateLabel = `${date.getDate()}/${date.getMonth()+1}`;
    let cls = '';
    if (sameDay(date, today)) { dateLabel = 'Hoy'; cls = 'today'; }
    else if (sameDay(date, tomorrow)) { dateLabel = 'Mañ'; cls = 'tomorrow'; }
    return `<div class="upcoming-item" data-event="${event.id}" data-date="${ymd(date)}">
      <div class="upcoming-date ${cls}">${dateLabel}</div>
      <div class="cat-dot" style="background:${color}"></div>
      <div class="upcoming-title">${escapeHtml(event.title)}</div>
    </div>`;
  }).join('');
  container.querySelectorAll('.upcoming-item').forEach(el => {
    el.onclick = () => {
      state.currentDate = parseDate(el.dataset.date);
      state.selectedDate = parseDate(el.dataset.date);
      state.view = 'month';
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === 'month'));
      render();
    };
  });
}

// ----- Vista principal -----
function renderMain() {
  const c = document.getElementById('calendar-content');
  if (state.view === 'month') c.innerHTML = renderMonthView();
  else if (state.view === 'week') c.innerHTML = renderWeekView();
  else if (state.view === 'day') c.innerHTML = renderDayView();
  else if (state.view === 'agenda') c.innerHTML = renderAgendaView();
  else if (state.view === 'tasks') c.innerHTML = renderTasksView();
  attachMainHandlers();
}

function renderMonthView() {
  const d = state.currentDate;
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1);
  const ws = state.settings.weekStart || 0;
  const firstDow = (first.getDay() - ws + 7) % 7;
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const dowOrder = Array.from({length:7}, (_, i) => (i + ws) % 7);

  let html = `<div class="month-grid">
    <div class="month-dow-row">
      ${dowOrder.map(dow => `<div class="month-dow ${(dow===0||dow===6)?'weekend':''}">${DOW_FULL_ES[dow]}</div>`).join('')}
    </div>
    <div class="month-weeks">`;

  let dayCounter = 1;
  let nextMonthDay = 1;
  for (let week = 0; week < 6; week++) {
    html += '<div class="month-week">';
    for (let dow = 0; dow < 7; dow++) {
      const cellIndex = week * 7 + dow;
      let date, otherMonth = false;
      if (cellIndex < firstDow) {
        date = new Date(year, month-1, daysInPrev - (firstDow - cellIndex - 1));
        otherMonth = true;
      } else if (dayCounter <= daysInMonth) {
        date = new Date(year, month, dayCounter++);
      } else {
        date = new Date(year, month+1, nextMonthDay++);
        otherMonth = true;
      }
      html += renderMonthDay(date, otherMonth);
    }
    html += '</div>';
    if (dayCounter > daysInMonth && nextMonthDay > 7) break;
  }
  html += '</div></div>';
  return html;
}

function renderMonthDay(date, otherMonth) {
  const today = sameDay(date, new Date());
  const selected = sameDay(date, state.selectedDate);
  const dow = date.getDay();
  const cls = ['month-day'];
  if (otherMonth) cls.push('other-month');
  if (today) cls.push('today');
  if (selected) cls.push('selected');
  if (dow === 0 || dow === 6) cls.push('weekend');

  const events = getEventsForDate(date);
  const tasks = getTasksForDate(date);
  const maxShow = 3;
  let eventsHtml = '';
  events.slice(0, maxShow).forEach(e => {
    const color = colorForCategory(e.categoryId);
    const timeStr = e.allDay ? '' : (e.startTime ? formatTime(e.startTime, state.settings.timeFormat) + ' ' : '');
    const prioDot = e.priority === 'high' ? '<span class="prio-dot"></span>' : '';
    eventsHtml += `<div class="event-pill" data-event="${e.id}" style="background:${color}">${prioDot}${escapeHtml(timeStr + e.title)}</div>`;
  });
  // Mostrar tareas como puntos
  if (tasks.length) {
    eventsHtml += tasks.slice(0, 2).map(t => {
      const color = colorForCategory(t.categoryId);
      return `<div class="event-pill" data-task="${t.id}" style="background:${color};opacity:${t.completed?0.5:0.85}">${t.completed?'✓ ':''}${escapeHtml(t.title)}</div>`;
    }).join('');
  }
  const totalShown = Math.min(events.length, maxShow) + Math.min(tasks.length, 2);
  const more = events.length + tasks.length - totalShown;
  if (more > 0) eventsHtml += `<div class="event-more">+${more} más</div>`;

  return `<div class="${cls.join(' ')}" data-date="${ymd(date)}">
    <div class="day-header-row">
      <div class="day-number">${date.getDate()}</div>
    </div>
    <div class="day-events">${eventsHtml}</div>
  </div>`;
}

function renderWeekView() {
  const ws = startOfWeek(state.currentDate);
  const today = new Date();
  const wsStart = state.settings.weekStart || 0;
  const dowOrder = Array.from({length:7}, (_, i) => (i + wsStart) % 7);

  let html = `<div class="week-view">
    <div class="week-header-row">
      <div></div>`;
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate()+i);
    const isToday = sameDay(d, today);
    const isOtherMonth = d.getMonth() !== state.currentDate.getMonth();
    const cls = isToday ? 'week-day-num today-circle' : 'week-day-num' + (isOtherMonth ? ' other-month' : '');
    html += `<div class="week-header-cell">
      <div class="week-dow">${DOW_FULL_ES[dowOrder[i]]}</div>
      <div><span class="${cls}">${d.getDate()}</span></div>
    </div>`;
  }
  html += `</div><div class="week-body"><div class="time-col">`;

  for (let h = 7; h < 22; h++) {
    html += `<div class="time-slot-label"><span>${pad(h)}:00</span></div>`;
  }
  html += `</div>`;

  for (let i = 0; i < 7; i++) {
    const d = new Date(ws); d.setDate(ws.getDate()+i);
    const isToday = sameDay(d, today);
    html += `<div class="day-col ${isToday?'today':''}" data-date="${ymd(d)}">`;
    for (let h = 7; h < 22; h++) {
      html += `<div class="hour-slot" data-date="${ymd(d)}" data-hour="${h}"></div>`;
    }
    const events = getEventsForDate(d);
    events.forEach(e => {
      if (e.allDay) return;
      const startH = e.startTime ? parseInt(e.startTime.split(':')[0]) + parseInt(e.startTime.split(':')[1])/60 : 9;
      const endH = e.endTime ? parseInt(e.endTime.split(':')[0]) + parseInt(e.endTime.split(':')[1])/60 : startH+1;
      if (endH <= 7 || startH >= 22) return;
      const top = (Math.max(startH, 7) - 7) * 50;
      const height = (Math.min(endH, 22) - Math.max(startH, 7)) * 50 - 2;
      const color = colorForCategory(e.categoryId);
      html += `<div class="week-event" data-event="${e.id}" style="top:${top}px;height:${height}px;background:${color}">
        <div class="week-event-title">${escapeHtml(e.title)}</div>
        <div class="week-event-time">${formatTime(e.startTime,state.settings.timeFormat)} – ${formatTime(e.endTime,state.settings.timeFormat)}</div>
        ${e.location?`<div class="week-event-loc">${escapeHtml(e.location)}</div>`:''}
      </div>`;
    });
    html += `</div>`;
  }
  html += `</div></div>`;
  return html;
}

function renderDayView() {
  const d = state.currentDate;
  const events = getEventsForDate(d);
  const tasks = getTasksForDate(d);
  const notes = state.noteLists[ymd(d)] || [];

  let html = `<div class="day-view">
    <div>
      <h2 style="margin-bottom:12px">Eventos del día</h2>
      <div class="day-events-list">`;
  if (events.length) {
    events.forEach(e => {
      const color = colorForCategory(e.categoryId);
      const time = e.allDay ? 'Todo el día' : `${formatTime(e.startTime,state.settings.timeFormat)} – ${formatTime(e.endTime,state.settings.timeFormat)}`;
      html += `<div class="day-event-card" data-event="${e.id}" style="border-left-color:${color}">
        <div class="day-event-time">${time} · ${escapeHtml(categoryName(e.categoryId))}</div>
        <div class="day-event-title">${escapeHtml(e.title)}</div>
        ${e.location?`<div class="day-event-meta">📍 ${escapeHtml(e.location)}</div>`:''}
        ${e.description?`<div class="day-event-desc">${escapeHtml(e.description)}</div>`:''}
      </div>`;
    });
  } else {
    html += '<div style="color:var(--text-tertiary);text-align:center;padding:20px">No hay eventos</div>';
  }
  html += `</div></div>
    <div class="day-side">
      <div>
        <h2 style="margin-bottom:12px">Tareas pendientes</h2>`;
  if (tasks.length) {
    html += tasks.map(t => {
      const color = colorForCategory(t.categoryId);
      return `<div class="task-item" data-task="${t.id}">
        <div class="task-checkbox ${t.completed?'checked':''}" data-task-toggle="${t.id}"></div>
        <div class="task-content">
          <div class="task-title ${t.completed?'completed':''}">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="task-prio ${t.priority}">${t.priority==='high'?'Alta':t.priority==='medium'?'Media':'Baja'}</span>
            <span>${escapeHtml(categoryName(t.categoryId))}</span>
          </div>
        </div>
      </div>`;
    }).join('');
  } else {
    html += '<div style="color:var(--text-tertiary);text-align:center;padding:20px">No hay tareas</div>';
  }
  html += `</div>
      <div>
        <h2 style="margin-bottom:12px">Notas del día</h2>
        <div style="background:var(--bg-secondary);border-radius:8px;padding:12px;max-height:300px;overflow:auto">`;
  if (notes.length) {
    html += notes.map(n => `<div style="padding:8px;border-bottom:1px solid var(--border)">
      <strong>${escapeHtml(n.title || 'Sin título')}</strong>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${stripHtml(n.content).substring(0, 120)}${stripHtml(n.content).length>120?'...':''}</div>
    </div>`).join('');
  } else {
    html += '<div style="color:var(--text-tertiary);text-align:center;padding:20px">Sin notas</div>';
  }
  html += `</div></div>
    </div>
  </div>`;
  return html;
}

function renderAgendaView() {
  const d = state.currentDate;
  const year = d.getFullYear(), month = d.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = new Date();
  const allEvents = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const events = getEventsForDate(date);
    if (events.length) allEvents.push({ date, events });
  }
  if (!allEvents.length) {
    return `<div class="agenda-view"><div class="agenda-empty">No hay eventos este mes.<br>Haz clic en "+ Evento" para crear uno.</div></div>`;
  }
  let html = '<div class="agenda-view">';
  allEvents.forEach(group => {
    const isToday = sameDay(group.date, today);
    html += `<div class="agenda-day-group">
      <div class="agenda-day-header ${isToday?'today':''}">
        <span class="agenda-date-big">${group.date.getDate()}</span>
        ${DOW_AGENDA_ES[group.date.getDay()]}${isToday?' · Hoy':''}
      </div>`;
    group.events.forEach(e => {
      const color = colorForCategory(e.categoryId);
      const time = e.allDay ? 'Todo el día' : `${formatTime(e.startTime,state.settings.timeFormat)} – ${formatTime(e.endTime,state.settings.timeFormat)}`;
      html += `<div class="agenda-event" data-event="${e.id}">
        <div class="agenda-color-bar" style="background:${color}"></div>
        <div class="agenda-time">${time}</div>
        <div class="agenda-content">
          <div class="agenda-title">${escapeHtml(e.title)}</div>
          <div class="agenda-meta">${escapeHtml(categoryName(e.categoryId))}${e.location?' · 📍 '+escapeHtml(e.location):''}${e.priority==='high'?' · 🔥 Alta':''}</div>
        </div>
      </div>`;
    });
    html += `</div>`;
  });
  html += '</div>';
  return html;
}

function renderTasksView() {
  const today = new Date(); today.setHours(0,0,0,0);
  const groups = {
    overdue: [],
    today: [],
    upcoming: [],
    nodate: [],
    completed: []
  };
  state.tasks.forEach(t => {
    if (t.completed) groups.completed.push(t);
    else if (!t.dueDate) groups.nodate.push(t);
    else {
      const d = parseDate(t.dueDate);
      if (d < today) groups.overdue.push(t);
      else if (sameDay(d, today)) groups.today.push(t);
      else groups.upcoming.push(t);
    }
  });

  const sortBy = arr => arr.sort((a,b) => {
    const pOrder = { high: 0, medium: 1, low: 2 };
    if (pOrder[a.priority] !== pOrder[b.priority]) return pOrder[a.priority] - pOrder[b.priority];
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return a.title.localeCompare(b.title);
  });
  Object.values(groups).forEach(sortBy);

  let html = `<div class="tasks-view">
    <div class="tasks-header">
      <h2>Tareas</h2>
      <button class="tbtn primary" id="btn-add-task-big">+ Nueva tarea</button>
    </div>
  `;

  const renderGroup = (title, items, opts = {}) => {
    if (!items.length) return '';
    let h = `<div class="task-group"><div class="task-group-title">${title} (${items.length})</div>`;
    items.forEach(t => {
      const color = colorForCategory(t.categoryId);
      const due = t.dueDate ? parseDate(t.dueDate) : null;
      let dueLabel = '';
      if (due) {
        const days = Math.round((due - today)/(1000*60*60*24));
        if (opts.overdue) dueLabel = `<span class="task-overdue">Vencida hace ${Math.abs(days)}d · ${due.getDate()}/${due.getMonth()+1}</span>`;
        else if (days === 0) dueLabel = `<span>Vence hoy</span>`;
        else if (days === 1) dueLabel = `<span>Mañana</span>`;
        else if (days <= 7) dueLabel = `<span>${DOW_AGENDA_ES[due.getDay()]} ${due.getDate()}/${due.getMonth()+1}</span>`;
        else dueLabel = `<span>${due.getDate()}/${due.getMonth()+1}</span>`;
      }
      h += `<div class="task-item" data-task="${t.id}">
        <div class="task-checkbox ${t.completed?'checked':''}" data-task-toggle="${t.id}"></div>
        <div class="cat-dot" style="background:${color}"></div>
        <div class="task-content">
          <div class="task-title ${t.completed?'completed':''}">${escapeHtml(t.title)}</div>
          <div class="task-meta">
            <span class="task-prio ${t.priority}">${t.priority==='high'?'Alta':t.priority==='medium'?'Media':'Baja'}</span>
            ${dueLabel}
            <span>${escapeHtml(categoryName(t.categoryId))}</span>
          </div>
        </div>
      </div>`;
    });
    return h + '</div>';
  };

  html += renderGroup('Vencidas', groups.overdue, { overdue: true });
  html += renderGroup('Hoy', groups.today);
  html += renderGroup('Próximas', groups.upcoming);
  html += renderGroup('Sin fecha', groups.nodate);
  html += renderGroup('Completadas', groups.completed);

  if (!state.tasks.length) {
    html += '<div class="agenda-empty">No tienes tareas. Crea una con "+ Tarea".</div>';
  }
  html += '</div>';
  return html;
}

function attachMainHandlers() {
  document.querySelectorAll('.month-day').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('.event-pill')) return;
      state.selectedDate = parseDate(el.dataset.date);
      state.currentDate = new Date(state.selectedDate);
      renderMain();
      renderMiniCal();
      renderUpcoming();
      renderNotes();
    };
  });
  document.querySelectorAll('.event-pill, .week-event, .agenda-event, .day-event-card, .upcoming-item').forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      const id = el.dataset.event;
      if (id) openEventModal(state.events.find(e => e.id === id));
      else if (el.dataset.task) openTaskModal(state.tasks.find(t => t.id === el.dataset.task));
    };
  });
  document.querySelectorAll('.day-col').forEach(el => {
    el.onclick = (ev) => {
      if (ev.target.closest('.week-event')) return;
      state.selectedDate = parseDate(el.dataset.date);
      renderMain();
      renderNotes();
    };
  });
  document.querySelectorAll('.hour-slot').forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      const date = parseDate(el.dataset.date);
      openEventModal(null, { date, hour: parseInt(el.dataset.hour) });
    };
  });
  document.querySelectorAll('.mini-cal-day').forEach(el => {
    el.onclick = () => {
      const d = parseDate(el.dataset.date);
      state.selectedDate = d;
      state.currentDate = new Date(d.getFullYear(), d.getMonth(), 1);
      renderMain();
      renderNotes();
      renderUpcoming();
    };
  });
  document.querySelectorAll('[data-task]').forEach(el => {
    el.ondblclick = (ev) => {
      ev.stopPropagation();
      const id = el.dataset.task;
      const t = state.tasks.find(x => x.id === id);
      if (t) openTaskModal(t);
    };
  });
  document.querySelectorAll('[data-task-toggle]').forEach(el => {
    el.onclick = (ev) => {
      ev.stopPropagation();
      const id = el.dataset.taskToggle;
      const t = state.tasks.find(x => x.id === id);
      if (t) {
        t.completed = !t.completed;
        t.completedAt = t.completed ? Date.now() : null;
        persist();
        renderMain();
        renderUpcoming();
        if (state.view === 'day') renderNotes();
        showToast(t.completed ? '✓ Tarea completada' : 'Tarea reactivada');
      }
    };
  });
  const btnAddTask = document.getElementById('btn-add-task-big');
  if (btnAddTask) btnAddTask.onclick = () => openTaskModal();
}

// ----- Notas -----
function renderNotes() {
  const dateKey = ymd(state.selectedDate);
  const opts = { weekday:'long', day:'numeric', month:'long', year:'numeric' };
  document.getElementById('notes-date-label').textContent = state.selectedDate.toLocaleDateString('es-ES', opts);
  
  const events = getEventsForDate(state.selectedDate);
  const tasks = getTasksForDate(state.selectedDate);
  const dayNotes = state.noteLists[dateKey] || [];
  document.getElementById('notes-day-events-count').textContent =
    `${events.length} evento${events.length!==1?'s':''} · ${tasks.length} tarea${tasks.length!==1?'s':''} · ${dayNotes.length} nota${dayNotes.length!==1?'s':''}`;

  // Tabs
  const tabsEl = document.getElementById('notes-tabs');
  // Tabs: días con notas
  const noteDates = Object.keys(state.noteLists)
    .filter(d => state.noteLists[d] && state.noteLists[d].length)
    .sort();
  if (dayNotes.length && !noteDates.includes(dateKey)) noteDates.unshift(dateKey);
  
  let tabsHtml = noteDates.slice(-8).reverse().map(d => {
    const dd = parseDate(d);
    const lbl = `${dd.getDate()}/${dd.getMonth()+1}`;
    const isActive = d === dateKey;
    return `<div class="note-tab ${isActive?'active':''}" data-date="${d}">${lbl}${dayNotes.length>1?` <span class="note-close" data-close-date="${d}">✕</span>`:''}</div>`;
  }).join('');
  tabsEl.innerHTML = tabsHtml;
  tabsEl.querySelectorAll('.note-tab').forEach(t => {
    t.onclick = (e) => {
      if (e.target.dataset.closeDate) {
        // borrar día
        const d = e.target.dataset.closeDate;
        if (confirm(`¿Borrar todas las notas del ${d}?`)) {
          delete state.noteLists[d];
          if (ymd(state.selectedDate) === d) state.selectedDate = new Date();
          persist();
          renderNotes();
        }
        return;
      }
      state.selectedDate = parseDate(t.dataset.date);
      renderMain();
      renderMiniCal();
      renderNotes();
    };
  });

  // Cargar nota activa
  const empty = document.getElementById('notes-empty');
  const editor = document.getElementById('note-editor');
  if (!dayNotes.length) {
    empty.style.display = 'flex';
    editor.style.display = 'none';
    state.currentNoteId = null;
  } else {
    empty.style.display = 'none';
    editor.style.display = 'flex';
    let note = dayNotes.find(n => n.id === state.currentNoteId);
    if (!note) {
      note = dayNotes[0];
      state.currentNoteId = note.id;
    }
    document.getElementById('note-title').value = note.title || '';
    const rich = document.getElementById('note-rich');
    if (rich.innerHTML !== note.content) {
      rich.innerHTML = note.content || '';
    }
    renderNoteAttachments(note.attachments || []);
    bindNoteEditor();
  }
  updateNotesStatus();
}

let noteBindInited = false;
function bindNoteEditor() {
  const rich = document.getElementById('note-rich');
  const title = document.getElementById('note-title');
  if (rich._binded) return;
  rich._binded = true;
  
  const saveNote = () => {
    if (!state.currentNoteId) return;
    const dateKey = ymd(state.selectedDate);
    const list = state.noteLists[dateKey] || [];
    const note = list.find(n => n.id === state.currentNoteId);
    if (note) {
      note.title = title.value;
      note.content = rich.innerHTML;
      note.updatedAt = Date.now();
      clearTimeout(saveNote._t);
      saveNote._t = setTimeout(persist, 500);
      updateNotesStatus();
    }
  };
  
  rich.oninput = saveNote;
  title.oninput = saveNote;
  rich.onblur = () => { persist(); };
}

function renderNoteAttachments(attachments) {
  const c = document.getElementById('note-attachments');
  if (!attachments.length) { c.innerHTML = ''; return; }
  c.innerHTML = attachments.map((a, i) => `
    <div class="attachment-chip" data-att="${i}">
      📎 ${escapeHtml(a.name)} <span class="att-del" data-del-att="${i}">✕</span>
    </div>
  `).join('');
  c.querySelectorAll('.attachment-chip').forEach(chip => {
    chip.onclick = async (e) => {
      if (e.target.dataset.delAtt !== undefined) {
        e.stopPropagation();
        const i = parseInt(e.target.dataset.delAtt);
        const dateKey = ymd(state.selectedDate);
        const list = state.noteLists[dateKey] || [];
        const note = list.find(n => n.id === state.currentNoteId);
        if (note && note.attachments) {
          note.attachments.splice(i, 1);
          persist();
          renderNoteAttachments(note.attachments);
        }
        return;
      }
      const i = parseInt(chip.dataset.att);
      const dateKey = ymd(state.selectedDate);
      const list = state.noteLists[dateKey] || [];
      const note = list.find(n => n.id === state.currentNoteId);
      if (note && note.attachments[i]) {
        await window.api.openAttachment(note.attachments[i].path);
      }
    };
  });
}

function updateNotesStatus() {
  const v = document.getElementById('note-rich').innerText || '';
  const wc = countWords(v);
  document.getElementById('notes-count').textContent = `${wc} palabra${wc!==1?'s':''}`;
  document.getElementById('notes-status').textContent = 'Guardado';
  document.getElementById('notes-status').className = '';
}

document.getElementById('btn-clear-notes').onclick = () => {
  const dateKey = ymd(state.selectedDate);
  if (!state.noteLists[dateKey] || !state.noteLists[dateKey].length) {
    showToast('No hay notas para borrar');
    return;
  }
  if (!confirm('¿Borrar todas las notas de este día?')) return;
  delete state.noteLists[dateKey];
  state.currentNoteId = null;
  persist();
  renderNotes();
  showToast('Notas borradas');
};

document.getElementById('btn-new-note').onclick = () => {
  const dateKey = ymd(state.selectedDate);
  if (!state.noteLists[dateKey]) state.noteLists[dateKey] = [];
  const newNote = {
    id: uid(),
    title: '',
    content: '',
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.noteLists[dateKey].push(newNote);
  state.currentNoteId = newNote.id;
  persist();
  renderNotes();
  setTimeout(() => document.getElementById('note-title').focus(), 50);
};

document.getElementById('btn-create-first-note').onclick = () => {
  document.getElementById('btn-new-note').click();
};

document.getElementById('btn-toggle-notes').onclick = () => {
  state.notesCollapsed = !state.notesCollapsed;
  document.querySelector('.main').classList.toggle('notes-collapsed', state.notesCollapsed);
};

document.getElementById('btn-export-note').onclick = async () => {
  const dateKey = ymd(state.selectedDate);
  const list = state.noteLists[dateKey] || [];
  if (!list.length) { showToast('No hay notas para exportar'); return; }
  const note = list.find(n => n.id === state.currentNoteId) || list[0];
  const content = `${note.title}\n${'='.repeat(note.title.length)}\n\n${stripHtml(note.content)}`;
  const result = await window.api.exportNote({ content, title: note.title || dateKey });
  if (result.ok) showToast('✓ Nota exportada');
};

// Toolbar de notas
document.querySelectorAll('.ntb').forEach(btn => {
  btn.onclick = (e) => {
    e.preventDefault();
    const cmd = btn.dataset.cmd;
    const val = btn.dataset.val;
    if (cmd === 'createLink') {
      const url = prompt('URL:');
      if (url) document.execCommand(cmd, false, url);
    } else {
      document.execCommand(cmd, false, val || null);
    }
    document.getElementById('note-rich').focus();
  };
});

document.getElementById('nt-color').oninput = (e) => {
  document.execCommand('foreColor', false, e.target.value);
  document.getElementById('note-rich').focus();
};

document.getElementById('btn-attach').onclick = async () => {
  if (!state.currentNoteId) { showToast('Crea una nota primero'); return; }
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.onchange = async () => {
    const dateKey = ymd(state.selectedDate);
    const list = state.noteLists[dateKey] || [];
    const note = list.find(n => n.id === state.currentNoteId);
    if (!note) return;
    note.attachments = note.attachments || [];
    for (const f of input.files) {
      const buffer = await f.arrayBuffer();
      const res = await window.api.saveAttachment({ name: f.name, buffer: Array.from(new Uint8Array(buffer)) });
      if (res.ok) {
        note.attachments.push({ name: f.name, path: res.path, size: f.size });
      }
    }
    persist();
    renderNoteAttachments(note.attachments);
    showToast(`✓ ${input.files.length} archivo${input.files.length!==1?'s':''} adjuntado${input.files.length!==1?'s':''}`);
  };
  input.click();
};

// ===== Modal evento =====
let reminderIdCounter = 0;
function openEventModal(event, preset = {}) {
  state.editingEventId = event ? event.id : null;
  const modal = document.getElementById('event-modal');
  document.getElementById('event-modal-title').textContent = event ? 'Editar evento' : 'Nuevo evento';
  document.getElementById('event-delete').style.display = event ? 'inline-block' : 'none';

  const startDate = event ? parseDate(event.startDate) : (preset.date || state.selectedDate);
  const startTime = event ? event.startTime : (preset.hour !== undefined ? pad(preset.hour)+':00' : '09:00');
  const endDate = event && event.endDate ? parseDate(event.endDate) : startDate;
  const endTime = event ? event.endTime : (preset.hour !== undefined ? pad(Math.min(preset.hour+1,22))+':00' : '10:00');

  document.getElementById('event-title').value = event ? event.title : '';
  document.getElementById('event-start-date').value = ymd(startDate);
  document.getElementById('event-start-time').value = startTime;
  document.getElementById('event-end-date').value = ymd(endDate);
  document.getElementById('event-end-time').value = endTime;
  document.getElementById('event-location').value = event ? (event.location||'') : '';
  document.getElementById('event-description').value = event ? (event.description||'') : '';
  document.getElementById('event-all-day').checked = event ? !!event.allDay : false;
  document.getElementById('event-recurring').checked = event ? !!event.recurring : false;
  document.getElementById('event-priority').value = event ? (event.priority||'medium') : 'medium';
  document.getElementById('event-repeat-weeks').value = event ? (event.recurringInterval||2) : 2;
  document.getElementById('recurring-options').style.display = event && event.recurring ? 'block' : 'none';

  // Recordatorios
  reminderIdCounter = 0;
  const reminders = event ? (event.reminders || []) : [{ offset: 30, unit: 'minutes' }];
  renderReminders(reminders);

  // Color picker
  const picker = document.getElementById('event-color-picker');
  const selectedCat = event ? event.categoryId : (state.categories[0] && state.categories[0].id);
  picker.innerHTML = state.categories.map(c => `
    <div class="color-swatch ${c.id===selectedCat?'selected':''}" data-cat="${c.id}" style="background:${c.color}" title="${escapeHtml(c.name)}"></div>
  `).join('');
  picker.querySelectorAll('.color-swatch').forEach(sw => {
    sw.onclick = () => {
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
  });

  modal.classList.add('active');
  setTimeout(() => document.getElementById('event-title').focus(), 50);
}

function renderReminders(reminders) {
  const c = document.getElementById('event-reminders');
  c.innerHTML = reminders.map((r, i) => `
    <div class="reminder-item" data-id="${i}">
      <span>⏰</span>
      <input type="number" min="0" value="${r.offset||0}" data-field="offset" style="width:60px">
      <select data-field="unit">
        <option value="minutes" ${r.unit==='minutes'?'selected':''}>minutos antes</option>
        <option value="hours" ${r.unit==='hours'?'selected':''}>horas antes</option>
        <option value="days" ${r.unit==='days'?'selected':''}>días antes</option>
        <option value="weeks" ${r.unit==='weeks'?'selected':''}>semanas antes</option>
      </select>
      <button class="rem-del" data-act="del">✕</button>
    </div>
  `).join('');
  c.querySelectorAll('.reminder-item').forEach(item => {
    item.querySelector('[data-act=del]').onclick = () => item.remove();
  });
}

document.getElementById('btn-add-reminder').onclick = () => {
  const c = document.getElementById('event-reminders');
  const item = document.createElement('div');
  item.className = 'reminder-item';
  item.innerHTML = `
    <span>⏰</span>
    <input type="number" min="0" value="15" style="width:60px">
    <select>
      <option value="minutes" selected>minutos antes</option>
      <option value="hours">horas antes</option>
      <option value="days">días antes</option>
      <option value="weeks">semanas antes</option>
    </select>
    <button class="rem-del">✕</button>
  `;
  item.querySelector('.rem-del').onclick = () => item.remove();
  c.appendChild(item);
};

function closeEventModal() {
  document.getElementById('event-modal').classList.remove('active');
  state.editingEventId = null;
}

function saveEvent() {
  const title = document.getElementById('event-title').value.trim();
  if (!title) { showToast('Pon un título', 'error'); return; }
  const startDate = document.getElementById('event-start-date').value;
  const endDate = document.getElementById('event-end-date').value;
  const startTime = document.getElementById('event-start-time').value;
  const endTime = document.getElementById('event-end-time').value;
  const allDay = document.getElementById('event-all-day').checked;
  const recurring = document.getElementById('event-recurring').checked;
  const recurringInterval = parseInt(document.getElementById('event-repeat-weeks').value);
  const location = document.getElementById('event-location').value.trim();
  const description = document.getElementById('event-description').value.trim();
  const priority = document.getElementById('event-priority').value;
  const sel = document.querySelector('#event-color-picker .color-swatch.selected');
  const categoryId = sel ? sel.dataset.cat : state.categories[0].id;

  const reminders = [];
  document.querySelectorAll('#event-reminders .reminder-item').forEach(item => {
    const offset = parseInt(item.querySelector('input').value) || 0;
    const unit = item.querySelector('select').value;
    if (offset > 0) reminders.push({ offset, unit });
  });

  const data = {
    id: state.editingEventId || uid(),
    title, startDate, endDate, startTime, endTime,
    allDay, recurring, recurringInterval, location, description, categoryId, priority,
    reminders
  };
  if (state.editingEventId) {
    const idx = state.events.findIndex(e => e.id === state.editingEventId);
    if (idx >= 0) state.events[idx] = data;
  } else {
    state.events.push(data);
  }
  persist();
  closeEventModal();
  render();
  showToast(state.editingEventId ? '✓ Evento actualizado' : '✓ Evento creado', 'success');
}

function deleteEvent() {
  if (!state.editingEventId) return;
  if (!confirm('¿Eliminar este evento?')) return;
  state.events = state.events.filter(e => e.id !== state.editingEventId);
  persist();
  closeEventModal();
  render();
  showToast('Evento eliminado');
}

document.getElementById('event-modal-close').onclick = closeEventModal;
document.getElementById('event-cancel').onclick = closeEventModal;
document.getElementById('event-save').onclick = saveEvent;
document.getElementById('event-delete').onclick = deleteEvent;
document.getElementById('event-recurring').onchange = (e) => {
  document.getElementById('recurring-options').style.display = e.target.checked ? 'block' : 'none';
};

// ===== Modal tarea =====
function openTaskModal(task, preset = {}) {
  state.editingTaskId = task ? task.id : null;
  const modal = document.getElementById('task-modal');
  document.getElementById('task-modal-title').textContent = task ? 'Editar tarea' : 'Nueva tarea';
  document.getElementById('task-delete').style.display = task ? 'inline-block' : 'none';

  document.getElementById('task-title').value = task ? task.title : '';
  document.getElementById('task-due-date').value = task ? (task.dueDate || '') : ymd(preset.date || state.selectedDate);
  document.getElementById('task-due-time').value = task ? (task.dueTime || '') : '';
  document.getElementById('task-priority').value = task ? (task.priority||'medium') : 'medium';
  document.getElementById('task-notes').value = task ? (task.notes||'') : '';

  const picker = document.getElementById('task-color-picker');
  const selectedCat = task ? task.categoryId : (state.categories[0] && state.categories[0].id);
  picker.innerHTML = state.categories.map(c => `
    <div class="color-swatch ${c.id===selectedCat?'selected':''}" data-cat="${c.id}" style="background:${c.color}" title="${escapeHtml(c.name)}"></div>
  `).join('');
  picker.querySelectorAll('.color-swatch').forEach(sw => {
    sw.onclick = () => {
      picker.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
    };
  });

  modal.classList.add('active');
  setTimeout(() => document.getElementById('task-title').focus(), 50);
}

function saveTask() {
  const title = document.getElementById('task-title').value.trim();
  if (!title) { showToast('Pon un título', 'error'); return; }
  const dueDate = document.getElementById('task-due-date').value || null;
  const dueTime = document.getElementById('task-due-time').value || null;
  const priority = document.getElementById('task-priority').value;
  const notes = document.getElementById('task-notes').value.trim();
  const sel = document.querySelector('#task-color-picker .color-swatch.selected');
  const categoryId = sel ? sel.dataset.cat : state.categories[0].id;

  const data = {
    id: state.editingTaskId || uid(),
    title, dueDate, dueTime, priority, notes, categoryId,
    completed: false
  };
  if (state.editingTaskId) {
    const idx = state.tasks.findIndex(t => t.id === state.editingTaskId);
    if (idx >= 0) {
      data.completed = state.tasks[idx].completed;
      data.completedAt = state.tasks[idx].completedAt;
      state.tasks[idx] = data;
    }
  } else {
    state.tasks.push(data);
  }
  persist();
  closeTaskModal();
  render();
  showToast(state.editingTaskId ? '✓ Tarea actualizada' : '✓ Tarea creada', 'success');
}

function deleteTask() {
  if (!state.editingTaskId) return;
  if (!confirm('¿Eliminar esta tarea?')) return;
  state.tasks = state.tasks.filter(t => t.id !== state.editingTaskId);
  persist();
  closeTaskModal();
  render();
  showToast('Tarea eliminada');
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.remove('active');
  state.editingTaskId = null;
}

document.getElementById('task-modal-close').onclick = closeTaskModal;
document.getElementById('task-cancel').onclick = closeTaskModal;
document.getElementById('task-save').onclick = saveTask;
document.getElementById('task-delete').onclick = deleteTask;
document.getElementById('btn-add-task').onclick = () => openTaskModal();

// ===== Modal categorías =====
function openCatModal() {
  renderCatModal();
  document.getElementById('cat-modal').classList.add('active');
}
function closeCatModal() {
  document.getElementById('cat-modal').classList.remove('active');
  render();
}
function renderCatModal() {
  const list = document.getElementById('cat-list-modal');
  list.innerHTML = state.categories.map(c => `
    <div class="cat-row" data-id="${c.id}">
      <input type="color" value="${c.color}" data-field="color">
      <input type="text" value="${escapeHtml(c.name)}" data-field="name">
      <button class="btn btn-danger" data-act="del">Eliminar</button>
    </div>
  `).join('');
  list.querySelectorAll('.cat-row').forEach(row => {
    const id = row.dataset.id;
    const cat = state.categories.find(c => c.id === id);
    row.querySelector('[data-field=color]').oninput = (e) => { cat.color = e.target.value; };
    row.querySelector('[data-field=name]').oninput = (e) => { cat.name = e.target.value; };
    row.querySelector('[data-act=del]').onclick = () => {
      if (state.categories.length <= 1) { showToast('Al menos una categoría', 'error'); return; }
      const hasEvents = state.events.some(ev => ev.categoryId === id);
      const hasTasks = state.tasks.some(t => t.categoryId === id);
      if (hasEvents || hasTasks) {
        if (!confirm('Hay eventos/tareas con esta categoría. ¿Eliminar y reasignar?')) return;
        const fallback = state.categories.find(c => c.id !== id).id;
        state.events.forEach(ev => { if (ev.categoryId === id) ev.categoryId = fallback; });
        state.tasks.forEach(t => { if (t.categoryId === id) t.categoryId = fallback; });
      }
      state.categories = state.categories.filter(c => c.id !== id);
      persist();
      renderCatModal();
    };
  });
}

// ===== Modal ajustes =====
async function openSettings() {
  document.getElementById('setting-week-start').value = state.settings.weekStart;
  document.getElementById('setting-default-view').value = state.settings.defaultView;
  document.getElementById('setting-time-format').value = state.settings.timeFormat;
  document.getElementById('setting-week-numbers').checked = state.settings.showWeekNumbers;
  document.getElementById('data-path-display').textContent = await window.api.getDataDir();
  document.getElementById('settings-modal').classList.add('active');
  refreshDriveStatus();
}

document.getElementById('settings-save').onclick = () => {
  state.settings.weekStart = parseInt(document.getElementById('setting-week-start').value);
  state.settings.defaultView = document.getElementById('setting-default-view').value;
  state.settings.timeFormat = document.getElementById('setting-time-format').value;
  state.settings.showWeekNumbers = document.getElementById('setting-week-numbers').checked;
  persist();
  document.getElementById('settings-modal').classList.remove('active');
  render();
  showToast('✓ Ajustes guardados', 'success');
};

// ===== Google Drive =====
async function refreshDriveStatus() {
  const dot = document.getElementById('drive-status-dot');
  const text = document.getElementById('drive-status-text');
  const btnConnect = document.getElementById('btn-drive-connect');
  const btnSync = document.getElementById('btn-drive-sync');
  const btnDisconnect = document.getElementById('btn-drive-disconnect');
  const status = await window.api.driveStatus();
  if (status.connected) {
    dot.style.background = '#34c759';
    const when = status.lastSync ? new Date(status.lastSync).toLocaleString('es-AR') : 'todavía no';
    text.textContent = `Conectado · última sincronización: ${when}`;
    btnConnect.style.display = 'none';
    btnSync.style.display = '';
    btnDisconnect.style.display = '';
  } else {
    dot.style.background = '#888';
    text.textContent = 'No conectado';
    btnConnect.style.display = '';
    btnSync.style.display = 'none';
    btnDisconnect.style.display = 'none';
  }
}

document.getElementById('btn-drive-connect').onclick = async () => {
  const btn = document.getElementById('btn-drive-connect');
  btn.disabled = true;
  btn.textContent = 'Abriendo el navegador...';
  const res = await window.api.driveConnect();
  btn.disabled = false;
  btn.textContent = 'Conectar Google Drive';
  if (res.ok) {
    showToast('✓ Conectado con Google Drive', 'success');
    await refreshDriveStatus();
    const syncRes = await window.api.driveSyncNow();
    if (syncRes.ok) showToast('✓ Primera sincronización lista', 'success');
    refreshDriveStatus();
  } else {
    showToast('No se pudo conectar: ' + (res.error || ''), 'error');
  }
};

document.getElementById('btn-drive-sync').onclick = async () => {
  const btn = document.getElementById('btn-drive-sync');
  btn.disabled = true;
  btn.textContent = 'Sincronizando...';
  const res = await window.api.driveSyncNow();
  btn.disabled = false;
  btn.textContent = 'Sincronizar ahora';
  if (res.ok) {
    showToast('✓ Sincronizado con Drive', 'success');
    if (res.action === 'downloaded') { const d = await window.api.loadData(); Object.assign(state, { events: d.events||[], noteLists: d.noteLists||{}, tasks: d.tasks||[], categories: d.categories||state.categories, settings: Object.assign(state.settings, d.settings||{}) }); render(); }
    refreshDriveStatus();
  } else {
    showToast('Error al sincronizar: ' + (res.error || ''), 'error');
  }
};

document.getElementById('btn-drive-disconnect').onclick = async () => {
  if (!confirm('¿Desconectar Google Drive? Tus datos locales no se borran, solo dejan de sincronizarse.')) return;
  await window.api.driveDisconnect();
  showToast('Desconectado de Google Drive', '');
  refreshDriveStatus();
};

if (window.api.onDriveSyncResult) {
  window.api.onDriveSyncResult(async (result) => {
    if (result && result.ok && result.action === 'downloaded') {
      // Llegaron cambios nuevos desde otro dispositivo: recargamos en caliente
      const d = await window.api.loadData();
      Object.assign(state, { events: d.events||[], noteLists: d.noteLists||{}, tasks: d.tasks||[], categories: d.categories||state.categories, settings: Object.assign(state.settings, d.settings||{}) });
      render();
      showToast('☁️ Se trajeron cambios nuevos de Google Drive', 'success');
    }
  });
}


// ===== Búsqueda global =====
function openSearch() {
  document.getElementById('search-modal').classList.add('active');
  setTimeout(() => document.getElementById('search-input').focus(), 50);
  performSearch('');
}

function closeSearch() {
  document.getElementById('search-modal').classList.remove('active');
}

function performSearch(q) {
  q = q.toLowerCase().trim();
  const results = document.getElementById('search-results');
  if (!q) {
    results.innerHTML = '<div class="search-empty">Escribe para buscar eventos, tareas y notas</div>';
    return;
  }
  let html = '';
  // Eventos
  const evMatches = state.events.filter(e => 
    e.title.toLowerCase().includes(q) || 
    (e.location||'').toLowerCase().includes(q) || 
    (e.description||'').toLowerCase().includes(q)
  );
  if (evMatches.length) {
    html += '<div class="search-section-title">Eventos</div>';
    evMatches.slice(0, 10).forEach(e => {
      const color = colorForCategory(e.categoryId);
      html += `<div class="search-result" data-type="event" data-id="${e.id}">
        <div class="search-result-icon" style="color:${color}">●</div>
        <div class="search-result-content">
          <div class="search-result-title">${highlight(e.title, q)}</div>
          <div class="search-result-snippet">${highlight((e.description||e.location||'').substring(0,80), q)}</div>
        </div>
        <div class="search-result-meta">${e.startDate}</div>
      </div>`;
    });
  }
  // Tareas
  const taskMatches = state.tasks.filter(t => 
    t.title.toLowerCase().includes(q) || (t.notes||'').toLowerCase().includes(q)
  );
  if (taskMatches.length) {
    html += '<div class="search-section-title">Tareas</div>';
    taskMatches.slice(0, 10).forEach(t => {
      const color = colorForCategory(t.categoryId);
      html += `<div class="search-result" data-type="task" data-id="${t.id}">
        <div class="search-result-icon" style="color:${color}">${t.completed?'✓':'☐'}</div>
        <div class="search-result-content">
          <div class="search-result-title">${highlight(t.title, q)}</div>
          <div class="search-result-snippet">${highlight((t.notes||'').substring(0,80), q)}</div>
        </div>
        <div class="search-result-meta">${t.dueDate||'Sin fecha'}</div>
      </div>`;
    });
  }
  // Notas
  const noteMatches = [];
  Object.keys(state.noteLists).forEach(date => {
    state.noteLists[date].forEach(n => {
      if ((n.title||'').toLowerCase().includes(q) || stripHtml(n.content).toLowerCase().includes(q)) {
        noteMatches.push({ ...n, date });
      }
    });
  });
  if (noteMatches.length) {
    html += '<div class="search-section-title">Notas</div>';
    noteMatches.slice(0, 10).forEach(n => {
      const snippet = stripHtml(n.content).substring(0, 100);
      html += `<div class="search-result" data-type="note" data-date="${n.date}" data-id="${n.id}">
        <div class="search-result-icon">📝</div>
        <div class="search-result-content">
          <div class="search-result-title">${highlight(n.title || 'Sin título', q)}</div>
          <div class="search-result-snippet">${highlight(snippet, q)}</div>
        </div>
        <div class="search-result-meta">${n.date}</div>
      </div>`;
    });
  }
  if (!html) html = '<div class="search-empty">Sin resultados</div>';
  results.innerHTML = html;
  results.querySelectorAll('.search-result').forEach(r => {
    r.onclick = () => {
      const type = r.dataset.type;
      if (type === 'event') {
        const e = state.events.find(x => x.id === r.dataset.id);
        if (e) {
          state.selectedDate = parseDate(e.startDate);
          state.currentDate = new Date(state.selectedDate);
          closeSearch();
          render();
          openEventModal(e);
        }
      } else if (type === 'task') {
        const t = state.tasks.find(x => x.id === r.dataset.id);
        if (t) { closeSearch(); openTaskModal(t); }
      } else if (type === 'note') {
        state.selectedDate = parseDate(r.dataset.date);
        state.currentNoteId = r.dataset.id;
        closeSearch();
        render();
        renderNotes();
      }
    };
  });
}

function highlight(text, q) {
  if (!q) return escapeHtml(text);
  const idx = text.toLowerCase().indexOf(q);
  if (idx === -1) return escapeHtml(text);
  return escapeHtml(text.substring(0, idx)) + '<mark style="background:yellow;color:black">' + escapeHtml(text.substring(idx, idx+q.length)) + '</mark>' + escapeHtml(text.substring(idx+q.length));
}

// ===== Nota rápida =====
function openQuickNote() {
  document.getElementById('quicknote-title').value = '';
  document.getElementById('quicknote-content').value = '';
  document.getElementById('quicknote-date').value = ymd(state.selectedDate);
  document.getElementById('quicknote-modal').classList.add('active');
  setTimeout(() => document.getElementById('quicknote-content').focus(), 50);
}

document.getElementById('quicknote-save').onclick = () => {
  const title = document.getElementById('quicknote-title').value.trim();
  const content = document.getElementById('quicknote-content').value.trim();
  const date = document.getElementById('quicknote-date').value;
  if (!content) { showToast('Escribe algo', 'error'); return; }
  if (!state.noteLists[date]) state.noteLists[date] = [];
  state.noteLists[date].push({
    id: uid(),
    title: title || `Nota rápida ${new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}`,
    content: `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`,
    attachments: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  persist();
  document.getElementById('quicknote-modal').classList.remove('active');
  state.selectedDate = parseDate(date);
  render();
  showToast('✓ Nota guardada', 'success');
};

// ===== Reloj y recordatorios =====
function startClock() {
  const update = () => {
    const now = new Date();
    const opts = { weekday:'short', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' };
    document.getElementById('time-display').textContent = now.toLocaleString('es-ES', opts);
  };
  update();
  setInterval(update, 30000);
}

let lastReminderCheck = {};
function checkReminders() {
  const now = new Date();
  state.events.forEach(e => {
    if (!e.reminders || !e.reminders.length) return;
    const startDate = parseDate(e.startDate);
    const [sh, sm] = (e.startTime || '09:00').split(':').map(Number);
    startDate.setHours(sh, sm, 0, 0);
    
    e.reminders.forEach(r => {
      const offsets = { minutes: 60000, hours: 3600000, days: 86400000, weeks: 604800000 };
      const ms = offsets[r.unit] * r.offset;
      const reminderTime = new Date(startDate.getTime() - ms);
      const key = `${e.id}-${r.offset}-${r.unit}`;
      if (now >= reminderTime && now < new Date(reminderTime.getTime() + 60000)) {
        if (!lastReminderCheck[key]) {
          lastReminderCheck[key] = true;
          window.api.showNotification({
            title: '📅 Recordatorio',
            body: `${e.title}${e.location ? ' · ' + e.location : ''}\n${startDate.toLocaleString('es-ES')}`
          });
        }
      }
    });
  });
}

// ===== UI binding =====
function bindUI() {
  // Botones de ventana
  document.getElementById('btn-close').onclick = () => window.api.windowClose();
  document.getElementById('btn-min').onclick = () => window.api.windowMin();
  document.getElementById('btn-max').onclick = () => window.api.windowMax();

  // Navegación
  document.getElementById('btn-prev').onclick = () => navigate(-1);
  document.getElementById('btn-next').onclick = () => navigate(1);
  document.getElementById('btn-today').onclick = () => {
    const t = new Date();
    state.currentDate = new Date(t.getFullYear(), t.getMonth(), 1);
    state.selectedDate = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    if (state.view === 'day') state.currentDate = new Date(state.selectedDate);
    render();
  };

  // Vista
  document.querySelectorAll('.view-btn').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      state.view = b.dataset.view;
      if (state.view === 'day') state.currentDate = new Date(state.selectedDate);
      render();
    };
  });

  // Eventos / tareas / notas rápidas
  document.getElementById('btn-add-event').onclick = () => openEventModal();
  document.getElementById('btn-add-event-side').onclick = () => openEventModal();
  document.getElementById('btn-manage-cats').onclick = openCatModal;
  document.getElementById('cat-modal-close').onclick = closeCatModal;
  document.getElementById('cat-modal-done').onclick = closeCatModal;
  document.getElementById('add-cat-submit').onclick = () => {
    const name = document.getElementById('new-cat-name').value.trim();
    const color = document.getElementById('new-cat-color').value;
    if (!name) { showToast('Pon un nombre', 'error'); return; }
    state.categories.push({ id: uid(), name, color });
    document.getElementById('new-cat-name').value = '';
    persist();
    renderCatModal();
  };
  document.getElementById('btn-tasks').onclick = () => {
    document.querySelectorAll('.view-btn').forEach(x => x.classList.remove('active'));
    document.querySelector('[data-view=tasks]').classList.add('active');
    state.view = 'tasks';
    render();
  };
  document.getElementById('btn-settings').onclick = openSettings;
  document.getElementById('settings-modal-close').onclick = () => document.getElementById('settings-modal').classList.remove('active');
  document.getElementById('btn-quick-note').onclick = openQuickNote;
  document.getElementById('quicknote-close').onclick = () => document.getElementById('quicknote-modal').classList.remove('active');
  document.getElementById('quicknote-cancel').onclick = () => document.getElementById('quicknote-modal').classList.remove('active');

  // Búsqueda
  document.getElementById('global-search').onfocus = openSearch;
  document.getElementById('search-input').oninput = (e) => performSearch(e.target.value);
  document.getElementById('search-modal-close').onclick = closeSearch;

  // Datos
  document.getElementById('btn-open-folder').onclick = () => window.api.openDataFolder();
  document.getElementById('btn-export').onclick = async () => {
    const data = {
      events: state.events,
      notes: state.notes,
      noteLists: state.noteLists,
      tasks: state.tasks,
      categories: state.categories,
      settings: state.settings
    };
    const res = await window.api.exportData(data);
    if (res.ok) showToast(`✓ Exportado a ${res.path}`, 'success');
  };
  document.getElementById('btn-import').onclick = async () => {
    if (!confirm('Importar reemplazará todos los datos actuales. ¿Continuar?')) return;
    const res = await window.api.importData();
    if (res.ok) {
      state.events = res.data.events || [];
      state.notes = res.data.notes || {};
      state.noteLists = res.data.noteLists || {};
      state.tasks = res.data.tasks || [];
      state.settings = Object.assign(state.settings, res.data.settings || {});
      if (res.data.categories) state.categories = res.data.categories;
      await persist();
      render();
      showToast('✓ Datos importados', 'success');
    } else if (res.error) {
      showToast('Error: ' + res.error, 'error');
    }
  };

  // Atajos teclado
  document.addEventListener('keydown', (e) => {
    // En campos de texto solo procesamos algunos
    const inField = e.target.matches('input,textarea,[contenteditable=true]');
    
    if (e.key === 'Escape') {
      closeEventModal();
      closeTaskModal();
      closeCatModal();
      closeSearch();
      document.getElementById('settings-modal').classList.remove('active');
      document.getElementById('quicknote-modal').classList.remove('active');
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey && !inField) {
      e.preventDefault();
      openEventModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'N') {
      e.preventDefault();
      openQuickNote();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 't' && !inField) {
      e.preventDefault();
      document.getElementById('btn-tasks').click();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettings();
    }
    if (e.key === 't' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
      document.getElementById('btn-today').click();
    }
  });
}

function navigate(dir) {
  const d = state.currentDate;
  if (state.view === 'month') state.currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
  else if (state.view === 'week') state.currentDate = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7*dir);
  else if (state.view === 'day') {
    const nd = new Date(d); nd.setDate(d.getDate() + dir);
    state.currentDate = nd;
    state.selectedDate = nd;
  }
  else if (state.view === 'agenda') state.currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
  else if (state.view === 'tasks') {} // no nav
  render();
}

// ===== Toast =====
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// Iniciar
init().catch(err => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:20px;color:red">${err.stack}</pre>`;
});
