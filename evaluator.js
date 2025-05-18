import { ENDPOINT } from "./config.js";

async function fetchDisciplineStructure(disciplineId, token) {
  const infoUrl = `https://dev.my.itmo.su/api/constructor/disciplines/${disciplineId}/info`;
  const infoRes = await fetch(infoUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const infoData = await infoRes.json();

  if (
    !infoData.result ||
    !infoData.result.contents ||
    infoData.result.contents.length === 0
  ) {
    throw new Error("Не удалось получить содержание дисциплины");
  }

  const contentId = infoData.result.contents[0].id;

  const chaptersUrl = `https://dev.my.itmo.su/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters`;
  const chaptersRes = await fetch(chaptersUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const chaptersData = await chaptersRes.json();

  if (!chaptersData.result || !chaptersData.result.chapters) {
    throw new Error("Не удалось получить главы дисциплины");
  }

  const structure = chaptersData.result.chapters
    .map((chapter, index) => {
      const sectionTitle = `${index + 1}. ${chapter.name}`;
      const themes = chapter.themes.map((t) => ` - ${t.name}`).join("\n");
      return `${sectionTitle}\n${themes}`;
    })
    .join("\n\n");

  return structure;
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

  const result = await response.json();
  return result;
}

export { evaluateDiscipline };
