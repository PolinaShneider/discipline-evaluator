import { DEV_ENDPOINT, PROD_ENDPOINT } from "../constants/config.js";

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

export function mapLevel(id) {
  return (
    {
      1: "специалитет",
      2: "бакалавриат",
      3: "магистратура",
      4: "аспирантура",
    }[id] || ""
  );
}

export function sumWorkHours(workTypes) {
  return workTypes?.reduce((sum, w) => sum + (w.hours || 0), 0);
}

export async function fetchDisciplineInfo(id, token) {
  const host = location.host.includes("dev")
    ? "https://dev.my.itmo.su"
    : "https://my.itmo.ru";
  const res = await fetch(`${host}/api/constructor/disciplines/${id}/info`, {
    headers: {
      Authorization: decodeURIComponent(token),
      Accept: "application/json",
    },
    credentials: "include",
  });

  if (!res.ok) throw new Error("Ошибка запроса /info");
  return res.json();
}

export async function fetchSimilarDisciplineStructure(name, token) {
  const encoded = encodeURIComponent(name.split(" ")[0]); // только первое слово
  const host = location.host.includes("dev")
    ? "https://dev.my.itmo.su"
    : "https://my.itmo.ru";

  const res = await fetch(
    `${host}/api/constructor/programs/list?limit=15&status_id=6&query=${encoded}`,
    {
      headers: {
        Authorization: decodeURIComponent(token),
        Accept: "application/json",
      },
      credentials: "include",
    }
  );

  const json = await res.json();
  const id = json.result?.programs?.[0]?.id;
  if (!id) return "";

  return await getCourseStructureFromId(id, token);
}
