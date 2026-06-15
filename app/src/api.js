import { API_URL } from "./config";

// timeout wrapper
function fetchWithTimeout(url, options = {}, ms = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function request(path, options = {}, retry = 1) {
  try {
    const res = await fetchWithTimeout(API_URL + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const json = await res.json();
    if (!res.ok && !json.ok) throw new Error(json.msg?.text || "Request failed");
    return json;
  } catch (err) {
    // retry once on network error (not on 4xx/5xx)
    if (retry > 0 && err.name !== "AbortError" && !err.message.includes("failed")) {
      await new Promise(r => setTimeout(r, 500));
      return request(path, options, retry - 1);
    }
    throw err;
  }
}

export const api = {
  get:   (path)       => request(path),
  post:  (path, body) => request(path, { method: "POST",  body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: "PATCH", body: JSON.stringify(body) }),
};
