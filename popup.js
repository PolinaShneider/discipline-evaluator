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

async function getCourseStructureFromId(disciplineId, token) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0].id;
      chrome.tabs.sendMessage(
        tabId,
        { action: "fetchCourse", disciplineId },
        (response) => {
          if (!response || !response.ok) {
            reject(
              new Error(response?.error || "Нет ответа от content script")
            );
          } else {
            resolve(response.courseText);
          }
        }
      );
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const evaluateBtn = document.getElementById("evaluateBtn");
  const output = document.getElementById("output");
  const tokenInput = document.getElementById("tokenInput");
  const referenceIdInput = document.getElementById("referenceIdInput");
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
      const referenceId = referenceIdInput.value.trim();

      validateInputs(tabUrl, true);

      if (!token || !isItmoProgramsPage(tabUrl)) {
        return;
      }

      chrome.storage.local.set({ itmoToken: token });
      evaluateBtn.disabled = true;
      output.textContent = "⏳ Загружаем структуру дисциплины...";

      try {
        const courseText = await getCourseStructureFromId(id, token);

        let ref = "";
        if (referenceId) {
          output.textContent = `⏳ Загружаем эталон (${referenceId})...`;
          ref = await getCourseStructureFromId(referenceId, token);
        }

        const referenceProvided = ref && ref.length > 0;
        output.textContent = "⏳ Отправляем на оценку...";

        const evalResponse = await fetch(`${ENDPOINT}/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            course_text: courseText,
            reference_text: referenceProvided ? ref : null,
          }),
        });

        const json = await evalResponse.json();
        const result = json.result;
        output.textContent = "";
        output.style.display = "none";

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

        adviceList.innerHTML = result.advice
          .map((a) => `<li>${a}</li>`)
          .join("");

        resultContainer.style.display = "block";
      } catch (err) {
        alert("❌ " + err.message);
        output.textContent = "Произошла ошибка. См. детали выше.";
      } finally {
        validateInputs(tabUrl);
      }
    });
  });
});
