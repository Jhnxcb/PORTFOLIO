'use strict';
(() => {
  const $ = id => document.getElementById(id);
  // Public, read-only Apps Script endpoint. No access code is required.
  const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxIaRYLbkjVbpARiUE6RiDA9qOM-TjELrPD_lKwVtpopkAHtx00hEiyYTeToSGc8BU4/exec';
  const REFRESH_MS = 30000;
  let requestedSheet = new URL(location.href).searchParams.get('sheet') || '';
  const money = n => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sample = { sheets: [{ id: 'sample-mark', name: 'MARK ASHER', charges: [
    ...[['Front Shock #1',442.2],['Caliper',205.7],['Sticker',174.64],['Front Shock #2',437.89],['Rotator',102.87],['Throttle (Atome)',550]].map(([description,amount]) => ({group:'November',description,amount})),
    ...[['Front Shock #1',442.2],['Caliper',205.7],['Sticker',174.64],['Front Shock #2',437.89],['Rotator',102.87],['Swing Arm',788.77],['Brake Rod',194.01],['Rear Brake Shoe Set',167.98]].map(([description,amount]) => ({group:'December',description,amount})),
    {group:'January',description:'Swing Arm',amount:788.77},{group:'February',description:'Swing Arm',amount:788.77}
  ], payments: [{description:'Paid on Hand',amount:1000},{description:'Paid via GCash (ATOME)',amount:550},{description:'Paid via GCash',amount:200},{description:'Paid via GCash',amount:450}], plans: [{name:'Onitsuka Tiger',items:['December','January','February','March','April','May'].map(month=>({month,amount:230.28,status:'NOT PAID'}))}], warnings: [] }] };
  sample.sheets[0].id='1679896166';
  sample.sheets.unshift(...[['0','EXTERNAL'],['1952436282','SPOTIFY'],['1397918618','NETFLIX'],['150455778','MINE']].map(([id,name])=>({id,name,charges:[],payments:[],plans:[],warnings:['Sample only. Live totals will appear after the Apps Script is updated.']})));
  let data = sample, selected = sample.sheets[0].id, person = 'All', month = 'All', live = false, busy = false, lastSync = null;
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  function monthOf(item) {
    const date=String(item.date||'').match(/^\d{4}-(\d{2})(?:-\d{2})?$/);
    if(date&&Number(date[1])>=1&&Number(date[1])<=12)return MONTHS[Number(date[1])-1];
    for(const text of [item.month,item.group,item.description]) {
      const words=String(text||'').toLowerCase().split(/[^a-z]+/);
      const index=MONTHS.findIndex(name=>words.includes(name.toLowerCase())||words.includes(name.slice(0,3).toLowerCase()));
      if(index!==-1)return MONTHS[index];
    }
    return 'Unassigned';
  }
  function personOf(item,sheet,payment=false) {
    if(typeof item.person==='string'&&item.person.trim())return item.person.trim();
    if(/^(SPOTIFY|NETFLIX|EXTERNAL)$/i.test(sheet.name)&&(!payment||item.source==='status')) {
      return String(item.description||'').replace(/\s*\(.*$/,'').replace(/\s+-\s+.*$/,'').trim();
    }
    // The personal report has one owner; its item names are expenses, not people.
    if(/^MARK ASHER$/i.test(sheet.name))return sheet.name;
    return '';
  }
  function matches(item,sheet,payment=false) {
    return (person==='All'||personOf(item,sheet,payment)===person)&&(month==='All'||monthOf(item)===month);
  }
  function renderFilters(sheet) {
    const people=[...new Set([...sheet.charges.map(i=>personOf(i,sheet)),...sheet.payments.map(i=>personOf(i,sheet,true)),...sheet.plans.flatMap(p=>p.items.map(i=>personOf(i,sheet)))].filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    const found=new Set([...sheet.charges,...sheet.payments,...sheet.plans.flatMap(p=>p.items)].map(monthOf));
    const months=[...MONTHS.filter(m=>found.has(m)),...(found.has('Unassigned')?['Unassigned']:[])];
    if(person!=='All'&&!people.includes(person))person='All';
    if(month!=='All'&&!months.includes(month))month='All';
    $('person-filter').innerHTML='<option value="All">All people</option>'+people.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('');
    $('person-filter').value=person; $('person-filter').disabled=!people.length;
    $('month-filter').innerHTML='<option value="All">All months</option>'+months.map(m=>`<option value="${esc(m)}">${esc(m)}</option>`).join('');
    $('month-filter').value=month;
    $('reset-filters').hidden=person==='All'&&month==='All';
  }
  function cents(items) { return items.reduce((sum,item) => sum + Math.round(item.amount * 100), 0); }
  function current() { return data.sheets.find(sheet => sheet.id === selected); }
  function renderAccounts() {
    if(requestedSheet&&data.sheets.some(s=>s.id===requestedSheet))selected=requestedSheet;
    if (!data.sheets.some(s=>s.id === selected)) selected = data.sheets[0].id;
    $('account').innerHTML = data.sheets.map(s=>`<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('account').value = selected;
    $('share').disabled = !live;
    document.title = requestedSheet ? `${current().name} · Finance | The Studio Cove` : 'Finance | The Studio Cove';
    render();
  }
  function render() {
    const sheet = current(), home=!requestedSheet;
    renderFilters(sheet);
    const filteredCharges=sheet.charges.filter(i=>matches(i,sheet)), filteredPayments=sheet.payments.filter(i=>matches(i,sheet,true));
    const summary=home?data.sheets:[{...sheet,charges:filteredCharges,payments:filteredPayments}];
    const total=summary.reduce((sum,s)=>sum+cents(s.charges),0), paid=summary.reduce((sum,s)=>sum+cents(s.payments),0);
    const remaining=home?summary.reduce((sum,s)=>sum+Math.max(cents(s.charges)-cents(s.payments),0),0):total-paid;
    $('reports-home').hidden=!home; $('report-heading').hidden=home; $('report-details').hidden=home;
    $('account-actions').hidden=home; $('report-nav').hidden=home; $('back-reports').hidden=home;
    $('report-filters').hidden=home;
    const unassigned=sheet.payments.filter(i=>(person!=='All'&&!personOf(i,sheet,true)&&(month==='All'||monthOf(i)===month||monthOf(i)==='Unassigned'))||(month!=='All'&&month!=='Unassigned'&&monthOf(i)==='Unassigned'&&(person==='All'||personOf(i,sheet,true)===person)));
    $('filter-note').hidden=home||!unassigned.length;
    $('filter-note').textContent=`${money(cents(unassigned)/100)} in payments has no matching person or month and is excluded from this view.`;
    $('page-title').textContent=home?'Finance':sheet.name;
    $('report-count').textContent=`${data.sheets.length} reports`;
    $('report-cards').innerHTML=data.sheets.map(s=>{
      const balance=cents(s.charges)-cents(s.payments), pending=s.plans.reduce((sum,p)=>sum+cents(p.items.filter(i=>i.status!=='PAID')),0);
      return `<a class="report-card" href="${esc(sheetUrl(s.id).href)}"><div class="report-card-top"><h3>${esc(s.name)}</h3><span aria-hidden="true">↗</span></div><span class="report-label">Remaining</span><strong class="report-balance">${live?money(Math.max(balance,0)/100):'—'}</strong><div class="report-meta"><span>${live?`${s.charges.length} charges`:'Sample report'}</span><span>${live?`${money(cents(s.payments)/100)} paid`:''}</span></div>${live&&pending?`<div class="report-plan">${money(pending/100)} separate installments</div>`:''}${live&&s.warnings.length?'<span class="report-review">Review source totals</span>':''}</a>`;
    }).join('');
    $('balance').textContent=home&&!live?'—':money(Math.max(remaining,0)/100);
    $('balance-caption').textContent=remaining < 0 ? `${money(-remaining/100)} credit` : 'Paid in full';
    $('balance-caption').hidden=remaining>0||(home&&!live);
    $('charges').textContent=home&&!live?'—':money(total/100); $('paid').textContent=home&&!live?'—':money(paid/100);
    const query=$('search').value.trim().toLowerCase();
    const charges=filteredCharges.filter(item=>`${item.description} ${item.group} ${personOf(item,sheet)}`.toLowerCase().includes(query));
    const payments=filteredPayments.filter(item=>`${item.description} ${item.date||''} ${personOf(item,sheet,true)}`.toLowerCase().includes(query));
    $('expense-count').textContent=`${charges.length} items`;
    $('expense-rows').innerHTML=charges.length ? charges.map(item=>`<tr><td>${esc(item.description)}</td><td>${esc(item.group||'Other')}</td><td><span class="badge ${item.status==='PAID'?'paid':''}">${item.status==='PAID'?'PAID':item.status==='NOT PAID'?'UNPAID':'—'}</span></td><td class="numeric">${money(item.amount)}</td></tr>`).join('') : '<tr><td colspan="4" class="empty">No expenses match this view.</td></tr>';
    $('expense-total').textContent=money(cents(charges)/100);
    $('payment-count').textContent=`${payments.length} payments`;
    $('payment-list').innerHTML=payments.length ? payments.map(item=>`<div class="payment-item"><div class="payment-info">${esc(item.description)}${item.date?`<span>${esc(item.date)}</span>`:''}</div><strong>${money(item.amount)}</strong></div>`).join('') : '<p class="empty">No payments found.</p>';
    $('payment-total').textContent=money(cents(payments)/100);
    const plans=sheet.plans.map(plan=>({...plan,items:plan.items.filter(i=>matches(i,sheet))})).filter(p=>p.items.length);
    $('plan-count').textContent=`${plans.length} ${plans.length===1?'plan':'plans'}`;
    $('plans').innerHTML=plans.length ? plans.map(plan=> {
      const pending=plan.items.filter(item=>item.status!=='PAID');
      return `<div class="plan-block"><div class="plan-title"><span>${esc(plan.name)}</span><span>${pending.length} remaining</span></div><div class="installment-grid">${plan.items.map(item=>`<div class="installment-cell"><span>${esc(item.month)}</span><strong>${money(item.amount)}</strong><span class="badge ${item.status==='PAID'?'paid':''}">${esc(item.status==='PAID'?'PAID':item.status==='NOT PAID'?'UNPAID':'REVIEW')}</span></div>`).join('')}</div><div class="plan-footer"><span>Remaining</span><strong>${money(cents(pending)/100)}</strong></div></div>`;
    }).join('') : '<p class="empty">No installments.</p>';
    const warnings=home?data.sheets.filter(s=>s.warnings.length).map(s=>`${s.name}: ${s.warnings.join(' ')}`):sheet.warnings;
    $('notice').hidden=!live||!warnings.length;
    $('notice').textContent=warnings.join(' ');
  }
  function status(message,error=false) {
    $('source-status').textContent=message; $('source-status').parentElement.classList.toggle('error',error);
    $('updated').textContent=lastSync?`Updated ${lastSync.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}`:'';
  }
  function validate(payload) {
    if (!payload || payload.ok !== true || !Array.isArray(payload.sheets) || !payload.sheets.length) throw new Error(payload?.error || 'No published financial sheets were returned.');
    const validItems=items=>Array.isArray(items)&&items.every(item=>item&&typeof item.description==='string'&&typeof item.amount==='number'&&Number.isFinite(item.amount)&&item.amount>=0);
    const ids=new Set();
    for(const sheet of payload.sheets) {
      if(!sheet||typeof sheet.id!=='string'||ids.has(sheet.id)||typeof sheet.name!=='string'||!validItems(sheet.charges)||!validItems(sheet.payments)||!Array.isArray(sheet.plans)||sheet.plans.some(plan=>!plan||typeof plan.name!=='string'||!Array.isArray(plan.items)||plan.items.some(item=>!item||typeof item.amount!=='number'||!Number.isFinite(item.amount)||item.amount<0||typeof item.month!=='string'||typeof item.status!=='string'))||!Array.isArray(sheet.warnings)||sheet.warnings.some(w=>typeof w!=='string')) throw new Error('The connection returned an invalid sheet format. Check the setup guide.');
      ids.add(sheet.id);
    }
    return payload;
  }
  async function sync() {
    if(busy) return false;
    busy=true;
    $('refresh').disabled=true; $('connect').disabled=true;
    const controller=new AbortController(), timeout=setTimeout(()=>controller.abort(),25000);
    try {
      const url=new URL(DEFAULT_ENDPOINT); url.searchParams.set('_',Date.now());
      if(requestedSheet) url.searchParams.set('sheet',requestedSheet);
      const response=await fetch(url,{signal:controller.signal,redirect:'follow',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!response.ok) throw new Error('The spreadsheet service is unavailable. Try again shortly.');
      const result=validate(await response.json());
      if(requestedSheet&&!result.sheets.some(sheet=>sheet.id===requestedSheet)) throw new Error('This sheet is not published.');
      data=result; live=true; lastSync=new Date(); if(requestedSheet)selected=requestedSheet;
      renderAccounts(); if(requestedSheet)setSheetUrl(selected);
      status(result.discovery==='visible-financial-tabs'?'Live · Auto-sync':'Live · Update Apps Script to discover all reports automatically');
      return true;
    } catch(error) {
      let message=error.name==='AbortError'?'The connection timed out. Please retry.':error.message;
      if(/access code/i.test(message)) message='Update the Apps Script deployment with the new script to enable access without a code.';
      status(`Sync failed · ${message}${live?' Showing last successful data.':' Sample data shown.'}`,true);
      return false;
    } finally {clearTimeout(timeout);busy=false;$('refresh').disabled=false;$('connect').disabled=false;}
  }
  function sheetUrl(id) { const url=new URL(location.href);url.search='';url.hash='';url.searchParams.set('sheet',id);return url; }
  function setSheetUrl(id) { history.replaceState(null,'',sheetUrl(id).href); }
  $('share').addEventListener('click',async()=>{
    if(!live)return;
    const url=sheetUrl(selected).href;
    try { await navigator.clipboard.writeText(url); $('share-status').textContent='Link copied'; }
    catch (_) { $('share-status').textContent=url; }
  });
  $('connect').addEventListener('click',sync);
  $('refresh').addEventListener('click',sync);
  $('account').addEventListener('change',()=>{selected=$('account').value;requestedSheet=selected;person='All';month='All';$('search').value='';$('share-status').textContent='';if(live){setSheetUrl(selected);document.title=`${current().name} · Finance | The Studio Cove`;}render();});
  $('search').addEventListener('input',render);
  $('person-filter').addEventListener('change',()=>{person=$('person-filter').value;render();});
  $('month-filter').addEventListener('change',()=>{month=$('month-filter').value;render();});
  $('reset-filters').addEventListener('click',()=>{person='All';month='All';$('search').value='';render();});
  setInterval(()=>{if(!document.hidden)sync();},REFRESH_MS);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!lastSync||Date.now()-lastSync.getTime()>REFRESH_MS))sync();});
  renderAccounts();
  status('Loading live data · Sample shown');
  sync();
})();
