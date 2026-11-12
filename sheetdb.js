const API_ID = process.env.SHEETDB_API_ID;
const API_TOKEN = process.env.SHEETDB_API_TOKEN;

function baseUrl(action = "") {
  if (!API_ID || API_ID === "YOUR_SHEETDB_API_ID") {
    throw new Error("Chưa cấu hình SHEETDB_API_ID trong .env");
  }
  return `https://sheetdb.io/api/v1/${encodeURIComponent(API_ID)}${action}`;
}

async function callSheetDB(url, options = {}) {
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
  if (options.body) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(15000)
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { message: text }; }

  if (!response.ok) {
    const error = new Error(data.error || data.message || `SheetDB HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function sheetUrl(action, sheet, params = {}) {
  const url = new URL(baseUrl(action));
  url.searchParams.set("sheet", sheet);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export const db = {
  async all(sheet) {
    const result = await callSheetDB(sheetUrl("", sheet));
    if (!Array.isArray(result)) throw new Error(`Sheet ${sheet} trả về dữ liệu không hợp lệ`);
    return result;
  },

  async find(sheet, column, value) {
    const result = await callSheetDB(sheetUrl("/search", sheet, { [column]: value }));
    return Array.isArray(result) ? result : [];
  },

  async insert(sheet, row) {
    return callSheetDB(sheetUrl("", sheet), {
      method: "POST",
      body: JSON.stringify({ data: [row], return_values: true })
    });
  }
};
