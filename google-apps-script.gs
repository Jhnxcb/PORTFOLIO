/**
 * Google Apps Script JSON endpoint for acquaintance-voting.html.
 *
 * This script reads the private Google Form response sheet but returns only
 * aggregate totals for the configured voting columns.
 */
const CONFIG = {
  spreadsheetId: "16dXC1pAh_DydrgzT4ztSjBeM0VNp2yNMCaVX0x7mKow",
  sheetName: "Form Responses 1",
  resultsVisible: true,
  hiddenMessage: "Results will be published after voting closes.",
  categories: [
    { name: "Department", headerPattern: /^DEPARTMENT:?$/i },
    { name: "Program", headerPattern: /^PROGRAMS?:?$/i },
    { name: "Theme", headerPattern: /^THEMES?:?$/i }
  ]
};

function doGet() {
  try {
    const cache = CacheService.getScriptCache();
    const cachedPayload = cache.get("acquaintance-voting-results-v1");
    if (cachedPayload) {
      return ContentService
        .createTextOutput(cachedPayload)
        .setMimeType(ContentService.MimeType.JSON);
    }

    const payload = buildResults_();
    const json = JSON.stringify(payload);
    cache.put("acquaintance-voting-results-v1", json, 15);
    return ContentService
      .createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(error.message || error) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buildResults_() {
  if (!CONFIG.resultsVisible) {
    return {
      resultsVisible: false,
      message: CONFIG.hiddenMessage,
      updatedAt: new Date().toISOString()
    };
  }

  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  const sheet = spreadsheet.getSheetByName(CONFIG.sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${CONFIG.sheetName}`);

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length === 0) return emptyResults_();

  const headers = values[0].map(value => String(value).trim());
  const rows = values.slice(1);
  const categoryColumns = CONFIG.categories.map(category => ({
    name: category.name,
    indexes: headers.reduce((matches, header, index) => {
      if (category.headerPattern.test(header)) matches.push(index);
      category.headerPattern.lastIndex = 0;
      return matches;
    }, [])
  }));

  const missing = categoryColumns.filter(category => category.indexes.length === 0);
  if (missing.length > 0) {
    throw new Error(`Voting column not found: ${missing.map(item => item.name).join(", ")}`);
  }

  let totalResponses = 0;
  const activeColumnIndexes = [...new Set(categoryColumns.flatMap(category => category.indexes))];

  const categories = categoryColumns.map(category => {
    const counts = new Map();

    rows.forEach(row => {
      category.indexes.forEach(index => {
        const answer = normalizeAnswer_(row[index]);
        if (!answer) return;
        counts.set(answer, (counts.get(answer) || 0) + 1);
      });
    });

    const totalVotes = [...counts.values()].reduce((sum, count) => sum + count, 0);
    const options = [...counts.entries()]
      .map(([name, count]) => ({
        name,
        count,
        percent: totalVotes ? (count / totalVotes) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { name: category.name, totalVotes, options };
  });

  rows.forEach(row => {
    if (activeColumnIndexes.some(index => normalizeAnswer_(row[index]))) totalResponses += 1;
  });

  return {
    resultsVisible: true,
    updatedAt: new Date().toISOString(),
    totalResponses,
    categories
  };
}

function normalizeAnswer_(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function emptyResults_() {
  return {
    resultsVisible: true,
    updatedAt: new Date().toISOString(),
    totalResponses: 0,
    categories: []
  };
}

/** Run this once in the Apps Script editor to verify the output in the log. */
function testResults() {
  console.log(JSON.stringify(buildResults_(), null, 2));
}
