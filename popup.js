import { ENDPOINT } from "./config.js";

function getDisciplineIdFromUrl(tabUrl) {
  const match = tabUrl.match(/\/programs\/(\d+)/);
  return match ? match[1] : null;
}

function isItmoProgramsPage(tabUrl) {
  return tabUrl.includes("my.itmo.su") && tabUrl.includes("/programs/");
}

function getCurrentTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    callback(tabs[0]);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const evaluateBtn = document.getElementById("evaluateBtn");
  const output = document.getElementById("output");
  const tokenInput = document.getElementById("tokenInput");
  const referenceTextarea = document.getElementById("referenceTextarea");
  const resultContainer = document.getElementById("resultContainer");
  const metricsTable = document.getElementById("metricsTable");
  const adviceList = document.getElementById("adviceList");

  chrome.storage.local.get(["itmoToken"], (res) => {
    if (res.itmoToken && !tokenInput.value) {
      tokenInput.value = res.itmoToken;
    }
  });

  function validateInputs(tabUrl, resetResults = false) {
    const token = tokenInput.value.trim();
    const onItmoPage = isItmoProgramsPage(tabUrl);

    const errors = [];
    if (!onItmoPage) {
      errors.push(`Вы не находитесь на нужной странице. Сейчас: ${tabUrl}`);
    }
    if (!token) {
      errors.push("Введите токен (auth._token.itmoId без Bearer)");
    }

    evaluateBtn.disabled = errors.length > 0;
    output.textContent = errors.length > 0 ? errors.join("\n") : "";

    if (resetResults) {
      resultContainer.style.display = "none";
      metricsTable.innerHTML = "";
      adviceList.innerHTML = "";
      output.style.display = "block";
    }
  }

  getCurrentTab((tab) => validateInputs(tab?.url || ""));
  tokenInput.addEventListener("input", () =>
    getCurrentTab((tab) => validateInputs(tab?.url || ""))
  );

  evaluateBtn.addEventListener("click", () => {
    getCurrentTab(async (tab) => {
      const tabUrl = tab?.url || "";
      const id = getDisciplineIdFromUrl(tabUrl);
      const token = tokenInput.value.trim();
      const ref = referenceTextarea.value.trim();

      if (!token || !isItmoProgramsPage(tabUrl)) {
        validateInputs(tabUrl);
        return;
      }

      chrome.storage.local.set({ itmoToken: token });
      evaluateBtn.disabled = true;
      output.textContent = "⏳ Загружаем структуру дисциплины...";
      resultContainer.style.display = "none";
      validateInputs(tabUrl, true);
      chrome.tabs.sendMessage(
        tab.id,
        { action: "fetchCourse", disciplineId: id },
        async (response) => {
          if (!response || !response.ok) {
            alert("❌ " + (response?.error || "Нет ответа от content script"));
            output.textContent = "Произошла ошибка при получении структуры.";
            validateInputs(tabUrl);
            return;
          }

          const courseText = response.courseText;
          if (!courseText) {
            output.textContent = "❌ Пустой текст дисциплины.";
            return;
          }

          try {
            output.textContent = "⏳ Отправляем на оценку...";
            const evalResponse = await fetch(`${ENDPOINT}/evaluate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                course_text: courseText,
                reference_text: ref || null,
              }),
            });

            const json = await evalResponse.json();
            const result = json.result;
            output.textContent = "";
            output.style.display = "none";

            // 🔍 Метрики
            const referenceProvided = ref.length > 0;

            const metrics = referenceProvided
              ? [
                  "final_score",
                  "structural_score",
                  "semantic_coherence",
                  "topic_flow",
                  "structural_balance",
                  "sequence_coverage",
                  "graph_coverage",
                  "redundancy",
                  "relevance",
                  "extra_topics_penalty",
                  "coverage_score",
                  "relevance_score",
                ]
              : [
                  "final_score",
                  "structural_score",
                  "semantic_coherence",
                  "structural_balance",
                  "redundancy",
                ];

            metricsTable.innerHTML = metrics
              .map((key) => {
                const value = result[key];
                if (value === null || value === undefined) return "";
                return `<tr><td style="padding: 4px;">${key}</td><td style="padding: 4px;">${value.toFixed(
                  3
                )}</td></tr>`;
              })
              .join("");

            // 💡 Советы
            adviceList.innerHTML = result.advice
              .map((a) => `<li>${a}</li>`)
              .join("");

            resultContainer.style.display = "block";
          } catch (err) {
            alert("Ошибка при отправке на сервис: " + err.message);
            output.textContent = "Произошла ошибка при запросе к API.";
          } finally {
            validateInputs(tabUrl);
          }
        }
      );
    });
  });
});
