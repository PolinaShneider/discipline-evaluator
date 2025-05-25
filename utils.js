import { DEV_ENDPOINT, PROD_ENDPOINT } from "./config.js";

// 🔧 Определение baseUrl по текущему хосту
export function getBaseUrl() {
  const host = location.host;
  if (host.includes("dev.my.itmo.su")) return DEV_ENDPOINT;
  if (host.includes("my.itmo.ru")) return PROD_ENDPOINT;
  return null;
}

// 🧠 Опционально — если нужно вытаскивать id из текущего URL
export function extractDisciplineIdFromUrl() {
  const match = location.pathname.match(/programs\/(\d+)/);
  return match ? match[1] : null;
}

export function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );

    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("❌ parseJwt error:", e);
    return null;
  }
}
