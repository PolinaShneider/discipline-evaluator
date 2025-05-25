import { ENDPOINT } from "./config.js";
import { getBaseUrl, parseJwt } from "./utils.js";

async function fetchDisciplineStructure(disciplineId, token) {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new Error("❌ Неизвестный домен, не удалось определить baseUrl");
  }

  const headers = {
    Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
    Accept: "application/json",
  };

  const infoUrl = `${baseUrl}/api/constructor/disciplines/${disciplineId}/info`;
  const infoRes = await fetch(infoUrl, { headers, credentials: "include" });

  if (!infoRes.ok) {
    const text = await infoRes.text();
    throw new Error(`Ошибка при получении info: ${infoRes.status}\n${text}`);
  }

  const infoData = await infoRes.json();
  const contentId = infoData?.result?.contents?.[0]?.id;

  if (!contentId) {
    throw new Error("❌ Не удалось получить content_id дисциплины");
  }

  const chaptersUrl = `${baseUrl}/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters`;
  const chaptersRes = await fetch(chaptersUrl, {
    headers,
    credentials: "include",
  });

  if (!chaptersRes.ok) {
    const text = await chaptersRes.text();
    throw new Error(
      `Ошибка при получении chapters: ${chaptersRes.status}\n${text}`
    );
  }

  const chaptersData = await chaptersRes.json();
  const chapters = chaptersData?.result?.chapters;

  if (!Array.isArray(chapters) || chapters.length === 0) {
    throw new Error("❌ Главы (chapters) дисциплины не найдены");
  }

  return chapters
    .map((chapter, index) => {
      const sectionTitle = `${index + 1}. ${chapter.name}`;
      const themes = (chapter.themes || [])
        .map((t) => ` - ${t.name}`)
        .join("\n");
      return `${sectionTitle}\n${themes}`;
    })
    .join("\n\n");
}

async function evaluateDiscipline({ disciplineId, referenceText, token }) {
  const courseText = await fetchDisciplineStructure(disciplineId, token);
  const body = { course_text: courseText };
  if (referenceText) body.reference_text = referenceText;

  const response = await fetch(`${ENDPOINT}/evaluate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ошибка API: ${response.status}\n${text}`);
  }

  return await response.json();
}

export { evaluateDiscipline };
