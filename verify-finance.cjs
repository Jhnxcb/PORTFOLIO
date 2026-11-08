const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let properties = {}, requested = [];
const fixture = Array.from({length:21},()=>Array(16).fill(''));
function block(column,title,items,totalRow){fixture[0][column]=title;items.forEach((item,index)=>item.forEach((value,offset)=>fixture[index+1][column+offset]=value));fixture[totalRow][column]='TOTAL:';fixture[totalRow][column+1]=items.reduce((n,row)=>n+row[1],0);}
block(0,'NOVEMBER',[['Front Shock #1',442.2],['Caliper',205.7],['Sticker',174.64],['Front Shock #2',437.89],['Rotator',102.87],['Throttle (Atome)',550]],8);
block(3,'DECEMBER',[['Front Shock #1',442.2],['Caliper',205.7],['Sticker',174.64],['Front Shock #2',437.89],['Rotator',102.87],['Swing Arm',788.77],['Brake Rod',194.01],['Rear Brake Shoe Set',167.98]],10);
block(6,'JANUARY',[['Swing Arm',788.77]],3);
block(9,'FEBRUARY',[['Swing Arm',788.77]],3);
block(12,'ONITSUKA TIGER (6-mnths)',['December','January','February','March','April','May'].map(m=>[m,230.28,'NOT PAID']),8);
fixture[14][3]='TRANSACTIONS:';
[['Paid on Hand',1000],['Paid via GCash (ATOME)',550],['Paid via GCash',200],['Paid via GCash',450]].forEach((row,index)=>{fixture[15+index][3]=row[0];fixture[15+index][4]=row[1];});
fixture[20][3]='TOTAL:';fixture[20][4]=2200;
fixture[15][0]='OVERALL:';fixture[16][0]='TOTAL:';fixture[16][1]=6004.9;fixture[17][0]='MONEY PAID:';fixture[17][1]=2200;fixture[18][0]='REMAINING BALANCE';fixture[18][1]=3805;
let tabs=[];
const ctx=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties[key]})},SpreadsheetApp:{openById:id=>{assert.equal(id,'test-spreadsheet');return {getSheets:()=>tabs};}},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})},Utilities:{formatDate:()=> '2026-11-08'},Session:{getScriptTimeZone:()=> 'Asia/Manila'}});
vm.runInContext(fs.readFileSync('finance-google-apps-script.gs','utf8'),ctx);
const sum=items=>items.reduce((n,i)=>n+Math.round(i.amount*100),0);
const result=ctx.financeParse_('1','MARK ASHER',fixture);
assert.equal(result.charges.length,16);assert.equal(sum(result.charges),600490);assert.equal(sum(result.payments),220000);assert.equal(sum(result.charges)-sum(result.payments),380490);assert.equal(sum(result.plans[0].items),138168);assert.equal(result.plans[0].name,'ONITSUKA TIGER');assert.equal(result.plans[0].items.length,6);assert.equal(result.warnings.length,1);assert.match(result.warnings[0],/REMAINING BALANCE/);
const structured=[['Type','Group','Description','Amount','Status','Date'],['CHARGE','November','Shock',442.2,'',''],['PAYMENT','','GCash',200,'','2026-11-08'],['INSTALLMENT','Shoes','December',230.28,'PAID',''],['INSTALLMENT','Shoes','January',230.28,'MAYBE',''],['PAYMENT','','bad negative',-20,'',''],['CHARGE','','bad number','abc','','']];
const normalized=ctx.financeParse_('2','NEW',structured);
assert.equal(sum(normalized.charges),44220);assert.equal(sum(normalized.payments),20000);assert.equal(normalized.plans[0].items[0].status,'PAID');assert.equal(normalized.warnings.length,3);
function tab(name,id,values,hidden=false){return {getName:()=>name,getSheetId:()=>id,isSheetHidden:()=>hidden,getDataRange:()=>{requested.push(name);return {getNumRows:()=>values.length,getNumColumns:()=>values[0].length,getValues:()=>values};}};}
tabs=[tab('MARK ASHER',1,fixture),tab('MINE',2,structured),tab('PRIVATE ADMIN',3,structured,true),tab('_DRAFT',5,structured),tab('Notes',6,[['Notes only']])];
properties.FINANCE_SPREADSHEET_ID='test-spreadsheet';
let response=ctx.doGet({parameter:{}});assert.equal(response.ok,true);assert.equal(response.sheets.length,2);assert.equal(response.discovery,'visible-financial-tabs');assert.deepEqual(requested,['MARK ASHER','MINE','Notes']);
requested=[];response=ctx.doGet({parameter:{sheet:'3'}});assert.equal(response.ok,false);assert.equal(requested.length,0);
response=ctx.doGet({parameter:{sheet:'2'}});assert.equal(response.ok,true);assert.equal(response.sheets.length,1);assert.equal(response.sheets[0].name,'MINE');assert.deepEqual(requested,['MINE']);
tabs.push(tab('MARK NEW',4,structured));response=ctx.doGet({parameter:{}});assert.equal(response.sheets.length,3);
requested=[];response=ctx.doGet({parameter:{sheet:'4'}});assert.equal(response.sheets.length,1);assert.equal(response.sheets[0].id,'4');assert.deepEqual(requested,['MARK NEW']);
console.log('PASS: exact financial totals, structured rows, public access without codes, hidden/draft tabs excluded, dedicated sheet filtering, automatic new-sheet discovery.');

function statusTable(groups){
  const height=Math.max(...groups.map(g=>g.items.length))+3,rows=Array.from({length:height},()=>Array(groups.length*4).fill(''));
  groups.forEach((g,index)=>{const col=index*4;rows[0][col]=g.name;g.items.forEach((item,i)=>item.forEach((v,c)=>rows[i+1][col+c]=v));rows[g.items.length+2][col]='TOTAL:';rows[g.items.length+2][col+2]=g.items.reduce((s,i)=>s+(i[2]==='PAID'?0:i[1]),0);});return rows;
}
const extGroups=[{name:'EXTERNAL',items:[['Judyan (Cash)',100,'NOT PAID'],['Judyan (Load)',105,'NOT PAID'],['Jundhel',50,'NOT PAID'],['Benjo',200,'NOT PAID'],['Chrischelle',55,'NOT PAID'],['Rusty',150,'NOT PAID']]},{name:'EXTERNAL ATOME',items:[['Trexie',623,'NOT PAID'],['Jundhel',189.5,'NOT PAID'],['Reggs',155,'NOT PAID'],['Jundhel',139,'NOT PAID']]},{name:'Azaliah - Atome Cash',items:[['Azaliah',798.67,'PAID'],['Azaliah',798.67,'NOT PAID'],['Azaliah',798.67,'NOT PAID']]}];
let ext=ctx.financeParse_('0','EXTERNAL',statusTable(extGroups));assert.equal(sum(ext.charges)-sum(ext.payments),336384);assert.equal(sum(ext.payments),79867);assert.equal(ext.plans.length,0);
const spotifyRows=statusTable(['NOVEMBER','DECEMBER','JANUARY'].map(name=>({name,items:['Rusty','Mark','Eds','Aerielle','Joshua','Jacob'].map(person=>[person,50,'NOT PAID'])})));
let spotify=ctx.financeParse_('1952436282','SPOTIFY',spotifyRows);assert.equal(spotify.charges.length,18);assert.equal(sum(spotify.charges)-sum(spotify.payments),90000);spotifyRows[1][2]='PAID';spotify=ctx.financeParse_('1952436282','SPOTIFY',spotifyRows);assert.equal(sum(spotify.charges)-sum(spotify.payments),85000);
const netflix=ctx.financeParse_('1397918618','NETFLIX',statusTable(['NOVEMBER','DECEMBER','NOVEMBER'].map(name=>({name,items:[124,124,124,124,123,169,169].map((n,i)=>['Person '+i,n,'NOT PAID'])}))));assert.equal(netflix.charges.length,21);assert.equal(sum(netflix.charges),287100);
const mineRows=statusTable([{name:'ATOME - NOVEMBER',items:[3527.66].map(n=>['Bill',n,'NOT PAID'])},{name:'ATOME - DECEMBER',items:[['Bill',3641.74,'NOT PAID']]},{name:'BILLEASE - DECEMBER',items:[['Bill',2026,'NOT PAID']]},{name:'HOME CREDIT',items:Array.from({length:12},(_,i)=>['Month '+i,1738,i<10?'PAID':'NOT PAID'])}]);
mineRows[0].push('','SUMMARY','','');mineRows[1].push('','Atome',7169.4,'');
const mine=ctx.financeParse_('150455778','MINE',mineRows);assert.equal(sum(mine.charges)-sum(mine.payments),1267140);assert.equal(sum(mine.payments),1738000);assert.equal(mine.plans.length,0);
console.log('PASS: EXTERNAL balances, Spotify status changes, Netflix duplicate month headings, MINE status tables, summary exclusion, Home Credit paid settlements.');

function makeClient(href,initialResponse) {
  const elements=new Map();
  for(const match of fs.readFileSync('finance.html','utf8').matchAll(/id="([^"]+)"/g))elements.set(match[1],{value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,listeners:{},classList:{toggle(){}},parentElement:{classList:{toggle(){}}},addEventListener(name,fn){this.listeners[name]=fn;}});
  const state={response:initialResponse,requests:[],copied:'',location:{href}};
  const context=vm.createContext({document:{getElementById:id=>elements.get(id),hidden:false,addEventListener(){}},location:state.location,history:{replaceState(_state,_unused,url){state.location.href=url;}},navigator:{clipboard:{async writeText(text){state.copied=text;}}},Intl,URL,AbortController,setTimeout,clearTimeout,setInterval(){},fetch:async url=>{state.requests.push(url);return {ok:true,json:async()=>state.response};}});
  vm.runInContext(fs.readFileSync('finance.js','utf8'),context);
  return {state,el:id=>elements.get(id)};
}
const payload={ok:true,discovery:'visible-financial-tabs',sheets:[{id:'1',name:'Public sheet',charges:[{description:'<img src=x onerror=alert(1)>',group:'March',amount:100},{description:'Shock',group:'April',amount:200}],payments:[{description:'Cash',amount:125}],plans:[],warnings:[]}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const {state,el}=makeClient('https://example.test/finance?sheet=1',payload);
  await tick();assert.equal(state.requests.length,1);assert.equal(state.requests[0].searchParams.has('code'),false);assert.match(el('source-status').textContent,/Live/);assert.match(el('balance').textContent,/175\.00/);assert.match(el('expense-rows').innerHTML,/&lt;img/);assert.equal(state.location.href,'https://example.test/finance?sheet=1');
  await el('share').listeners.click();assert.equal(state.copied,state.location.href);
  el('search').value='Shock';el('search').listeners.input();assert.equal(el('expense-count').textContent,'1 items');assert.match(el('expense-total').textContent,/200\.00/);
  el('search').value='';el('month-filter').value='March';el('month-filter').listeners.change();assert.equal(el('expense-count').textContent,'1 items');assert.match(el('expense-total').textContent,/100\.00/);assert.match(el('balance').textContent,/100\.00/);assert.equal(el('filter-note').hidden,false);assert.match(el('filter-note').textContent,/125\.00/);
  state.response={ok:false,error:'Invalid access code'};await el('refresh').listeners.click();assert.match(el('source-status').textContent,/Update the Apps Script/);assert.match(el('account').innerHTML,/Public sheet/);
  const dedicated=makeClient('https://example.test/finance?sheet=2',payload);await tick();assert.equal(dedicated.state.requests[0].searchParams.get('sheet'),'2');assert.match(dedicated.el('source-status').textContent,/not published/);assert.equal(dedicated.el('share').disabled,true);
  const correct=makeClient('https://example.test/finance?sheet=1',payload);await tick();assert.match(correct.el('source-status').textContent,/Live/);assert.equal(correct.state.requests[0].searchParams.has('code'),false);
  const home=makeClient('https://example.test/finance',payload);await tick();assert.equal(home.state.location.href,'https://example.test/finance');assert.equal(home.el('reports-home').hidden,false);assert.equal(home.el('report-details').hidden,true);assert.match(home.el('report-cards').innerHTML,/finance\?sheet=1/);
  home.state.response={...payload,sheets:[...payload.sheets,{id:'7',name:'NEW REPORT',charges:[{description:'New',amount:50}],payments:[],plans:[],warnings:[]}]};await home.el('refresh').listeners.click();assert.match(home.el('report-cards').innerHTML,/NEW REPORT/);assert.equal(home.el('report-count').textContent,'2 reports');assert.match(home.el('balance').textContent,/225\.00/);
  // Both selectors must affect charges, matching payments, and summary totals.
  const subscription=makeClient('https://example.test/finance?sheet=1952436282',{...payload,sheets:[spotify]});await tick();
  subscription.el('person-filter').value='Rusty';subscription.el('person-filter').listeners.change();assert.equal(subscription.el('expense-count').textContent,'3 items');assert.match(subscription.el('balance').textContent,/100\.00/);
  subscription.el('month-filter').value='November';subscription.el('month-filter').listeners.change();assert.equal(subscription.el('expense-count').textContent,'1 items');assert.match(subscription.el('charges').textContent,/50\.00/);assert.match(subscription.el('paid').textContent,/50\.00/);assert.match(subscription.el('balance').textContent,/0\.00/);assert.equal(subscription.el('filter-note').hidden,true);
  await subscription.el('refresh').listeners.click();assert.equal(subscription.el('person-filter').value,'Rusty');assert.equal(subscription.el('month-filter').value,'November');
  subscription.el('person-filter').value='Mark';subscription.el('person-filter').listeners.change();assert.match(subscription.el('balance').textContent,/50\.00/);assert.equal(subscription.el('payment-count').textContent,'0 payments');
  subscription.el('reset-filters').listeners.click();assert.match(subscription.el('balance').textContent,/850\.00/);assert.equal(subscription.el('expense-count').textContent,'18 items');
  const external=makeClient('https://example.test/finance?sheet=0',{...payload,sheets:[ext]});await tick();assert.match(external.el('person-filter').innerHTML,/Judyan/);assert.doesNotMatch(external.el('person-filter').innerHTML,/Judyan \(Cash\)/);external.el('person-filter').value='Judyan';external.el('person-filter').listeners.change();assert.equal(external.el('expense-count').textContent,'2 items');assert.match(external.el('balance').textContent,/205\.00/);
  const personal=makeClient('https://example.test/finance?sheet=1',{...payload,sheets:[result]});await tick();personal.el('month-filter').value='November';personal.el('month-filter').listeners.change();assert.match(personal.el('filter-note').textContent,/2,200\.00/);assert.match(personal.el('balance').textContent,/1,913\.30/);
  const explicitRows=[['Type','Group','Description','Amount','Status','Person','Date'],['CHARGE','December','Membership',75,'PAID','Ana','2026-12-01']];const explicit=ctx.financeParse_('9','New',explicitRows);assert.equal(explicit.charges[0].person,'Ana');assert.equal(explicit.payments[0].person,'Ana');assert.equal(explicit.payments[0].date,'2026-12-01');
  const dated=makeClient('https://example.test/finance?sheet=9',{...payload,sheets:[explicit]});await tick();dated.el('person-filter').value='Ana';dated.el('person-filter').listeners.change();dated.el('month-filter').value='December';dated.el('month-filter').listeners.change();assert.match(dated.el('paid').textContent,/75\.00/);assert.match(dated.el('balance').textContent,/0\.00/);
  assert.doesNotMatch(fs.readFileSync('finance.html','utf8'),/access-code|connection-dialog/);
  console.log('PASS: automatic loading, person/month combinations, filtered summaries, preserved selections, reset, missing-allocation notices, explicit Person/date fields, HTML escaping, report links, homepage discovery, failed-sync retention.');
})().catch(error=>{console.error(error);process.exitCode=1;});

