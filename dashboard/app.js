const el = id => document.getElementById(id);
const text = (id, value) => { el(id).textContent = value; };
const node = (tag, content = '', className = '') => {
  const item = document.createElement(tag);
  item.textContent = content;
  if (className) item.className = className;
  return item;
};
let accessToken = '', approverToken = '', currentEvent = '', currentLead = '';
let dashboard, leads = [], progress, review, reviewId = '', poll, refreshPromise;
let queueSignature = '', slotsSignature = '', leadsSignature = '', eventsSignature = '', slotPending = false;
const terminal = new Set(['MEETING_BOOKED', 'OPPORTUNITY', 'WON', 'MANUAL_REVIEW', 'SPAM', 'DISQUALIFIED', 'NURTURE']);
const statusNames = { NEW: 'Received', QUALIFIED: 'Qualified', CONTACTED: 'Email sent', RESPONDED: 'Reply received', MEETING_PROPOSED: 'Meeting proposed', MEETING_BOOKED: 'Meeting booked', MANUAL_REVIEW: 'Manual review', DISQUALIFIED: 'Disqualified', SPAM: 'Spam', NURTURE: 'Nurture', OPPORTUNITY: 'Opportunity', WON: 'Won' };
const human = value => statusNames[value] || String(value || 'Processing').toLowerCase().replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const actionName = key => key.startsWith('BOOK_MEETING:') ? 'Meeting booking' : key.startsWith('SEND_INITIAL_EMAIL:') ? 'Email review' : key.startsWith('FOLLOWUP:') ? 'Follow-up review' : 'Tool request';
const localApproval = () => dashboard?.mode === 'mock' && dashboard?.auth?.approver_required === false;
const canReview = () => !!approverToken || localApproval();
const selectedContact = () => leads.find(l => l.id === currentLead);
const selectedApprovals = () => (dashboard?.approvals || []).filter(a => a.lead_id === currentLead);
const initials = name => (name || 'Contact').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

async function request(path, body, approval = false) {
  const token = approval ? approverToken : accessToken;
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok) {
    const messages = {
      LEAD_ENVIRONMENT_MISMATCH: 'This lead belongs to another mode. Start a new workflow in the current mode.',
      MOCK_RECEIPT_NOT_LIVE: 'This lead was processed locally. Start a new workflow to use connected integrations.',
      SESSION_OFFLINE: 'The connected session is offline. Start it in PowerShell, then refresh.',
      APPROVAL_EXPIRED: 'This review has expired. Check the activity record before continuing.'
    };
    const err = new Error(response.status === 401 ? (approval ? 'Use a valid approver token in Access to review this action.' : 'Connect using your workspace access token.') : messages[data.error] || human(data.error || 'Request failed. Try again.'));
    err.status = response.status;
    throw err;
  }
  return data;
}
async function busy(button, work) {
  if (button.disabled) return;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  try { await work(); }
  finally {
    button.disabled = ['approve-action', 'reject-action'].includes(button.id)
      ? !review || review.decision !== 'pending' || Date.parse(review.expires_at) <= Date.now()
      : false;
    button.removeAttribute('aria-busy');
  }
}
function showError(error) {
  el('error').hidden = false;
  text('error', error.name === 'TimeoutError' ? 'The request timed out. Refresh to check its outcome before retrying an action.' : error.message);
}
function switchView(view, focus = false) {
  for (const tab of document.querySelectorAll('[role=tab]')) {
    const active = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    el(`view-${tab.dataset.view}`).hidden = !active;
    if (active && focus) tab.focus();
  }
}
for (const tab of document.querySelectorAll('[role=tab]')) {
  tab.addEventListener('click', () => switchView(tab.dataset.view));
  tab.addEventListener('keydown', e => {
    const tabs = [...document.querySelectorAll('[role=tab]')];
    let index = tabs.indexOf(tab);
    if (e.key === 'ArrowRight') index = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') index = (index + tabs.length - 1) % tabs.length;
    else if (e.key === 'Home') index = 0;
    else if (e.key === 'End') index = tabs.length - 1;
    else return;
    e.preventDefault(); switchView(tabs[index].dataset.view, true);
  });
}
function access(open = !el('access-panel').hidden) {
  el('access-panel').hidden = !open;
  el('access-toggle').setAttribute('aria-expanded', String(open));
  if (open) el('approver-token').focus();
}
el('access-toggle').addEventListener('click', () => access(el('access-panel').hidden));
for (const id of ['open-access', 'review-access']) el(id).addEventListener('click', () => access(true));
el('approver-auth').addEventListener('submit', async e => {
  e.preventDefault(); approverToken = el('approver-token').value.trim(); el('approver-token').value = '';
  text('approver-status', 'Approver token set for this session. It will be checked when you open a review.');
  text('approval-access-state', 'Approver token set'); text('review-access', 'Change access');
  access(false);
  if (reviewId || selectedApprovals().length) await loadReview(reviewId || selectedApprovals()[0].id);
  renderJourney();
});

function renderDashboard() {
  const d = dashboard, personal = d.data_mode === 'personal';
  const workflowUrl = d.mode === 'live' && /^https:\/\/[a-z0-9-]+\.app\.n8n\.cloud\/workflow\/[a-zA-Z0-9_-]+$/.test(d.workflow?.url || '') ? d.workflow.url : '';
  el('workflow-map').hidden = !workflowUrl;
  if(workflowUrl){el('workflow-canvas').href=workflowUrl;el('workflow-history').href=workflowUrl+'/executions';}
  if(localApproval()){text('approval-access-state','Local approvals enabled');text('review-access','Access settings');}
  text('mode', d.mode === 'mock' ? 'Local · Synthetic data' : personal ? 'Connected · Personal data' : 'Connected · Synthetic data');
  text('data-mode', personal ? 'LEAD WORKSPACE' : 'SYNTHETIC DATA');
  text('demo-note', personal ? 'Add an allowed contact. Review every outbound email before sending.' : 'Manage qualification, review outreach, and book meetings through your connected workflows.');
  text('effect-note', d.mode === 'mock' ? 'Integrations disconnected. Actions are processed locally.' : personal ? 'Real integrations: every outbound email requires approval.' : 'n8n orchestration · Synthetic email delivery uses your configured test inbox.');
  el('start-demo').hidden = personal;
  el('show-lead-form').hidden = d.mode === 'live' && !personal;
  text('lead-count', d.funnel.reduce((sum, item) => sum + item.count, 0));
  text('approval-count', d.ops.approvals); text('action-count', d.ops.completed);
  text('failure-count', d.ops.dead_letters + d.ops.uncertain);
  el('attention-stat').classList.toggle('attention', d.ops.dead_letters + d.ops.uncertain > 0);
  text('ai-runs', d.ai.runs); text('ai-latency', d.ai.latency_ms === null ? 'Not measured' : `${d.ai.latency_ms} ms`);
  text('ai-cost', d.ai.cost_usd === null ? 'Not reported' : `$${Number(d.ai.cost_usd).toFixed(4)}`); text('ai-failures', d.ai.failures);
  text('ai-note', d.mode === 'mock' ? 'Local processing records. Provider measurements become available when integrations are connected.' : 'Persisted provider measurements. Missing cost remains unreported.');
  const rows = [], max = Math.max(1, ...d.funnel.map(item => item.count));
  for (const item of d.funnel) {
    const row = node('div', '', 'bar-row'), track = node('div', '', 'bar-track'), fill = node('div', '', 'bar-fill');
    fill.style.width = `${item.count / max * 100}%`; track.append(fill);
    row.append(node('span', human(item.status)), track, node('strong', item.count)); rows.push(row);
  }
  el('bars').replaceChildren(...(rows.length ? rows : [node('p', 'No leads yet.', 'empty')]));
  renderLeads(); renderQueue(); renderEvents(); renderJourney();
  text('updated', `Updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
}
function renderLeads() {
  const query = el('lead-search').value.trim().toLowerCase();
  const signature = JSON.stringify([query, leads]);
  if (signature === leadsSignature) return;
  leadsSignature = signature;
  const filtered = leads.filter(l => `${l.name || ''} ${l.email || ''}`.toLowerCase().includes(query));
  const rows = filtered.map(l => {
    const row = node('div', '', 'lead-row'), identity = node('div', '', 'lead-identity');
    identity.append(node('strong', l.name || 'Contact'), node('p', l.email || 'No email recorded'));
    const button = node('button', 'Open', 'secondary'); button.type = 'button'; button.disabled = !l.event_id;
    button.setAttribute('aria-label', `Open ${l.name || 'contact'}${l.email ? ` (${l.email})` : ''}`);
    button.addEventListener('click', () => track({ event_id: l.event_id, lead_id: l.id }));
    row.append(node('span', initials(l.name), 'avatar'), identity, node('span', human(l.status), 'badge'), button);
    return row;
  });
  el('recent-leads').replaceChildren(...(rows.length ? rows : [node('p', query ? 'No recent leads match your search.' : 'No leads yet. Start a workflow from Workspace.', 'empty')]));
}
el('lead-search').addEventListener('input', renderLeads);
function renderQueue() {
  const all = el('all-approvals').checked || !currentEvent;
  const items = all ? dashboard.approvals : selectedApprovals();
  text('review-count', items.length); text('review-scope', all ? 'All pending actions' : 'For the selected lead');
  text('review-help', canReview() ? 'Read the exact action. Approval and execution are separate steps.' : 'Enable approver access to read and approve protected actions.');
  const signature = JSON.stringify([items, reviewId, all]);
  if (signature !== queueSignature) {
    queueSignature = signature;
    const rows = items.map(a => {
      const button = node('button', '', 'approval-item'); button.type = 'button'; button.dataset.approvalId = a.id;
      button.setAttribute('aria-pressed', String(a.id === reviewId));
      const info = node('span'), contact = leads.find(l => l.id === a.lead_id);
      info.append(node('strong', actionName(a.action_key)), node('small', contact?.name || 'Contact'));
      const arrow = node('span', '→', 'arrow'); arrow.setAttribute('aria-hidden', 'true');
      button.append(info, arrow);
      button.addEventListener('click', () => loadReview(a.id)); return button;
    });
    const empty = currentEvent ? 'No pending actions for this lead.' : 'The review queue is clear. Start a workflow to prepare outreach.';
    el('approval-list').replaceChildren(...(rows.length ? rows : [node('p', empty, 'empty')]));
  }
  if (!all && items.length && canReview() && (!reviewId || (!items.some(a => a.id === reviewId) && review?.decision !== 'pending'))) void loadReview(items[0].id);
}
el('all-approvals').addEventListener('change', renderQueue);
function renderEvents() {
  el('selected-activity').disabled = !currentLead;
  const events = el('selected-activity').checked && currentLead ? dashboard.events.filter(e => e.lead_id === currentLead) : dashboard.events;
  const signature = JSON.stringify(events);
  if (signature === eventsSignature) return;
  eventsSignature = signature;
  const rows = events.map(e => {
    const row = node('tr'), refCell = node('td'), button = node('button', e.correlation_id.slice(0, 8), 'copy-reference');
    button.type = 'button'; button.title = `Copy reference ${e.correlation_id}`; button.setAttribute('aria-label', button.title);
    button.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(e.correlation_id); button.textContent = 'Copied'; setTimeout(() => { button.textContent = e.correlation_id.slice(0, 8); }, 1500); }
      catch { showError(new Error('Clipboard access is unavailable. The full reference is in the button tooltip.')); }
    });
    refCell.append(button); row.append(node('td', human(e.event_type)), refCell, node('td', new Date(e.created_at).toLocaleString())); return row;
  });
  if (!rows.length) { const row = node('tr'), cell = node('td', 'No events in the latest 40 records for this selection.', 'empty'); cell.colSpan = 3; row.append(cell); rows.push(row); }
  el('events').replaceChildren(...rows);
}
el('selected-activity').addEventListener('change', renderEvents);

function renderJourney() {
  const contact = selectedContact(), p = progress;
  el('selected-lead').hidden = !currentEvent;
  const scenarioKey=['meeting','question','unsubscribe'].find(key=>p?.source_event_id?.startsWith(`scenario-${key}-`));
  const scenarioLabel={meeting:'Meeting request',question:'Product question',unsubscribe:'Unsubscribe'}[scenarioKey];
  text('selected-name', scenarioLabel ? `${contact?.name || 'Lead'} · ${scenarioLabel}` : contact?.name || (currentEvent ? 'Processing lead' : 'Sample lead'));
  text('selected-email', contact?.email || ''); text('lead-initials', initials(contact?.name));
  text('selected-reference', currentEvent ? `Lead reference ${currentLead || currentEvent}` : '');
  text('lead-state', currentEvent ? human(p?.status) : 'No lead selected');
  const stopped = ['MANUAL_REVIEW', 'DISQUALIFIED', 'SPAM', 'NURTURE'].includes(p?.status);
  el('lead-state').className = `badge${stopped ? ' warning' : p?.status === 'MEETING_BOOKED' ? ' success' : ''}`;
  el('lead-score').hidden = p?.score == null;
  if (p?.score != null) { text('score-value', p.score); text('score-route', p.route || 'Score'); }
  const steps = { NEW: 0, QUALIFIED: 1, CONTACTED: 2, RESPONDED: 3, MEETING_PROPOSED: 3, MEETING_BOOKED: 4, OPPORTUNITY: 4, WON: 4 };
  const stage = currentEvent ? p?.opted_out ? 3 : steps[p?.status] ?? 0 : -1;
  for (const step of el('journey').children) {
    const number = Number(step.dataset.step), done = number < stage || (number === 4 && stage === 4);
    step.className = done ? 'done' : number === stage ? 'current' : '';
    step.querySelector('.step-dot').textContent = done ? '✓' : String(number + 1);
    step.querySelector('.step-dot').setAttribute('aria-hidden', 'true');
    if (number === stage) step.setAttribute('aria-current', 'step'); else step.removeAttribute('aria-current');
  }
  const personal = dashboard?.data_mode === 'personal', pending = selectedApprovals();
  el('scenario-control').hidden=personal;
  const booking = pending.some(a => a.action_key.startsWith('BOOK_MEETING:'));
  let title = 'Start a lead journey', description = 'Choose a situation and start the workflow. Review outreach before sending, then process its reply to book a meeting, request follow-up, or stop outreach.';
  if (currentEvent && !p?.status) { title = 'Processing your request'; description = 'The submitted lead is being validated and qualified.'; }
  else if (p?.status === 'NEW') { title = 'Qualifying your lead'; description = 'Signals are extracted, then deterministic rules compute its score and route.'; }
  else if (p?.status === 'QUALIFIED') { title = pending.length ? 'Review the email' : 'Preparing your email'; description = pending.length ? 'Check the recipient and exact draft in Review & approve. Approve it, then run the action.' : 'CRM sync and drafting are still in progress. The email will appear here when it is ready for review.'; }
  else if (p?.status === 'CONTACTED') { title = personal ? 'Process the contact’s reply' : contact?.source === 'portfolio' ? 'Process the reply' : 'Email step complete'; description = personal ? 'Paste the actual reply from your inbox to continue.' : contact?.source === 'portfolio' ? `The email step is complete. Process the supplied reply for ${scenarioLabel || 'Meeting request'} to continue.` : 'This lead completed qualification and outreach. Start a workflow to process a supplied reply.'; }
  else if (p?.status === 'RESPONDED') { title = 'Reply received'; description = 'For a product question, inspect the follow-up task in HubSpot and the Slack alert. Meeting requests proceed to available times.'; }
  else if (p?.status === 'MEETING_PROPOSED') { title = booking ? 'Review the booking' : 'Choose a meeting time'; description = booking ? 'Check the proposed start and end times, then approve and run the booking.' : 'Choose an available time below. Booking requires a separate approval.'; }
  else if (p?.status === 'MEETING_BOOKED') { title = 'Meeting booked'; description = 'This lead completed the meeting journey. Open Activity to inspect its recorded decisions and action results.'; }
  else if (['OPPORTUNITY', 'WON'].includes(p?.status)) { title = human(p.status); description = 'Open Activity to inspect the recorded revenue-stage decisions and results.'; }
  else if (stopped) { title = human(p.status); description = p.status === 'MANUAL_REVIEW' ? 'Automatic outreach is paused. Inspect Activity for the reason before continuing.' : 'This lead does not continue through the active outreach journey. Inspect Activity for its routing evidence.'; }
  if(p?.processing_error&&!pending.length){title=p.processing_error.retrying?'Retrying the workflow':'Workflow needs attention';description=`${p.processing_error.stage} failed before the journey could continue. ${p.processing_error.retrying?'A retry is scheduled.':'Open Activity for its recorded failure and correlation reference.'}`;text('lead-state',p.processing_error.retrying?'Retrying':'Needs attention');el('lead-state').className='badge warning';}
  if(p?.opted_out){title='Outreach stopped';description='Consent is withdrawn. Follow-ups are cancelled and the opt-out is recorded in Activity and Slack.';text('lead-state','Opted out');}
  if (review && review.lead_id === currentLead && review.decision === 'rejected' && !pending.length) {
    title = 'Action rejected'; description = 'This action will not run. Your decision is recorded in Activity.';
  }
  text('next-label', currentEvent ? terminal.has(p?.status) ? 'JOURNEY RESULT' : 'NEXT STEP' : 'GET STARTED');
  text('next-title', title); text('demo-status', description);
  el('simulate-reply').hidden = p?.opted_out || p?.status !== 'CONTACTED' || personal || contact?.source !== 'portfolio';
  el('reply-form').hidden = p?.status !== 'CONTACTED' || !personal;
  el('jump-review').hidden = !pending.length || !canReview();
  el('open-access').hidden = !pending.length || canReview();
  const slots = p?.status === 'MEETING_PROPOSED' && !booking && !slotPending ? p.slots || [] : [];
  const signature = JSON.stringify(slots);
  if (signature !== slotsSignature) {
    slotsSignature = signature;
    el('slot-list').replaceChildren(...slots.map(slot => {
      const button = node('button', `${new Date(slot.start_at).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}`, 'secondary');
      button.type = 'button'; button.addEventListener('click', () => busy(button, async () => {
        try {
          slotPending = true;
          await request('/api/meeting/select', { lead_id: currentLead, start: slot.start_at, end: slot.end_at });
          await refresh(); text('demo-status', 'Time selected. Open the booking review to approve it.');
        } catch (err) { showError(err); }
        finally { slotPending = false; renderJourney(); }
      })); return button;
    }));
  }
  el('slot-note').hidden = !slots.length;
}
el('jump-review').addEventListener('click', async () => {
  const a = selectedApprovals()[0]; if (a) await loadReview(a.id);
  el('approvals').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
});
async function loadReview(id) {
  reviewId = id; review = null;
  el('review-detail').hidden = false; el('approve-action').disabled = true; el('reject-action').disabled = true; el('execute-action').hidden = true;
  text('review-title', 'Loading review'); text('review-content', ''); text('review-status', ''); text('review-decision', '');
  renderQueue();
  try {
    if (!canReview()) throw new Error('Enable approver access using Access to read this action.');
    const result = await request(`/approvals/${id}`, undefined, true);
    if (reviewId !== id) return;
    review = result;
    renderReview(); text('approval-access-state', 'Approver access verified');
  } catch (err) {
    if (reviewId === id) { text('review-title', 'Review unavailable'); text('review-status', err.message); }
  }
}
function renderReview() {
  if (!review) return;
  text('review-title', actionName(review.action_key)); text('review-decision', human(review.decision));
  el('review-decision').className = `badge${review.decision === 'approved' ? ' success' : ''}`;
  const p = review.edited || review.original;
  const content = p.draft ? `Subject: ${p.draft.subject}\n\n${p.draft.body}` : p.start ? `Starts: ${new Date(p.start).toLocaleString()}\nEnds: ${new Date(p.end).toLocaleString()}\nTimezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}` : p.subject ? `Subject: ${p.subject}\n\n${p.body}` : `Requested action: ${human(p.tool || 'Representative review')}`;
  text('review-content', `Recipient: ${review.recipient || 'Not available'}\n\n${content}`);
  const expired = Date.parse(review.expires_at) <= Date.now();
  el('approve-action').disabled = review.decision !== 'pending' || expired;
  el('reject-action').disabled = review.decision !== 'pending' || expired;
  el('approve-action').hidden = review.decision !== 'pending';
  el('reject-action').hidden = review.decision !== 'pending';
  el('execute-action').hidden = review.decision !== 'approved' || expired || review.action_key.startsWith('TOOL:');
  text('review-status', expired ? 'This review has expired.' : review.decision === 'approved' ? 'Approved. Run the action when you are ready.' : review.decision === 'rejected' ? 'Rejected. This action will not run.' : `Expires ${new Date(review.expires_at).toLocaleString()}.`);
}
for (const [id, decision] of [['approve-action', 'approved'], ['reject-action', 'rejected']]) {
  el(id).addEventListener('click', () => busy(el(id), async () => {
    const decisionId = reviewId;
    el('approve-action').disabled = true; el('reject-action').disabled = true;
    try { await request(`/approvals/${decisionId}`, { decision }, true); if (reviewId === decisionId && review) review.decision = decision; await refresh(); }
    catch (err) { if (reviewId === decisionId) { renderReview(); text('review-status', err.message); } return; }
    if (reviewId === decisionId) {
      renderReview();
      if (decision === 'approved' && !el('execute-action').hidden) el('execute-action').focus();
    }
  }));
}
el('execute-action').addEventListener('click', () => busy(el('execute-action'), async () => {
  const executionId = reviewId;
  try {
    const result = await request(`/approvals/${executionId}/execute`, {}, true);
    await refresh();
    if (reviewId !== executionId) return;
    el('execute-action').hidden = true;
    text('review-status', result.queued ? 'Queued in n8n. The journey will update when the action finishes.' : result.available === false ? 'That time is no longer available. Choose another slot.' : 'Action completed. Its result is recorded in Activity.');
    text('review-decision', result.queued ? 'Queued' : result.available === false ? 'Unavailable' : 'Completed');
  } catch (err) { if (reviewId === executionId) text('review-status', err.message); }
}));

function schedulePoll() {
  clearTimeout(poll);
  if (currentEvent && !terminal.has(progress?.status) && !document.hidden) poll = setTimeout(() => refresh(), 4000);
}
async function refresh() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const results = await Promise.all([request('/api/dashboard'), request('/api/leads'), currentEvent ? request(`/api/events/${currentEvent}`) : Promise.resolve(null)]);
      dashboard = results[0]; leads = results[1].leads; progress = results[2];
      if (progress?.lead_id) currentLead = progress.lead_id;
      el('auth').hidden = true; el('app-content').hidden = false; el('error').hidden = true;
      renderDashboard();
    } catch (err) {
      if (err.status !== 401 || accessToken) showError(err);
      text('updated', 'Connection unavailable');
      if (err.status === 401) { el('auth').hidden = false; el('app-content').hidden = true; text('mode', 'Access required'); }
    } finally { refreshPromise = null; schedulePoll(); }
  })();
  return refreshPromise;
}
function clearReview() {
  reviewId = ''; review = null; el('review-detail').hidden = true;
  queueSignature = ''; el('all-approvals').checked = false;
}
async function track(ctx) {
  if (refreshPromise) await refreshPromise;
  clearTimeout(poll); currentEvent = ctx.event_id; currentLead = ctx.lead_id || ''; progress = null; clearReview();
  switchView('workspace'); await refresh();
}
el('refresh').addEventListener('click', () => busy(el('refresh'), refresh));
el('workspace-auth').addEventListener('submit', e => {
  e.preventDefault(); accessToken = el('token').value.trim(); el('token').value = '';
  void busy(e.target.querySelector('button'), refresh);
});
el('start-demo').addEventListener('click', () => busy(el('start-demo'), async () => {
  try { await track(await request('/api/workflows/start', {scenario:el('scenario').value||'meeting'})); } catch (err) { showError(err); }
}));
function leadForm(open) {
  el('lead-form').hidden = !open; el('show-lead-form').setAttribute('aria-expanded', String(open));
  if (open) el('lead-form').querySelector('input').focus();
}
el('show-lead-form').addEventListener('click', () => leadForm(el('lead-form').hidden));
el('cancel-lead').addEventListener('click', () => { leadForm(false); el('show-lead-form').focus(); });
el('lead-form').addEventListener('submit', e => {
  e.preventDefault(); const form = e.target;
  void busy(form.querySelector('button:not([type=button])'), async () => {
    const data = new FormData(form), body = Object.fromEntries(data.entries());
    body.consent = data.has('consent'); body.source = 'owner';
    form.dataset.eventId ||= crypto.randomUUID(); body.source_event_id = form.dataset.eventId;
    try {
      const ctx = await request('/api/leads', body);
      if (ctx.halt && !ctx.event_id) throw new Error(`Lead could not proceed: ${(ctx.errors || ctx.blocked || ['Check the submitted fields']).join(', ')}`);
      await track(ctx); form.reset(); delete form.dataset.eventId; leadForm(false);
      if (ctx.duplicate) text('demo-status', 'Existing contact matched. Its original journey is shown; no duplicate outreach was created.');
    } catch (err) { showError(err); }
  });
});
el('simulate-reply').addEventListener('click', () => busy(el('simulate-reply'), async () => {
  try { await request('/api/replies/sample', { lead_id: currentLead }); await refresh(); }
  catch (err) { showError(err); }
}));
el('reply-form').addEventListener('submit', e => {
  e.preventDefault(); const form = e.target;
  void busy(form.querySelector('button'), async () => {
    form.dataset.providerId ||= `owner-reply-${crypto.randomUUID()}`;
    try {
      await request('/api/replies', { lead_id: currentLead, message: new FormData(form).get('message'), provider_id: form.dataset.providerId });
      form.reset(); delete form.dataset.providerId; await refresh();
    } catch (err) { showError(err); }
  });
});
document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(poll); else if (currentEvent) void refresh(); });
void refresh();
