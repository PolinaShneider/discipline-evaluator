chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "fetchCourse") {
    const { disciplineId } = msg;

    const host = location.host;
    let baseUrl = null;

    if (host.includes("dev.my.itmo.su")) {
      baseUrl = "https://dev.my.itmo.su";
    } else if (host.includes("my.itmo.ru")) {
      baseUrl = "https://my.itmo.ru";
    } else {
      sendResponse({ ok: false, error: "❌ Неизвестный домен" });
      return true;
    }

    // Извлекаем токен из cookie
    const cookieToken = document.cookie
      .split("; ")
      .find((c) => c.startsWith("auth._token.itmoId="))
      ?.split("=")[1];

    if (!cookieToken) {
      sendResponse({ ok: false, error: "❌ Токен не найден в cookies" });
      return true;
    }

    const token = decodeURIComponent(cookieToken);
    const headers = {
      Accept: "application/json",
      Authorization: token,
    };

    // 1. Получаем /info → content_id
    fetch(`${baseUrl}/api/constructor/disciplines/${disciplineId}/info`, {
      method: "GET",
      credentials: "include",
      headers,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка /info: ${res.status}`);
        return res.json();
      })
      .then((infoJson) => {
        const content = infoJson?.result?.contents?.[0];
        if (!content) throw new Error("❌ Не найден content_id в info");

        const contentId = content.id;

        // 2. Получаем /chapters
        return fetch(
          `${baseUrl}/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters`,
          {
            method: "GET",
            credentials: "include",
            headers,
          }
        );
      })
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка /chapters: ${res.status}`);
        return res.json();
      })
      .then((chaptersJson) => {
        const chapters = chaptersJson?.result?.chapters || [];
        if (chapters.length === 0) {
          throw new Error("❌ Разделы (chapters) не найдены");
        }

        const courseText = chapters
          .map((chapter, i) => {
            const title = `${i + 1}. ${chapter.name}`;
            const topics = (chapter.themes || [])
              .map((t) => ` - ${t.name}`)
              .join("\n");
            return `${title}\n${topics}`;
          })
          .join("\n\n");

        sendResponse({ ok: true, courseText });
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true; // async response
  }
});
