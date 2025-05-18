// public/evaluator.js

async function fetchDisciplineStructure(disciplineId, token) {
  const infoUrl = `https://dev.my.itmo.su/api/constructor/disciplines/${disciplineId}/info`;
  const infoRes = await fetch(infoUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const infoData = await infoRes.json();
  const contentId = infoData.result.contents[0].id;

  const chaptersUrl = `https://dev.my.itmo.su/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters`;
  const chaptersRes = await fetch(chaptersUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const chaptersData = await chaptersRes.json();

  const structure = chaptersData.result.chapters
    .map((chapter, index) => {
      const sectionTitle = `${index + 1}. ${chapter.name}`;
      const themes = chapter.themes.map((t) => ` - ${t.name}`).join("\n");
      return `${sectionTitle}\n${themes}`;
    })
    .join("\n\n");

  return structure;
}

async function evaluateDiscipline({ disciplineId, referenceText }) {
  const token = localStorage.getItem("auth._token.itmoId");
  if (!token) return alert("Token not found");

  const courseText = await fetchDisciplineStructure(disciplineId, token);
  const body = { course_text: courseText };
  if (referenceText) body.reference_text = referenceText;

  const response = await fetch("http://localhost:8000/evaluate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = await response.json();
  return result;
}

export { evaluateDiscipline };
