/**
 * Standalone financial dashboard endpoint. Install as a BOUND script in the
 * financial spreadsheet. Do not replace the portfolio's other Apps Script.
 * Read FINANCE-SETUP.md before deployment. No spreadsheet writes are performed.
 */
function doGet(e) {
  try {
    var properties = PropertiesService.getScriptProperties();
    // Public, read-only discovery of every visible financial tab. Hidden tabs
    // and tabs whose names start with _ are excluded. No code is required.
    var spreadsheetId = properties.getProperty('FINANCE_SPREADSHEET_ID');
    if (!spreadsheetId) throw new Error('Missing spreadsheet configuration');
    var spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    var requestedSheet = String(e && e.parameter && e.parameter.sheet || '');
    var sheets = spreadsheet.getSheets().filter(function(sheet) {
      return !sheet.isSheetHidden() && sheet.getName().charAt(0) !== '_' && (!requestedSheet || String(sheet.getSheetId()) === requestedSheet);
    });
    var result = sheets.map(function(sheet) {
      var range = sheet.getDataRange();
      if (range.getNumRows() * range.getNumColumns() > 100000) throw new Error('A financial sheet is too large. Keep each tab below 100,000 cells.');
      return financeParse_(String(sheet.getSheetId()), sheet.getName(), range.getValues());
    });
    result = result.filter(function(sheet){return sheet.charges.length || sheet.payments.length || sheet.plans.length;});
    if (!result.length) return financeJson_({ok:false,error:'No supported financial report found. Use a financial table layout and keep the tab visible.'});
    return financeJson_({ok:true,sheets:result,discovery:'visible-financial-tabs',updatedAt:new Date().toISOString()});
  } catch (error) {
    // Do not disclose document names, IDs, codes, or internal errors.
    return financeJson_({ok:false,error:'Unable to read the financial sheets. Ask the owner to check the script configuration and sheet layout.'});
  }
}
function financeJson_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function financeText_(value) {
  return value instanceof Date ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(value == null ? '' : value).trim();
}
function financeKey_(value) { return financeText_(value).toUpperCase().replace(/[:\s]+/g,' ').trim(); }
function financeAmount_(value) {
  if (typeof value === 'number') return isFinite(value) ? Math.round(value*100)/100 : null;
  var text = financeText_(value).replace(/[₱,\s]/g,'');
  return /^\d+(\.\d{1,2})?$/.test(text) ? Number(text) : null;
}
function financeParse_(id, name, rows) {
  var result = {id:id,name:name,charges:[],payments:[],plans:[],warnings:[]};
  var headerRow = rows.findIndex(function(row) { var keys=row.map(financeKey_); return keys.indexOf('TYPE')!==-1 && keys.indexOf('DESCRIPTION')!==-1 && keys.indexOf('AMOUNT')!==-1; });
  if (headerRow !== -1) {
    var headers=rows[headerRow].map(financeKey_);
    function field(row,key) { var index=headers.indexOf(key);return index===-1?'':row[index]; }
    rows.slice(headerRow+1).forEach(function(row,index) {
      if(row.every(function(value){return financeText_(value)==='';}))return;
      var type=financeKey_(field(row,'TYPE')), amount=financeAmount_(field(row,'AMOUNT'));
      var description=financeText_(field(row,'DESCRIPTION')), group=financeText_(field(row,'GROUP'))||'Other';
      if(['CHARGE','PAYMENT','INSTALLMENT'].indexOf(type)===-1||amount===null||amount<0||!description){result.warnings.push('Row '+(headerRow+index+2)+' was skipped: check Type, Description and nonnegative Amount.');return;}
      if(type==='INSTALLMENT'){
        var plan=result.plans.find(function(p){return p.name===group;});
        if(!plan){plan={name:group,items:[]};result.plans.push(plan);}
        plan.items.push({month:description,amount:amount,status:financeKey_(field(row,'STATUS')),person:financeText_(field(row,'PERSON'))});
      }else{
        result[type==='CHARGE'?'charges':'payments'].push({description:description,amount:amount,group:group,date:financeText_(field(row,'DATE')),status:financeKey_(field(row,'STATUS')),person:financeText_(field(row,'PERSON'))});
      }
    });
  } else {
    // Horizontal monthly blocks, named status tables, transactions and summaries.
    var months=['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];
    var width=rows.reduce(function(max,row){return Math.max(max,row.length);},0), blocks=[];
    for(var r=0;r<rows.length;r++)for(var c=0;c<width;c++){
      var key=financeKey_(rows[r][c]);
      if((months.indexOf(key)!==-1&&financeAmount_(rows[r][c+1])===null)||key==='TRANSACTIONS'||key==='OVERALL'||key==='SUMMARY') blocks.push({row:r,col:c,name:financeText_(rows[r][c]),kind:key==='TRANSACTIONS'?'payments':key==='OVERALL'||key==='SUMMARY'?'summary':'charges'});
    }
    // Named status tables: EXTERNAL, ATOME, BILLEASE, HOME CREDIT, etc.
    for(var ri=0;ri<rows.length;ri++)for(var ci=0;ci<width;ci++){
      var title=financeText_(rows[ri][ci]);
      if(!title || financeAmount_(rows[ri][ci+1])!==null || blocks.some(function(b){return b.row===ri&&b.col===ci;}))continue;
      var next=rows[ri+1]||[], status=financeKey_(next[ci+2]);
      if((status==='PAID'||status==='NOT PAID')&&financeAmount_(next[ci+1])!==null)blocks.push({row:ri,col:ci,name:title,kind:/installment|\d+\s*[- ]?\s*(?:mnths|months)/i.test(title)?'plan':'charges'});
    }
    // Also accept status tables with a blank first-row heading. Their first
    // item is identified by a label, numeric amount and explicit status.
    for(var col=0;col<width-2;col++){
      var first=rows[0]||[], second=rows[1]||[];
      if(!financeText_(first[col])&&financeText_(second[col])&&financeAmount_(second[col+1])!==null&&['PAID','NOT PAID'].indexOf(financeKey_(second[col+2]))!==-1&&!blocks.some(function(b){return b.row===0&&b.col===col;}))blocks.push({row:0,col:col,name:name+' '+(col+1),kind:'charges'});
    }
    var summaries={}, summaryGroups=[];
    blocks.forEach(function(block){
      var other=blocks.filter(function(b){return b.row===block.row&&b.col>block.col;}).map(function(b){return b.col;});
      var end=Math.min.apply(null,other.concat([width]));
      // Empty separator columns delimit monthly blocks; merged headings leave
      // blanks only in the heading row, so inspect the first item row as well.
      for(var sep=block.col+1;sep<end;sep++)if(!financeText_(rows[block.row][sep])&&!financeText_((rows[block.row+1]||[])[sep])){end=sep;break;}
      var plan={name:block.name.replace(/\s*\(\d+[- ]?(?:mnths|months)\)/i,''),items:[]};
      for(var rr=block.row+1;rr<rows.length;rr++){
        if(blocks.some(function(b){return b.row===rr&&b.col>=block.col&&b.col<end;}))break;
        var row=rows[rr], label=financeText_(row[block.col]), labelKey=financeKey_(label);
        if(!label)continue;
        var amount=null;
        for(var cc=block.col+1;cc<end;cc++){var possible=financeAmount_(row[cc]);if(possible!==null){amount=possible;break;}}
        if(labelKey==='TOTAL'||labelKey==='TOTAL CHARGES'){
          if(block.kind==='summary'){summaries.total=amount;continue;}
          break;
        }
        if(block.kind==='summary'){
          if(labelKey==='MONEY PAID'||labelKey==='PAID')summaries.paid=amount;
          if(labelKey==='REMAINING BALANCE')summaries.balance=amount;
          if(['MONEY PAID','PAID','REMAINING BALANCE','TOTAL','TOTAL CHARGES'].indexOf(labelKey)===-1&&amount!==null)summaryGroups.push({name:label,amount:amount});
          continue;
        }
        if(amount===null||amount<0){result.warnings.push('Check '+block.name+' / '+label+': its amount was not recognized.');continue;}
        if(block.kind==='plan')plan.items.push({month:label,amount:amount,status:financeKey_(row[block.col+2])});
        else result[block.kind].push({group:block.name,description:label,amount:amount,status:block.kind==='charges'?financeKey_(row[block.col+2]):''});
      }
      if(block.kind==='plan'&&plan.items.length)result.plans.push(plan);
    });
    var sum=function(items){return items.reduce(function(total,item){return total+Math.round(item.amount*100);},0);};
    summaryGroups.forEach(function(entry){
      var key=financeKey_(entry.name).replace(/[^A-Z0-9]/g,'');
      var matching=result.charges.filter(function(item){return financeKey_(item.group).replace(/[^A-Z0-9]/g,'').indexOf(key)!==-1;});
      if(!matching.length)result.warnings.push('SUMMARY category '+entry.name+' has no matching detail block and is excluded from the calculated balance.');
    });
    if(!result.charges.length && !result.payments.length && !result.plans.length) result.warnings.push('No supported financial blocks found. Use the table layout in FINANCE-SETUP.md.');
    if(summaries.total!=null&&Math.abs(Math.round(summaries.total*100)-sum(result.charges))>1)result.warnings.push('The sheet TOTAL differs from the parsed charges. Review the source layout before relying on this balance.');
    if(summaries.paid!=null&&Math.abs(Math.round(summaries.paid*100)-sum(result.payments))>1)result.warnings.push('The sheet MONEY PAID differs from the parsed payments. Review the source layout.');
    if(summaries.balance!=null&&Math.abs(Math.round(summaries.balance*100)-(sum(result.charges)-sum(result.payments)))>1)result.warnings.push('The sheet REMAINING BALANCE differs from the calculated balance. This page uses charges minus payments.');
  }
  // A PAID marker records settlement for status-based reports. When a sheet
  // has a transaction ledger, that ledger is the payment source to avoid
  // counting the same settlement twice.
  if(!result.payments.length){
    result.charges.forEach(function(item){if(item.status==='PAID')result.payments.push({description:item.description,group:item.group,amount:item.amount,source:'status',person:item.person||'',date:item.date||''});});
  }
  result.plans.forEach(function(plan){if(plan.items.some(function(item){return item.status!=='PAID'&&item.status!=='NOT PAID';}))result.warnings.push('Some installment statuses are unrecognized. They are counted as outstanding until marked PAID.');});
  return result;
}
