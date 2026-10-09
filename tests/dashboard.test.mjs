import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createContext, runInContext} from 'node:vm';

// Run the shipped dashboard script, including its button handlers and refreshes.
// This DOM adapter keeps the asynchronous API regression independent of a browser.
class Element {
  constructor(id = '') {
    this.id = id; this.textContent = ''; this.value = ''; this.hidden = false;
    this.checked = false; this.disabled = false; this.children = [];
    this.dataset = {}; this.style = {}; this.attributes = {}; this.listeners = {};
    this.classList = {toggle() {}};
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  async dispatch(name) {
    await Promise.all((this.listeners[name] || []).map(listener => listener({target: this, preventDefault() {}})));
  }
  querySelector() { return this.children[0] ||= new Element(); }
  focus() {}
}

async function workspace() {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, new Element(id));
    return elements.get(id);
  };
  el('error').hidden = true;
  const otherApproval = {id: 'other-review', lead_id: 'other-lead', action_key: 'SEND_INITIAL_EMAIL:other'};
  const state = {
    progress: {event_id: 'queued-event', status: 'NEW'},
    leads: [], approvals: [otherApproval], calls: [],
    review: {id: 'selected-review', lead_id: 'selected-lead', action_key: 'SEND_INITIAL_EMAIL:selected', decision: 'pending',
      expires_at: '2099-01-01T00:00:00Z', original: {draft: {subject: 'Synthetic request', body: 'Approved fixture content.'}}, recipient: 'fixture@example.net'}
  };
  const context = createContext({
    document: {getElementById: el, createElement: () => new Element(), querySelectorAll: () => [], addEventListener() {}, hidden: false},
    AbortSignal, setTimeout: () => 1, clearTimeout() {},
    fetch: async (path, options) => {
      state.calls.push({path, method: options.method});
      let body;
      if (path === '/api/dashboard') body = {mode: state.mode || 'live', auth: {approver_required: state.approverRequired !== false}, workflow: state.workflow, data_mode: 'synthetic', funnel: [],
        ops: {approvals: state.approvals.length, completed: 0, dead_letters: 0, uncertain: 0},
        ai: {runs: 0, latency_ms: null, cost_usd: null, failures: 0}, approvals: state.approvals, events: []};
      else if (path === '/api/leads') body = {leads: state.leads};
      else if (path === '/api/workflows/start') body = {event_id: 'queued-event', queued: true};
      else if (path === '/api/events/queued-event') body = state.progress;
      else if (path === '/approvals/selected-review') {
        if (state.reviewWait) await state.reviewWait;
        body = state.review;
      }
      else throw new Error(`Unexpected request: ${path}`);
      return {ok: true, json: async () => structuredClone(body)};
    }
  });
  runInContext(await readFile(new URL('../dashboard/app.js', import.meta.url), 'utf8'), context);
  await runInContext('refresh()', context);
  return {el, state, run: expression => runInContext(expression, context)};
}

test('Start workflow keeps refreshing before normalization and scopes approvals to the selected journey', async () => {
  const {el, state, run} = await workspace();
  assert.equal(el('review-count').textContent, 1, 'Initial workspace shows the global queue');
  await el('start-demo').dispatch('click');
  assert.ok(state.calls.some(c => c.path === '/api/workflows/start' && c.method === 'POST'));
  assert.equal(el('error').hidden, true, el('error').textContent);
  assert.equal(el('lead-state').textContent, 'Received');
  assert.equal(el('next-title').textContent, 'Qualifying your lead');
  assert.match(el('updated').textContent, /^Updated /);
  assert.equal(el('review-count').textContent, 0, 'An unrelated review must not appear on the new lead');

  el('all-approvals').checked = true;
  await el('all-approvals').dispatch('change');
  assert.equal(el('review-count').textContent, 1, 'Explicit All leads selection still works');
  el('all-approvals').checked = false;
  await el('all-approvals').dispatch('change');

  state.progress = {...state.progress, lead_id: 'selected-lead', status: 'QUALIFIED', score: 85, route: 'HOT'};
  state.leads = [{id: 'selected-lead', name: 'Synthetic CTO', email: 'fixture@example.net', status: 'QUALIFIED', event_id: 'queued-event'}];
  state.approvals.push({id: 'selected-review', lead_id: 'selected-lead', action_key: 'SEND_INITIAL_EMAIL:selected'});
  await run('refresh()');
  assert.equal(el('error').hidden, true, el('error').textContent);
  assert.equal(el('lead-state').textContent, 'Qualified');
  assert.equal(el('selected-name').textContent, 'Synthetic CTO');
  assert.equal(el('review-count').textContent, 1);
  assert.equal(el('approval-list').children[0].dataset.approvalId, 'selected-review');
  assert.equal(el('next-title').textContent, 'Review the email');

  // A review fetch temporarily clears its record; refresh must stay safe then too.
  let releaseReview;
  state.reviewWait = new Promise(resolve => { releaseReview = resolve; });
  const loadingReview = run("approverToken = 'fixture'; loadReview('selected-review')");
  await run('refresh()');
  assert.equal(el('error').hidden, true, el('error').textContent);
  assert.equal(el('review-title').textContent, 'Loading review');
  assert.equal(el('approve-action').disabled, true);
  assert.equal(el('execute-action').hidden, true);
  releaseReview(); await loadingReview;
  state.reviewWait = null;
  assert.equal(el('review-decision').textContent, 'Pending');
  state.review.decision = 'rejected';
  state.approvals = state.approvals.filter(a => a.id !== 'selected-review');
  await run("loadReview('selected-review')");
  await run('refresh()');
  assert.equal(el('next-title').textContent, 'Action rejected');
  assert.equal(el('execute-action').hidden, true);

  state.progress = {event_id: 'queued-event', lead_id: null};
  await run("track({event_id: 'queued-event', lead_id: null})");
  assert.equal(el('next-title').textContent, 'Processing your request');
  assert.equal(el('review-detail').hidden, true);
  assert.equal(el('error').hidden, true, el('error').textContent);
  assert.match(el('updated').textContent, /^Updated /);
});

test('qualified journeys distinguish drafting, a paused CRM step and a ready approval',async()=>{
 const {el,state,run}=await workspace();await el('start-demo').dispatch('click');
 state.progress={event_id:'queued-event',lead_id:'selected-lead',status:'QUALIFIED'};state.approvals=[];await run('refresh()');
 assert.equal(el('next-title').textContent,'Preparing your email');
 state.progress.processing_error={stage:'CRM sync',code:'PROVIDER_FAILURE',retrying:false};await run('refresh()');
 assert.equal(el('next-title').textContent,'Workflow needs attention');assert.match(el('demo-status').textContent,/CRM sync failed/);assert.equal(el('jump-review').hidden,true);
 state.progress.processing_error.retrying=true;await run('refresh()');assert.equal(el('next-title').textContent,'Retrying the workflow');
 state.progress.processing_error=null;state.approvals=[{id:'selected-review',lead_id:'selected-lead',action_key:'SEND_INITIAL_EMAIL:selected'}];await run('refresh()');
 assert.equal(el('next-title').textContent,'Review the email');assert.equal(el('lead-state').textContent,'Qualified');
});


test('the fresh local mock demo reviews approvals without requiring a made-up token',async()=>{
 const {el,state,run}=await workspace();state.mode='mock';state.approverRequired=false;
 state.progress={event_id:'queued-event',lead_id:'selected-lead',status:'QUALIFIED'};
 state.approvals=[{id:'selected-review',lead_id:'selected-lead',action_key:'SEND_INITIAL_EMAIL:selected'}];
 await el('start-demo').dispatch('click');await run("loadReview('selected-review')");
 assert.equal(el('review-title').textContent,'Email review');assert.equal(el('approve-action').disabled,false);assert.equal(el('open-access').hidden,true);
 assert.equal(el('workflow-map').hidden,true,'Mock mode must not link to another account');
});

test('workflow links use configured connected metadata and reject unrelated URLs',async()=>{
 const {el,state,run}=await workspace();state.workflow={url:'https://example.app.n8n.cloud/workflow/fixture'};await run('refresh()');
 assert.equal(el('workflow-map').hidden,false);assert.equal(el('workflow-canvas').href,state.workflow.url);assert.equal(el('workflow-history').href,state.workflow.url+'/executions');
 state.workflow={url:'https://unrelated.example/workflow/fixture'};await run('refresh()');assert.equal(el('workflow-map').hidden,true);
});
