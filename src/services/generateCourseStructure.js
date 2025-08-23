export async function generateCourseStructure({
  title,
  keywords,
  level,
  hours,
  context,
  openAiApiKey,
  approach = "zero-shot",
}) {
  const levelPrompt =
    {
      бакалавриат:
        "Ты разрабатываешь программу курса для студентов бакалавриата, которые впервые сталкиваются с этими темами. Сосредоточься на основных понятиях.",
      магистратура:
        "Ты разрабатываешь программу курса для студентов магистратуры, которые уже знакомы с базовыми аспектами и готовы к более глубокому изучению предмета.",
    }[level.toLowerCase()] || "";

  const keywordsPrompt = keywords?.length
    ? `Преподаватель попросил включить следующие темы: ${keywords.join(", ")}. `
    : "";

  const hoursPrompt = hours
    ? `Программа рассчитана на ${hours} академических лекционных часов. Исходя из этого, определи оптимальное количество материала для включения в курс. `
    : "";

  const approachPrompt =
    {
      "chain-of-thought": `Начни с анализа того, какие знания, умения и навыки у студентов уже есть до начала курса. Затем, для каждого раздела курса, объясни, почему ты выбрал именно эти темы и подтемы...`,
      "tree-of-thought": `Смоделируй ситуацию, где 100 экспертов создают курс по дисциплине...`,
      "few-shot": "", // можно подключить примеры
      "zero-shot": "",
    }[approach] || "";

  const basicInstruction =
    "Критически важно, чтобы ответ состоял только из разделов и тем и не включал никакую дополнительную информацию, примечания и комментарии.";

  const prompt = `Ты помощник преподавателя. Разработай структуру курса по дисциплине «${title}». ${levelPrompt} ${hoursPrompt}${keywordsPrompt}${approachPrompt}${basicInstruction}${
    context
      ? "\n\n---\n\nДля ориентира вот структура похожей дисциплины:\n" + context
      : ""
  }`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "Ты помощник преподавателя, генерируешь только структуру дисциплины.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ошибка запроса к OpenAI: ${errorText}`);
  }

  const json = await response.json();
  return json.choices?.[0]?.message?.content || "";
}
