// ── State ──
let sessions = []
let activeId = null

// ── Helpers ──
const $ = (sel) => document.querySelector(sel)
const esc = (s) => {
  const d = document.createElement('div')
  d.textContent = s
  return d.innerHTML
}
const formatTime = (ts) => new Date(ts).toLocaleString()
const formatDuration = (ms) =>
  ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

// ── Boot ──
document.addEventListener('DOMContentLoaded', loadSessions)

async function loadSessions() {
  try {
    const res = await fetch('/api/sessions')
    sessions = await res.json()
    renderList()
  } catch (err) {
    $('#sessions-loading').textContent = 'Failed to load sessions'
    console.error(err)
  }
}

function renderList() {
  $('#sessions-loading').classList.add('hidden')
  const ul = $('#sessions')
  ul.innerHTML = ''

  if (!sessions.length) {
    ul.innerHTML = '<li class="loading">No sessions found</li>'
    return
  }

  for (const s of sessions) {
    const li = document.createElement('li')
    li.dataset.id = s.id
    if (s.id === activeId) li.classList.add('active')

    const isError = !!s.error
    li.innerHTML = `
      <div class="session-id">${esc(s.sessionId ?? s.id)}</div>
      <div class="session-time">${formatTime(s.timestamp)}</div>
      <div class="session-meta">
        <span class="badge ${isError ? 'badge-error' : 'badge-success'}">${isError ? 'Error' : 'OK'}</span>
        <span class="badge badge-duration">${formatDuration(s.durationMs)}</span>
      </div>
    `
    li.addEventListener('click', () => selectSession(s.id))
    ul.appendChild(li)
  }
}

async function selectSession(id) {
  activeId = id
  renderList() // update active highlight

  const content = $('#detail-content')
  const empty = $('#detail-empty')
  empty.classList.add('hidden')
  content.classList.remove('hidden')

  // Loading state
  $('#detail-title').textContent = 'Loading…'
  $('#detail-time').textContent = ''
  $('#detail-duration').textContent = ''
  $('#detail-status').textContent = ''
  $('#detail-error').classList.add('hidden')
  $('#panel-schema').innerHTML = '<div class="loading">Loading…</div>'
  $('#panel-notes').innerHTML = ''
  $('#panel-model').innerHTML = ''

  try {
    const res = await fetch(`/api/sessions/${id}`)
    const session = await res.json()
    renderDetail(session)
  } catch (err) {
    $('#detail-title').textContent = 'Failed to load session'
    console.error(err)
  }
}

function renderDetail(s) {
  $('#detail-title').textContent = s.sessionId ?? s.id
  $('#detail-time').textContent = formatTime(s.timestamp)
  $('#detail-duration').textContent = formatDuration(s.durationMs)
  $('#detail-status').textContent = s.error ? '❌ Error' : '✅ Success'

  if (s.error) {
    const errBanner = $('#detail-error')
    errBanner.classList.remove('hidden')
    errBanner.textContent = s.error
  } else {
    $('#detail-error').classList.add('hidden')
  }

  renderSchema(s.input)
  renderNotes(s.output)
  renderModel(s.output)
}

// ── Schema panel ──
function renderSchema(input) {
  const el = $('#panel-schema')
  if (!input?.schema) {
    el.innerHTML = '<div class="loading">No schema data</div>'
    return
  }

  let html = ''
  const tables = input.schema.tables ?? []
  for (const t of tables) {
    html += `<div class="table-card">
      <div class="table-card-header">${esc(t.name)}</div>
      <ul>`
    for (const col of t.columns ?? []) {
      const name = typeof col === 'string' ? col : col.name
      const dtype = typeof col === 'object' && col.dataType ? col.dataType : ''
      const pk = typeof col === 'object' && col.isPrimaryKey
      html += `<li>${esc(name)}${pk ? '<span class="pk">PK</span>' : ''}${dtype ? `<span class="dtype">${esc(dtype)}</span>` : ''}</li>`
    }
    html += '</ul></div>'
  }

  const rels = input.schema.relationships ?? []
  if (rels.length) {
    html += '<div style="margin-top:12px;font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:6px">Relationships</div>'
    for (const r of rels) {
      html += `<div class="relationship">${esc(r.sourceTable)}.${esc(r.sourceColumn)} <span class="arrow">→</span> ${esc(r.targetTable)}.${esc(r.targetColumn)} <span class="dtype">${esc(r.type ?? '')}</span></div>`
    }
  }

  if (input.operations?.length) {
    html += '<div style="margin-top:12px;font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:6px">Query Patterns</div>'
    for (const op of input.operations) {
      html += `<div style="margin-bottom:6px;font-size:12px">
        <span style="color:var(--accent);font-weight:600">${esc(op.name)}</span>
        <span class="dtype">[${esc(op.type)} · ${esc(op.frequency)}]</span>
        <div style="color:var(--text-secondary);margin-top:2px">${esc(op.description)}</div>
      </div>`
    }
  }

  if (input.additionalContext) {
    html += `<div style="margin-top:12px;font-size:12px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:6px">Additional Context</div>
      <div style="font-size:12px;color:var(--text-secondary);white-space:pre-wrap">${esc(input.additionalContext)}</div>`
  }

  el.innerHTML = html
}

// ── Notes panel ──
function renderNotes(output) {
  const el = $('#panel-notes')
  if (!output) {
    el.innerHTML = '<div class="loading">No output data</div>'
    return
  }

  let html = ''
  if (output.reasoning) {
    html += `<div class="reasoning">${esc(output.reasoning)}</div>`
  }

  if (output.tradeoffs?.length) {
    html += `<div class="notes-section"><h4>Trade-offs</h4><ul>`
    for (const t of output.tradeoffs) html += `<li>${esc(t)}</li>`
    html += '</ul></div>'
  }

  if (output.warnings?.length) {
    html += `<div class="notes-section warnings"><h4>⚠ Warnings</h4><ul>`
    for (const w of output.warnings) html += `<li>${esc(w)}</li>`
    html += '</ul></div>'
  }

  el.innerHTML = html || '<div class="loading">No notes</div>'
}

// ── Model panel ──
function renderModel(output) {
  const el = $('#panel-model')
  if (!output?.containers?.length) {
    el.innerHTML = '<div class="loading">No container recommendations</div>'
    return
  }

  let html = ''
  for (const c of output.containers) {
    html += `<div class="container-card">
      <div class="container-card-header">
        <span class="name">${esc(c.name)}</span>
        <span class="pk">${esc(c.partitionKey)}</span>
      </div>
      <div class="container-card-body">`

    if (c.description) {
      html += `<div class="desc">${esc(c.description)}</div>`
    }

    if (c.properties?.length) {
      html += '<div class="props-label">Properties</div><ul>'
      for (const p of c.properties) {
        html += `<li>${esc(p.name)}${p.dataType ? `<span class="dtype">${esc(p.dataType)}</span>` : ''}${p.source ? `<span class="source">← ${esc(p.source)}</span>` : ''}</li>`
      }
      html += '</ul>'
    }

    for (const emb of c.embeddedEntities ?? []) {
      html += `<div class="embedded-label">${esc(emb.name)} <span class="dtype">(${esc(emb.relationship)} from ${esc(emb.sourceTable)})</span></div><ul>`
      for (const p of emb.properties ?? []) {
        html += `<li>${esc(p.name)}${p.dataType ? `<span class="dtype">${esc(p.dataType)}</span>` : ''}${p.source ? `<span class="source">← ${esc(p.source)}</span>` : ''}</li>`
      }
      html += '</ul>'
    }

    html += '</div></div>'
  }

  el.innerHTML = html
}
