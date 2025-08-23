// Modern Popup Script for ITMO Discipline Evaluator
// Uses BackgroundApi for all operations instead of direct API calls

import { BackgroundApi, ItmoApi, EvaluationApi } from "../services/index.js";
import { MESSAGE_TYPES } from "../types/index.js";

// Helper function to get ITMO token from settings
async function getItmoTokenFromSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SETTINGS",
    });
    // Response comes wrapped in { success: true, data: {...} }
    const settings = response?.data || response;
    return settings?.itmoToken || "";
  } catch (e) {
    console.error("Could not get ITMO token from settings:", e);
    return "";
  }
}

const DEFAULT_THRESHOLDS = {
  semantic_coherence: 0.5,
  structural_balance: 0.4,
  topic_flow: 0.3,
  sequence_coverage: 0.6,
  graph_coverage: 0.6,
  redundancy: 0.4,
  relevance: 0.5,
  extra_topics_penalty: 0.4,
  final_score: 0.6,
};

function getMetricClass(key, value) {
  const threshold = DEFAULT_THRESHOLDS[key] ?? 0.5;

  if (key === "redundancy" || key === "extra_topics_penalty") {
    if (value <= threshold / 2) return "metric-good";
    if (value <= threshold) return "metric-warning";
    return "metric-bad";
  } else {
    if (value >= threshold + 0.1) return "metric-good";
    if (value >= threshold) return "metric-warning";
    return "metric-bad";
  }
}

function getISUFromCookie(rawToken) {
  if (!rawToken) return null;
  // Use background script's token validation
  return BackgroundApi.validateToken(rawToken)
    .then((result) => result.isu)
    .catch(() => null);
}

function getDisciplineIdFromUrl(tabUrl) {
  const match = tabUrl.match(/\/programs\/(\d+)/);
  return match ? match[1] : null;
}

function isItmoProgramsPage(tabUrl) {
  return /my\.itmo\.(ru|su)/.test(tabUrl) && /programs\/\d+/.test(tabUrl);
}

function isItmoChaptersPage(tabUrl) {
  return isItmoProgramsPage(tabUrl) && tabUrl.includes("p=chapters");
}

function getCurrentTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0] || null);
    });
  });
}

// Modern course structure fetching using BackgroundApi
async function getCourseStructureFromId(disciplineId, token) {
  try {
    const tab = await getCurrentTab();
    const domain = tab?.url || "";

    const result = await BackgroundApi.fetchCourseStructure(
      disciplineId,
      token,
      domain
    );
    return result;
  } catch (error) {
    console.error("❌ Failed to fetch course structure:", error);
    throw error;
  }
}

// Modern evaluation using BackgroundApi
async function evaluateDiscipline(courseText, referenceText = null) {
  try {
    const result = await BackgroundApi.evaluateDiscipline(
      courseText,
      referenceText
    );
    return result;
  } catch (error) {
    console.error("❌ Failed to evaluate discipline:", error);
    throw error;
  }
}

// Modern analytics tracking using BackgroundApi
async function trackEvaluation(data) {
  try {
    await BackgroundApi.trackEvaluation(data);
  } catch (error) {
    console.warn("⚠️ Failed to track analytics:", error);
    // Don't throw - analytics failures shouldn't break the app
  }
}

// Initialize popup when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  const evaluateBtn = document.getElementById("evaluateBtn");
  const createBtn = document.getElementById("createBtn");
  const output = document.getElementById("output");
  const referenceIdInput = document.getElementById("referenceIdInput");
  const resultContainer = document.getElementById("resultContainer");
  const metricsTable = document.getElementById("metricsTable");
  const adviceList = document.getElementById("adviceList");
  const findSimilarBtn = document.getElementById("findSimilarBtn");
  const similarOutput = document.getElementById("similarOutput");
  const generateStructureBtn = document.getElementById("generateStructureBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const debugBtn = document.getElementById("debugBtn");

  // ITMO токен теперь управляется через настройки

  // Load settings and configure UI
  try {
    const response = await chrome.runtime.sendMessage({
      type: "GET_SETTINGS",
    });

    // Response comes wrapped in { success: true, data: {...} }
    const settings = response?.data || response;

    // Hide debug button if not in developer mode
    if (!settings?.developerMode) {
      debugBtn.classList.add("hidden");
    }

    console.log("🔧 Popup settings loaded:", settings);
  } catch (e) {
    console.warn("Could not load settings:", e);
    // Hide debug button by default if can't load settings
    debugBtn.classList.add("hidden");
  }

  // Find similar programs button
  findSimilarBtn.addEventListener("click", async () => {
    try {
      const tab = await getCurrentTab();
      const url = tab?.url || "";
      const id = getDisciplineIdFromUrl(url);
      const token = await getItmoTokenFromSettings();

      if (!isItmoProgramsPage(url)) {
        alert("Перейди на страницу дисциплины");
        return;
      }

      if (!token) {
        alert("Введите токен");
        return;
      }

      findSimilarBtn.disabled = true;
      similarOutput.textContent = "⏳ Поиск похожих программ...";

      const result = await BackgroundApi.findApprovedPrograms(id, token, url);

      if (!result.programs || result.programs.length === 0) {
        similarOutput.textContent = "Совпадений не найдено.";
      } else {
        similarOutput.textContent = result.programs
          .map((p) => `${p.name} (ID: ${p.id})`)
          .join("\n");
      }
    } catch (error) {
      console.error("❌ Find similar error:", error);
      alert("❌ Ошибка: " + error.message);
      similarOutput.textContent = "Ошибка при поиске.";
    } finally {
      findSimilarBtn.disabled = false;
    }
  });

  // Validation function
  async function validateInputs(tabUrl, resetResults = false) {
    const token = await getItmoTokenFromSettings();
    const onItmoPage = isItmoProgramsPage(tabUrl);
    const onChaptersPage = isItmoChaptersPage(tabUrl);

    const userIdEl = document.getElementById("userIdValue");

    try {
      if (token) {
        const validation = await BackgroundApi.validateToken(token);
        userIdEl.textContent = validation.isu || "неизвестен";
      } else {
        userIdEl.textContent = "не настроен";
      }
    } catch (e) {
      userIdEl.textContent = "ошибка";
      console.error("Ошибка при валидации токена:", e);
    }

    const errors = [];
    if (!onItmoPage) {
      errors.push(`Вы не находитесь на нужной странице. Сейчас: ${tabUrl}`);
    }
    if (!token) {
      errors.push("ITMO токен не настроен. Перейдите в настройки расширения.");
    }

    evaluateBtn.disabled = errors.length > 0;
    createBtn.disabled = !onChaptersPage || errors.length > 0;
    output.textContent = errors.length > 0 ? errors.join("\n") : "";

    if (resetResults) {
      resultContainer.classList.add("hidden");
      metricsTable.innerHTML = "";
      adviceList.innerHTML = "";
      output.classList.remove("hidden");
    }
  }

  // Initial validation
  try {
    const tab = await getCurrentTab();
    await validateInputs(tab?.url || "");
  } catch (error) {
    console.error("❌ Initial validation error:", error);
  }

  // ITMO токен теперь управляется через настройки - валидация при загрузке popup

  // Create chapter button
  createBtn.addEventListener("click", async () => {
    try {
      const tab = await getCurrentTab();
      const url = tab?.url || "";
      const id = getDisciplineIdFromUrl(url);
      const token = await getItmoTokenFromSettings();

      if (!isItmoChaptersPage(url)) {
        alert("Перейди на страницу с разделами дисциплины (p=chapters)");
        return;
      }

      createBtn.disabled = true;

      const defaultChapter = {
        order: 1,
        name: "Новый раздел",
        themes: [{ name: "Первая тема", order: 1, resources: [] }],
        program_work_types: [],
      };

      await BackgroundApi.createChapter(id, token, url, defaultChapter);
      alert("✅ Раздел успешно создан!");
    } catch (error) {
      console.error("❌ Create chapter error:", error);
      alert("❌ Не удалось создать раздел: " + error.message);
    } finally {
      createBtn.disabled = false;
    }
  });

  // Evaluate button
  evaluateBtn.addEventListener("click", async () => {
    try {
      const tab = await getCurrentTab();
      const tabUrl = tab?.url || "";
      const id = getDisciplineIdFromUrl(tabUrl);
      const token = await getItmoTokenFromSettings();
      const referenceId = referenceIdInput.value.trim();

      await validateInputs(tabUrl, true);

      if (!token || !isItmoProgramsPage(tabUrl)) {
        return;
      }

      // Store token for next time
      await BackgroundApi.storeToken(token);

      evaluateBtn.disabled = true;
      output.textContent = "⏳ Загружаем структуру дисциплины...";

      // Get course structure
      const courseText = await getCourseStructureFromId(id, token);

      let referenceText = null;
      if (referenceId) {
        output.textContent = `⏳ Загружаем эталон (${referenceId})...`;
        try {
          referenceText = await getCourseStructureFromId(referenceId, token);
        } catch (error) {
          console.warn(
            "⚠️ Failed to load reference, continuing without it:",
            error
          );
        }
      }

      output.textContent = "⏳ Отправляем на оценку...";

      // Evaluate discipline
      const evaluation = await evaluateDiscipline(courseText, referenceText);
      const result = evaluation.result;

      // Hide output and show results
      output.textContent = "";
      output.classList.add("hidden");

      // Track analytics
      await trackEvaluation({
        token,
        disciplineId: id,
        referenceId: referenceId || null,
        metrics: result,
      });

      // Determine which metrics to show
      const referenceProvided = referenceText && referenceText.length > 0;
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

      // Separate metrics into score metrics and detail metrics
      const scoreMetrics = [];
      const otherMetrics = [];

      if (metrics.includes("final_score")) {
        scoreMetrics.push("final_score");
      }

      for (const key of metrics) {
        if (key === "final_score") continue;
        if (key.endsWith("_score")) {
          scoreMetrics.push(key);
        } else {
          otherMetrics.push(key);
        }
      }

      // Render metrics table
      function renderMetricRow(key, value) {
        const cssClass = getMetricClass(key, value);
        return `<tr>
          <td style="padding: 4px;">${key}</td>
          <td style="padding: 4px; text-align: center;" class="${cssClass}">${value.toFixed(
          3
        )}</td>
        </tr>`;
      }

      const scoreRows = scoreMetrics
        .map((key) =>
          result[key] != null ? renderMetricRow(key, result[key]) : ""
        )
        .join("");

      const dividerRow = `<tr><td colspan="2"><hr style="border: none; border-top: 1px solid #ccc; margin: 6px 0;" /></td></tr>`;

      const otherRows = otherMetrics
        .map((key) =>
          result[key] != null ? renderMetricRow(key, result[key]) : ""
        )
        .join("");

      metricsTable.innerHTML =
        scoreRows + (otherRows ? dividerRow + otherRows : "");

      adviceList.innerHTML = result.advice.map((a) => `<li>${a}</li>`).join("");

      resultContainer.classList.remove("hidden");
    } catch (error) {
      console.error("❌ Evaluation error:", error);
      alert("❌ " + error.message);
      output.textContent = "Произошла ошибка. См. детали в консоли.";
      output.classList.remove("hidden");
    } finally {
      evaluateBtn.disabled = false;
    }
  });

  // Generate structure button
  generateStructureBtn.addEventListener("click", async () => {
    try {
      const tab = await getCurrentTab();
      const tabUrl = tab?.url || "";
      const token = await getItmoTokenFromSettings();

      if (!token || !isItmoProgramsPage(tabUrl)) {
        alert(
          "Требуется ITMO токен (настройте в расширении) и страница дисциплины"
        );
        return;
      }

      // Get OpenAI key from settings
      let openaiKey = "";
      try {
        const response = await chrome.runtime.sendMessage({
          type: "GET_SETTINGS",
        });
        console.log("🔑 Generation - response:", response);
        // Response comes wrapped in { success: true, data: {...} }
        const settings = response?.data || response;
        console.log("🔑 Generation - settings:", settings);
        openaiKey = settings?.openaiApiKey || "";
        console.log(
          "🔑 Generation - extracted key:",
          openaiKey ? "Found" : "Empty"
        );
      } catch (e) {
        console.error("Could not get settings:", e);
      }

      // If no key in settings, show error and redirect to settings
      if (!openaiKey) {
        alert(
          "🔑 OpenAI ключ не настроен!\n\n" +
            "Для генерации структуры необходимо настроить OpenAI API ключ.\n\n" +
            "Нажмите кнопку '⚙️ Настройки' внизу popup'а и введите ваш ключ."
        );
        return;
      }

      generateStructureBtn.disabled = true;
      output.textContent = "⏳ Генерация структуры...";

      const disciplineId = getDisciplineIdFromUrl(tabUrl);

      // Generate structure using background API
      console.log(
        "🚀 Popup: Starting structure generation for discipline:",
        disciplineId
      );
      const generationResult = await BackgroundApi.generateStructure(
        disciplineId,
        token,
        tabUrl,
        openaiKey
      );
      console.log("✅ Popup: Generation result:", generationResult);

      const { structure, chapters, summary } = generationResult;

      // Show confirmation dialog with summary
      const confirmMessage = `Название дисциплины: ${summary.title}
Уровень: ${summary.level}

🗂 Требования по трудоемкости:
${summary.apiSummary}

Продолжить создание разделов?`;

      const proceed = confirm(confirmMessage);

      if (!proceed) {
        output.textContent = "Отменено пользователем";
        return;
      }

      output.textContent = "⏳ Создание разделов в системе...";

      // Create chapters in ITMO system
      const creationResults = await BackgroundApi.createChaptersFromStructure(
        disciplineId,
        token,
        tabUrl,
        chapters,
        summary.workTypes
      );

      // Show detailed results with balancing info
      const balancingStatus = summary.balancingSuccess
        ? "✅ Трудоемкость сбалансирована!"
        : "⚠️ Требуется корректировка трудоемкости";

      let balancingDetails = "";
      if (summary.balancingDetails) {
        const details = summary.balancingDetails;
        balancingDetails = `\n\n📊 Анализ трудоемкости:\n`;
        balancingDetails += `Лекции: ${details.actual["Лекция"] || 0}/${
          details.target.lectures
        } тем → ${(details.actual["Лекция"] || 0) * 2}/${
          details.target.lectureHours
        } часов ${details.lecturesMatch ? "✅" : "❌"}\n`;
        balancingDetails += `Лабораторные: ${
          details.actual["Лабораторная работа"] || 0
        }/${details.target.labs} тем → ${
          (details.actual["Лабораторная работа"] || 0) * 2
        }/${details.target.labHours} часов ${
          details.labsMatch ? "✅" : "❌"
        }\n`;
        if (details.target.practices > 0) {
          balancingDetails += `Практики: ${details.actual["Практика"] || 0}/${
            details.target.practices
          } тем → ${(details.actual["Практика"] || 0) * 2}/${
            details.target.practiceHours
          } часов ${details.practicesMatch ? "✅" : "❌"}\n`;
        }
      }

      output.textContent = `✅ Структура создана! ${balancingStatus}`;

      alert(
        `${balancingStatus}\n\n` +
          `📚 Создано разделов: ${creationResults.length}\n` +
          `${balancingDetails}\n\n` +
          `📋 Сгенерированная структура:\n\n${structure}`
      );
    } catch (error) {
      console.error("❌ Generate structure error:", error);
      alert("❌ Ошибка: " + error.message);
    } finally {
      generateStructureBtn.disabled = false;
    }
  });

  // Debug button for troubleshooting
  debugBtn.addEventListener("click", async () => {
    try {
      const tab = await getCurrentTab();
      const tabUrl = tab?.url || "";
      const token = await getItmoTokenFromSettings();

      debugBtn.disabled = true;
      output.textContent = "🔍 Диагностика токенов...\n\n";

      // Test 1: Check token from settings
      output.textContent += `1. Токен из настроек: ${
        token ? "✅ есть" : "❌ нет"
      }\n`;
      if (token) {
        output.textContent += `   Начало: ${token.substring(0, 20)}...\n`;
      }

      // Test 2: Test token validation
      if (token) {
        try {
          output.textContent += `   Длина токена: ${token.length} символов\n`;
          output.textContent += `   Содержит точки: ${
            token.split(".").length
          } частей\n`;

          const validation = await BackgroundApi.validateToken(token);
          output.textContent += `2. Валидация токена: ${
            validation.valid ? "✅ валиден" : "❌ не валиден"
          }\n`;
          if (validation.error) {
            output.textContent += `   Ошибка: ${validation.error}\n`;
          }
          if (validation.isu) {
            output.textContent += `   ISU: ${validation.isu}\n`;
          }
        } catch (e) {
          output.textContent += `3. Валидация токена: ❌ ошибка ${e.message}\n`;
        }
      }

      // Test 4: Test domain detection
      output.textContent += `4. Текущий домен: ${tabUrl}\n`;
      output.textContent += `5. ITMO страница: ${
        isItmoProgramsPage(tabUrl) ? "✅ да" : "❌ нет"
      }\n`;

      // Test 5: Try to get discipline info
      const disciplineId = getDisciplineIdFromUrl(tabUrl);
      output.textContent += `6. ID дисциплины: ${
        disciplineId || "❌ не найден"
      }\n`;

      if (disciplineId && token) {
        output.textContent += "\n🌐 Тестирую API вызов...\n";
        try {
          await BackgroundApi.fetchDisciplineInfo(disciplineId, token, tabUrl);
          output.textContent += "7. API тест: ✅ успешно\n";
        } catch (e) {
          output.textContent += `7. API тест: ❌ ошибка ${e.message}\n`;
        }
      }

      output.textContent +=
        "\n🔍 Проверьте консоль background script для подробностей";
    } catch (error) {
      output.textContent = `❌ Ошибка диагностики: ${error.message}`;
    } finally {
      debugBtn.disabled = false;
    }
  });

  // Settings button
  settingsBtn.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  console.log("🚀 Modern popup script loaded successfully");
});
