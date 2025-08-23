// Background Service Worker for ITMO Discipline Evaluator
// Handles all API operations, token management, and secure communications

import { MESSAGE_TYPES, createResponse } from "../types/messageTypes.js";
import {
  validateToken as validateJwtToken,
  getISUFromToken,
} from "../utils/tokenUtils.js";
import { SettingsManager, Settings } from "../utils/settingsManager.js";
import { ENDPOINT } from "../constants/index.js";

// Secure storage keys
const STORAGE_KEYS = {
  ITMO_TOKEN: "itmoToken",
  OPENAI_KEY: "openaiKey", // Will be session-only, not persistent
  USER_PREFERENCES: "userPreferences",
};

// API Base URLs
function getApiBaseUrl(domain) {
  if (domain.includes("dev.my.itmo.su")) return "https://dev.my.itmo.su";
  if (domain.includes("my.itmo.ru")) return "https://my.itmo.ru";
  return null;
}

// Utility: Create secure headers for ITMO API
function createItmoHeaders(token) {
  return {
    Authorization: decodeURIComponent(token),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

// Token Management Service
class TokenManager {
  static async storeToken(token) {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.ITMO_TOKEN]: token });
      return { success: true };
    } catch (error) {
      console.error("❌ Token storage error:", error);
      return { success: false, error: error.message };
    }
  }

  static async getToken() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.ITMO_TOKEN]);
      return result[STORAGE_KEYS.ITMO_TOKEN] || null;
    } catch (error) {
      console.error("❌ Token retrieval error:", error);
      return null;
    }
  }

  // Get token from ITMO cookies using chrome.cookies API
  static async getTokenFromItmoCookies(domain) {
    try {
      const cookieDomain = domain.includes("dev.my.itmo.su")
        ? "dev.my.itmo.su"
        : "my.itmo.ru";

      console.log(`🍪 Attempting to get cookie from domain: ${cookieDomain}`);

      const cookie = await chrome.cookies.get({
        url: `https://${cookieDomain}`,
        name: "auth._token.itmoId",
      });

      console.log("🍪 Cookie result:", cookie);

      if (cookie && cookie.value) {
        console.log(
          `✅ Found cookie with value length: ${cookie.value.length}`
        );
        return decodeURIComponent(cookie.value);
      }

      console.log("❌ No cookie found or empty value");
      return null;
    } catch (error) {
      console.error("❌ Cookie retrieval error:", error);
      return null;
    }
  }

  // Get token from content script (which has access to page cookies)
  static async getTokenFromContentScript() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tabs || tabs.length === 0) {
        console.log("❌ No active tab found");
        return null;
      }

      const tab = tabs[0];
      if (
        !tab.url ||
        (!tab.url.includes("my.itmo.ru") && !tab.url.includes("my.itmo.su"))
      ) {
        console.log("❌ Not on ITMO domain");
        return null;
      }

      console.log("📡 Requesting token from content script...");

      return new Promise((resolve) => {
        chrome.tabs.sendMessage(
          tab.id,
          { type: "CHECK_TOKEN_AVAILABILITY" },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "❌ Content script error:",
                chrome.runtime.lastError.message
              );
              resolve(null);
              return;
            }

            if (response && response.success && response.data.token) {
              console.log("✅ Got token from content script");
              resolve(response.data.token);
            } else {
              console.log("❌ No token from content script");
              resolve(null);
            }
          }
        );
      });
    } catch (error) {
      console.error("❌ Content script token error:", error);
      return null;
    }
  }

  // Enhanced token getter that tries multiple sources
  static async getTokenWithFallback(domain, providedToken) {
    console.log(
      "🔑 Token fallback - domain:",
      domain,
      "hasProvidedToken:",
      !!providedToken
    );

    // 1. Use provided token if available
    if (providedToken) {
      console.log("✅ Using provided token");
      return providedToken;
    }

    // 2. Try stored token
    const storedToken = await this.getToken();
    if (storedToken) {
      console.log("✅ Using stored token");
      return storedToken;
    }

    // 3. Try to get from content script (which has direct access to page cookies)
    console.log("📡 Trying to get token from content script...");
    const contentToken = await this.getTokenFromContentScript();
    if (contentToken) {
      console.log("✅ Got token from content script, storing for future use");
      await this.storeToken(contentToken);
      return contentToken;
    }

    // 4. Try to get from ITMO cookies using chrome.cookies API as fallback
    if (domain) {
      console.log("🍪 Trying to get token from cookies API...");
      const cookieToken = await this.getTokenFromItmoCookies(domain);
      if (cookieToken) {
        console.log("✅ Got token from cookies API, storing for future use");
        await this.storeToken(cookieToken);
        return cookieToken;
      } else {
        console.log("❌ No token found in cookies API");
      }
    }

    console.log("❌ No token available from any source");
    return null;
  }

  static async validateToken(token) {
    return validateJwtToken(token);
  }
}

// ITMO API Service - Now uses content script proxy for session cookies access
class ItmoApiService {
  static async callContentScriptProxy(
    method,
    endpoint,
    disciplineId,
    body = null
  ) {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || tabs.length === 0) {
          reject(new Error("❌ No active tab found"));
          return;
        }

        const tab = tabs[0];
        if (
          !tab.url ||
          (!tab.url.includes("my.itmo.ru") && !tab.url.includes("my.itmo.su"))
        ) {
          reject(new Error("❌ Not on ITMO domain"));
          return;
        }

        const message = {
          type: "ITMO_API_PROXY",
          data: { method, endpoint, disciplineId, body },
        };
        console.log("📡 Background sending to content script:", message);

        chrome.tabs.sendMessage(tab.id, message, (response) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Content script error: ${chrome.runtime.lastError.message}`
              )
            );
            return;
          }

          if (response && response.success) {
            resolve(response.data);
          } else {
            reject(
              new Error(response?.error || "No response from content script")
            );
          }
        });
      });
    });
  }

  static async fetchDisciplineInfo(disciplineId, token, domain) {
    console.log("🔄 Using content script proxy for discipline info");
    return await this.callContentScriptProxy(
      "GET",
      "/api/constructor/disciplines/{disciplineId}/info",
      disciplineId
    );
  }

  static async fetchCourseStructure(disciplineId, token, domain) {
    console.log("🔄 Using content script proxy for course structure");

    // First get discipline info to extract content ID
    const infoData = await this.fetchDisciplineInfo(
      disciplineId,
      token,
      domain
    );
    const contentId = infoData?.result?.contents?.[0]?.id;

    if (!contentId) {
      throw new Error("❌ Content ID not found");
    }

    // Then fetch chapters using proxy
    const chaptersData = await this.callContentScriptProxy(
      "GET",
      `/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters`,
      disciplineId
    );

    const chapters = chaptersData?.result?.chapters || [];

    if (chapters.length === 0) {
      throw new Error("❌ No chapters found");
    }

    // Format the course structure
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

  static async findApprovedPrograms(disciplineId, token, domain) {
    console.log("🔄 Using content script proxy for finding programs");

    // Get discipline name first using proxy
    const infoData = await this.fetchDisciplineInfo(
      disciplineId,
      token,
      domain
    );
    const title = infoData?.result?.name;

    if (!title) {
      throw new Error("❌ Could not get discipline name");
    }

    console.log(`🔍 Searching for programs with title: "${title}"`);

    // Search for similar programs using proxy
    const encodedQuery = encodeURIComponent(title);
    const searchResults = await this.callContentScriptProxy(
      "GET",
      `/api/constructor/programs/list?limit=15&offset=0&my_disciplines=0&program_type_id=1&status_id=6&education_level_id=2&query=${encodedQuery}`,
      disciplineId
    );

    console.log("🔍 Search results structure:", searchResults);

    // Try different possible structures for the programs data
    let programs = [];
    if (
      searchResults?.result?.programs &&
      Array.isArray(searchResults.result.programs)
    ) {
      programs = searchResults.result.programs;
    } else if (
      searchResults?.result?.data &&
      Array.isArray(searchResults.result.data)
    ) {
      programs = searchResults.result.data;
    } else if (searchResults?.result && Array.isArray(searchResults.result)) {
      programs = searchResults.result;
    } else if (searchResults?.data && Array.isArray(searchResults.data)) {
      programs = searchResults.data;
    } else if (Array.isArray(searchResults)) {
      programs = searchResults;
    } else {
      console.warn("⚠️ Unexpected search results structure:", searchResults);
      programs = [];
    }

    console.log("📋 Extracted programs array:", programs);

    return {
      programs: programs.filter((p) => p.id !== parseInt(disciplineId)),
    };
  }

  static async createChapter(disciplineId, token, domain, chapterData) {
    // Get content ID first using proxy (token managed internally)
    const infoData = await this.fetchDisciplineInfo(
      disciplineId,
      token,
      domain
    );
    const contentId = infoData?.result?.contents?.[0]?.id;

    if (!contentId) {
      throw new Error("❌ Content ID not found");
    }

    // Create chapter using proxy
    return await this.callContentScriptProxy(
      "POST",
      `/api/constructor/programs/${disciplineId}/contents/${contentId}/chapters/create`,
      disciplineId,
      chapterData
    );
  }
}

// OpenAI API Service
class OpenAIService {
  static async generateStructure(prompt, apiKey) {
    if (!apiKey) {
      throw new Error("❌ OpenAI API key is required");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `OpenAI API Error ${response.status}: ${
          errorData.error?.message || "Unknown error"
        }`
      );
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

// External Evaluation API Service
class EvaluationService {
  static async evaluateDiscipline(courseText, referenceText = null) {
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
      throw new Error(`Evaluation API Error ${response.status}: ${text}`);
    }

    return await response.json();
  }
}

// Analytics Service
class AnalyticsService {
  static async trackEvaluation(data) {
    const GA_MEASUREMENT_ID = "G-XE8K3XVTBL";
    const GA_API_SECRET = "EbFJvWbYQ0eDZFemDXDfdw";

    const isu = getISUFromToken(data.token);
    const hashedIsu = isu ? isu : `user-${Date.now()}`;

    const payload = {
      client_id: hashedIsu,
      events: [
        {
          name: "discipline_evaluated",
          params: {
            discipline_id: data.disciplineId,
            reference_id: data.referenceId || "none",
            final_score: data.metrics.final_score,
            ...Object.fromEntries(
              Object.entries(data.metrics)
                .filter(([k, v]) => typeof v === "number")
                .map(([k, v]) => [`metric_${k}`, v])
            ),
          },
        },
      ],
    };

    try {
      const response = await fetch(
        `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
        {
          method: "POST",
          body: JSON.stringify(payload),
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.ok) {
        console.log("📊 Analytics event sent successfully");
        return { success: true };
      } else {
        console.warn("❌ Analytics event failed:", await response.text());
        return { success: false };
      }
    } catch (error) {
      console.error("❌ Analytics error:", error);
      return { success: false, error: error.message };
    }
  }
}

// Structure Generation Handler
class StructureGenerationService {
  static async handleGenerateStructure(data) {
    const { disciplineId, token, domain, openaiKey } = data;

    if (!openaiKey) {
      throw new Error("❌ OpenAI API key is required");
    }

    // Get discipline info using proxy (token managed internally)
    const infoData = await ItmoApiService.fetchDisciplineInfo(
      disciplineId,
      token,
      domain
    );
    const content = infoData?.result?.contents?.[0];

    if (!content) {
      throw new Error("❌ Не удалось получить информацию о дисциплине");
    }

    const title = infoData.result.name;
    const level =
      {
        1: "специалитет",
        2: "бакалавриат",
        3: "магистратура",
        4: "аспирантура",
      }[infoData.result.education_levels[0]?.id] || "бакалавриат";

    const workTypes =
      content?.work_types?.filter(
        (wt) => wt.hours > 0 && wt.name.toLowerCase() !== "контактная работа"
      ) || [];

    if (!workTypes.length) {
      throw new Error("❌ Не удалось получить типы работ из дисциплины");
    }

    const totalHours = workTypes.reduce((sum, wt) => sum + (wt.hours || 0), 0);

    // Create enhanced prompt for OpenAI with strict workload constraints
    const lectureHours =
      workTypes.find((wt) => wt.name.toLowerCase().includes("лекци"))?.hours ||
      0;
    const labHours =
      workTypes.find((wt) => wt.name.toLowerCase().includes("лабор"))?.hours ||
      0;
    const practiceHours =
      workTypes.find((wt) => wt.name.toLowerCase().includes("практ"))?.hours ||
      0;

    // CRITICAL: Account for ITMO's requirement of even hours per theme (2 hours minimum)
    // Each theme will be rounded up to even hours, so we need to plan accordingly
    const lectureThemes = Math.floor(lectureHours / 2); // Each lecture theme = 2 hours
    const labThemes = Math.floor(labHours / 2); // Each lab theme = 2 hours
    const practiceThemes = Math.floor(practiceHours / 2); // Each practice theme = 2 hours

    const prompt = `
🎯 ЗАДАЧА ОПТИМИЗАЦИИ ТРУДОЕМКОСТИ: Создай структуру дисциплины «${title}» для ${level}.

📊 ЖЕСТКИЕ ОГРАНИЧЕНИЯ ПО ТРУДОЕМКОСТИ (НИ БОЛЬШЕ, НИ МЕНЬШЕ):
${workTypes.map((w) => `• ${w.name}: РОВНО ${w.hours} часов`).join("\n")}

🚨 КРИТИЧЕСКИ ВАЖНО (СИСТЕМА ITMO ТРЕБУЕТ ЧЕТНОСТИ):
- Создай МАКСИМУМ 5-6 разделов (не больше!)
- Лекций должно быть РОВНО ${lectureThemes} тем (система создаст ${
      lectureThemes * 2
    } часов = ${lectureHours} часов)
- Лабораторных должно быть РОВНО ${labThemes} тем (система создаст ${
      labThemes * 2
    } часов = ${labHours} часов)
${
  practiceHours > 0
    ? `- Практик должно быть РОВНО ${practiceThemes} тем (система создаст ${
        practiceThemes * 2
      } часов = ${practiceHours} часов)`
    : ""
}
- КАЖДАЯ ТЕМА В ITMO = 2 ЧАСА (система округляет до четных)
- НЕ ДОБАВЛЯЙ СРО ТЕМЫ - система добавит их автоматически

🔢 МАТЕМАТИКА (УЧИТЫВАЯ ОКРУГЛЕНИЕ ITMO):
- Создай ТОЧНО ${lectureThemes} тем с пометкой (лекция)
- Создай ТОЧНО ${labThemes} тем с пометкой (лабораторная)
${
  practiceHours > 0
    ? `- Создай ТОЧНО ${practiceThemes} тем с пометкой (практика)`
    : ""
}
- НЕ СОЗДАВАЙ СРО ТЕМЫ - только лекции и лабораторные${
      practiceHours > 0 ? " и практики" : ""
    }

💡 ВАЖНО: Создавай темы строго по типам:
- Каждая тема должна иметь четко определенный тип работы
- Используй пометки: (лекция), (лабораторная), (практика)

📋 ФОРМАТ (БЕЗ ПОЯСНЕНИЙ):
1. Название раздела 1
 - Тема 1 (лекция)
 - Тема 2 (лабораторная)${practiceHours > 0 ? "\n - Тема 3 (практика)" : ""}
2. Название раздела 2
 - Тема ${practiceHours > 0 ? "4" : "3"} (лекция)
 - Тема ${practiceHours > 0 ? "5" : "4"} (лабораторная)${
      practiceHours > 0 ? "\n - Тема 6 (практика)" : ""
    }

⚡ ПРОВЕРЬ СЕБЯ ПЕРЕД ОТВЕТОМ: 
Посчитай количество тем каждого типа и убедись, что оно точно соответствует ограничениям!`.trim();

    // Generate structure using OpenAI
    const structure = await OpenAIService.generateStructure(prompt, openaiKey);

    if (!structure) {
      throw new Error("❌ Пустой ответ от OpenAI");
    }

    // Parse the generated structure
    const lines = structure.split("\n");
    const chapters = [];
    let current = null;

    lines.forEach((line) => {
      if (/^\d+\.\s/.test(line)) {
        if (current) chapters.push(current);
        current = { name: line.replace(/^\d+\.\s/, "").trim(), themes: [] };
      } else if (line.trim() && current) {
        current.themes.push({ name: line.trim().replace(/^[-•–]\s*/, "") });
      }
    });
    if (current) chapters.push(current);

    // Remove standalone "Самостоятельная работа" chapters created by ChatGPT
    const standaloneIndexes = [];
    chapters.forEach((chapter, index) => {
      const name = chapter.name.toLowerCase();
      if (
        name.includes("самостоятельн") &&
        chapter.themes.every(
          (theme) =>
            theme.name.toLowerCase().includes("самостоятельн") ||
            theme.name.toLowerCase().includes("сро")
        )
      ) {
        standaloneIndexes.push(index);
        console.log(
          `🗑 Найден отдельный раздел СРО для удаления: "${chapter.name}"`
        );
      }
    });

    // Remove standalone СРО chapters (in reverse order to maintain indexes)
    standaloneIndexes.reverse().forEach((index) => {
      const removedChapter = chapters.splice(index, 1)[0];
      console.log(
        `🗑 Удален отдельный раздел СРО: "${removedChapter.name}" с ${removedChapter.themes.length} темами`
      );
    });

    // Remove redundant "Самостоятельная работа по теме X" themes from all chapters
    chapters.forEach((chapter) => {
      const originalLength = chapter.themes.length;
      chapter.themes = chapter.themes.filter((theme) => {
        const name = theme.name.toLowerCase();
        const isRedundantSro =
          name.includes("самостоятельная работа по теме") &&
          (name.includes("(сро)") || name.match(/\d+\s*\(сро\)$/));
        return !isRedundantSro;
      });

      const removedCount = originalLength - chapter.themes.length;
      if (removedCount > 0) {
        console.log(
          `🗑 Удалено ${removedCount} избыточных СРО тем из "${chapter.name}"`
        );
      }
    });

    // Enhanced postprocessing with automatic workload correction
    console.log("📊 Starting workload balancing postprocessing...");

    // Parse and normalize theme types
    chapters.forEach((ch) => {
      ch.themes.forEach((theme) => {
        const match = theme.name.match(/\(([^)]+)\)$/);
        const label = match?.[1]?.toLowerCase().trim();
        const raw = theme.name.replace(/\s*\(([^)]+)\)\s*$/, "").trim();
        theme.rawName = raw;
        theme.label = label;

        // Normalize type labels
        const normalizedType =
          StructureGenerationService.mapWorkTypeLabel(label) || "сро";

        theme.normalizedType = normalizedType;
      });
    });

    // Count current distribution
    const currentCounts = {};
    chapters.forEach((ch) => {
      ch.themes.forEach((theme) => {
        const type = theme.normalizedType;
        currentCounts[type] = (currentCounts[type] || 0) + 1;
      });
    });

    // Target distribution from API (accounting for ITMO's 2-hour rounding)
    const targetCounts = {
      лекция: lectureThemes,
      лабораторная: labThemes,
      практика: practiceThemes,
    };

    console.log("🎯 Target distribution:", targetCounts);
    console.log("📈 Current distribution:", currentCounts);

    // CRITICAL WORKLOAD BALANCING ALGORITHM
    for (const [targetType, targetCount] of Object.entries(targetCounts)) {
      if (targetCount === 0) continue;

      const currentCount = currentCounts[targetType] || 0;
      const diff = targetCount - currentCount;

      console.log(
        `🔍 Checking ${targetType}: target=${targetCount}, current=${currentCount}, diff=${diff}`
      );

      if (diff > 0) {
        // Need to ADD themes of this type
        console.log(`➕ Adding ${diff} themes of type '${targetType}'`);

        // Convert СРО themes to needed type
        let converted = 0;
        for (let i = 0; i < chapters.length && converted < diff; i++) {
          const ch = chapters[i];
          for (let j = 0; j < ch.themes.length && converted < diff; j++) {
            const theme = ch.themes[j];
            if (theme.normalizedType === "сро") {
              theme.normalizedType = targetType;
              theme.name = theme.rawName + ` (${targetType})`;
              converted++;
              console.log(`🔄 Converted "${theme.rawName}" to ${targetType}`);
            }
          }
        }

        // If still need more, add new themes
        if (converted < diff) {
          const remaining = diff - converted;
          if (chapters.length > 0) {
            for (let i = 0; i < remaining; i++) {
              const chapterIndex = i % chapters.length;
              const newTheme = {
                name: `Дополнительная тема ${i + 1} (${targetType})`,
                rawName: `Дополнительная тема ${i + 1}`,
                normalizedType: targetType,
              };
              chapters[chapterIndex].themes.push(newTheme);
              console.log(`➕ Added new theme: "${newTheme.name}"`);
            }
          }
        }
      } else if (diff < 0) {
        // Need to REMOVE themes of this type
        console.log(
          `➖ Removing ${Math.abs(diff)} themes of type '${targetType}'`
        );

        let removed = 0;
        for (let i = 0; i < chapters.length && removed < Math.abs(diff); i++) {
          const ch = chapters[i];
          for (
            let j = ch.themes.length - 1;
            j >= 0 && removed < Math.abs(diff);
            j--
          ) {
            const theme = ch.themes[j];
            if (theme.normalizedType === targetType) {
              // Convert to СРО instead of removing
              theme.normalizedType = "сро";
              theme.name = theme.rawName + " (СРО)";
              removed++;
              console.log(
                `🔄 Converted "${theme.rawName}" from ${targetType} to СРО`
              );
            }
          }
        }
      }
    }

    // Validate and balance chapter structure (even number requirement)
    chapters.forEach((ch) => {
      const lecCount = ch.themes.filter(
        (t) => t.normalizedType === "лекция"
      ).length;
      const labCount = ch.themes.filter(
        (t) => t.normalizedType === "лабораторная"
      ).length;
      if ((lecCount + labCount) % 2 === 1) {
        ch.themes.push({
          name: "Дополнительная тема для выравнивания (СРО)",
          rawName: "Дополнительная тема для выравнивания",
          normalizedType: "сро",
        });
      }
    });

    // СРО темы уже добавлены автоматически выше ✅

    // Recalculate final distribution for reporting
    const finalCounts = {};
    chapters.forEach((ch) => {
      ch.themes.forEach((theme) => {
        const type = theme.normalizedType;
        const reportType =
          {
            лекция: "Лекция",
            лабораторная: "Лабораторная работа",
            практика: "Практика",
            сро: "СРО",
          }[type] || "СРО";
        finalCounts[reportType] = (finalCounts[reportType] || 0) + 1;
      });
    });

    console.log("✅ Final distribution after balancing:", finalCounts);

    const finalSummary = Object.entries(finalCounts)
      .map(([type, count]) => {
        // Показываем реальные часы (как в API): лекции/лабы/практики * 2, СРО как есть
        const realHours = type === "СРО" ? count : count * 2;
        return `— ${type}: ${realHours} ч`;
      })
      .join("\n");

    const apiSummary = workTypes
      .map((w) => `— ${w.name}: ${w.hours} ч`)
      .join("\n");

    // Check if balancing was successful (themes count, not hours)
    const lecturesMatch = (finalCounts["Лекция"] || 0) === lectureThemes;
    const labsMatch = (finalCounts["Лабораторная работа"] || 0) === labThemes;
    const practicesMatch =
      practiceThemes === 0 || (finalCounts["Практика"] || 0) === practiceThemes;

    const balancingSuccess = lecturesMatch && labsMatch && practicesMatch;

    console.log(
      `🎯 Workload balancing: ${balancingSuccess ? "✅ SUCCESS" : "❌ FAILED"}`
    );
    console.log(
      `📊 Lectures: ${
        finalCounts["Лекция"] || 0
      }/${lectureThemes} themes (will be ${
        (finalCounts["Лекция"] || 0) * 2
      }/${lectureHours} hours) ${lecturesMatch ? "✅" : "❌"}`
    );
    console.log(
      `🧪 Labs: ${
        finalCounts["Лабораторная работа"] || 0
      }/${labThemes} themes (will be ${
        (finalCounts["Лабораторная работа"] || 0) * 2
      }/${labHours} hours) ${labsMatch ? "✅" : "❌"}`
    );
    if (practiceThemes > 0) {
      console.log(
        `🎭 Practices: ${
          finalCounts["Практика"] || 0
        }/${practiceThemes} themes (will be ${
          (finalCounts["Практика"] || 0) * 2
        }/${practiceHours} hours) ${practicesMatch ? "✅" : "❌"}`
      );
    }

    return {
      structure,
      chapters,
      summary: {
        title,
        level,
        totalHours,
        finalSummary,
        apiSummary,
        workTypes,
        balancingSuccess,
        balancingDetails: {
          lecturesMatch,
          labsMatch,
          practicesMatch,
          target: {
            lectures: lectureThemes,
            labs: labThemes,
            practices: practiceThemes,
            lectureHours,
            labHours,
            practiceHours,
          },
          actual: finalCounts,
        },
      },
    };
  }

  static async createChaptersFromStructure(data) {
    const { disciplineId, token, domain, chapters, workTypes } = data;

    // Get content ID using proxy (token managed internally)
    const infoData = await ItmoApiService.fetchDisciplineInfo(
      disciplineId,
      token,
      domain
    );
    const contentId = infoData?.result?.contents?.[0]?.id;

    if (!contentId) {
      throw new Error("❌ Не удалось получить contentId");
    }

    const results = [];

    for (let index = 0; index < chapters.length; index++) {
      const ch = chapters[index];
      const parsedThemes = ch.themes.map((t, i) => {
        const match = t.name.match(/\(([^)]+)\)$/);
        const label = match?.[1];
        const rawName = t.name.replace(/\s*\(([^)]+)\)\s*$/, "").trim();
        return {
          name: rawName,
          order: i + 1,
          resources: [],
          label,
        };
      });

      // Map work types
      const wtMap = {};
      parsedThemes.forEach((t) => {
        const selected = this.resolveWorkTypes(t.label, workTypes);
        // Если тип не определен, пропускаем тему (СРО добавим "под капотом")
        if (selected.length === 0) {
          console.log(
            `⚠️ Тема "${t.name}" без типа - пропускаем (тип: "${t.label}")`
          );
          return;
        }

        selected.forEach((wt) => {
          if (!wtMap[wt.program_work_type_id]) {
            wtMap[wt.program_work_type_id] = { ...wt, count: 0 };
          }
          wtMap[wt.program_work_type_id].count += 1;
        });
      });

      // Балансировка уже выполнена на предыдущем этапе - дополнительная не нужна

      // Добавляем СРО часы "под капотом" - математическое распределение
      const sroWorkType = workTypes.find((wt) => {
        const name = wt.name.toLowerCase();
        return (
          name.includes("сро") ||
          name.includes("самостоятельн") ||
          name.includes("self") ||
          name.includes("independent")
        );
      });

      // Логируем все доступные типы работ
      console.log(
        "📋 Доступные типы работ для этой дисциплины:",
        workTypes.map(
          (wt) => `${wt.name} (${wt.hours}ч, ID: ${wt.program_work_type_id})`
        )
      );

      if (sroWorkType && sroWorkType.hours > 0) {
        const targetSroHours = sroWorkType.hours;

        let sroHoursForThisChapter;

        // Для малых значений СРО (меньше количества разделов) - распределяем по 1 часу
        if (targetSroHours < chapters.length) {
          sroHoursForThisChapter = index < targetSroHours ? 1 : 0;
        } else {
          // Для больших значений - используем обычную формулу
          const hoursPerChapter = Math.floor(targetSroHours / chapters.length);
          const remainderHours = targetSroHours % chapters.length;

          sroHoursForThisChapter = hoursPerChapter;
          if (index === chapters.length - 1) {
            sroHoursForThisChapter += remainderHours;
          }
        }

        // Добавляем СРО в wtMap "под капотом"
        wtMap[sroWorkType.program_work_type_id] = {
          ...sroWorkType,
          count: sroHoursForThisChapter,
        };

        console.log(
          `🔧 Под капотом: Раздел "${ch.name}" получил ${sroHoursForThisChapter} СРО часов`
        );
      }

      const payload = {
        order: index + 1,
        name: ch.name,
        themes: parsedThemes.map(({ name, order }) => ({
          name,
          order,
          resources: [],
        })),
        program_work_types: Object.values(wtMap).map((w) => {
          const typeName = w.name.toLowerCase();
          const isSRO =
            typeName.includes("сро") || typeName.includes("самостоятельн");

          return {
            program_work_type_id: w.program_work_type_id,
            hours: isSRO ? w.count : w.count * 2, // СРО: точные часы, остальные: темы * 2
          };
        }),
      };

      const created = await ItmoApiService.createChapter(
        disciplineId,
        token,
        domain,
        payload
      );
      results.push(created);

      // Small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return results;
  }

  static resolveWorkTypes(label, workTypes) {
    const normalized = label?.toLowerCase();
    const target = this.mapWorkTypeLabel(normalized);
    if (!target) return [];
    const match = workTypes.find((wt) =>
      wt.name.toLowerCase().includes(target)
    );
    return match ? [match] : [];
  }

  static mapWorkTypeLabel(label) {
    const map = {
      лекция: "лекция",
      лабораторная: "лабораторная",
      лаб: "лабораторная",
      практика: "практика",
      практическая: "практика",
      сро: "сро",
      консультация: "консультация",
    };
    return map[label];
  }
}

// Message Handler - Main entry point for all background operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;

  console.log(`🔄 Background received message: ${type}`, data);

  // Handle async operations properly
  const handleAsync = async () => {
    try {
      let result;

      switch (type) {
        case MESSAGE_TYPES.VALIDATE_TOKEN:
          result = await TokenManager.validateToken(data.token);
          break;

        case MESSAGE_TYPES.STORE_TOKEN:
          result = await TokenManager.storeToken(data.token);
          break;

        case MESSAGE_TYPES.GET_STORED_TOKEN:
          result = await TokenManager.getToken();
          break;

        case "SETTINGS_UPDATED":
          await Settings.debugLog("Settings updated from options page", data);
          result = { success: true };
          break;

        case "SETTINGS_RESET":
          await Settings.debugLog("Settings reset from options page");
          result = { success: true };
          break;

        case "GET_SETTINGS":
          result = await Settings.getAll();
          break;

        case MESSAGE_TYPES.FETCH_DISCIPLINE_INFO:
          result = await ItmoApiService.fetchDisciplineInfo(
            data.disciplineId,
            data.token,
            data.domain
          );
          break;

        case MESSAGE_TYPES.FETCH_COURSE_STRUCTURE:
          result = await ItmoApiService.fetchCourseStructure(
            data.disciplineId,
            data.token,
            data.domain
          );
          break;

        case MESSAGE_TYPES.FIND_APPROVED_PROGRAMS:
          result = await ItmoApiService.findApprovedPrograms(
            data.disciplineId,
            data.token,
            data.domain
          );
          break;

        case MESSAGE_TYPES.CREATE_CHAPTER:
          result = await ItmoApiService.createChapter(
            data.disciplineId,
            data.token,
            data.domain,
            data.chapterData
          );
          break;

        case MESSAGE_TYPES.CALL_OPENAI:
          result = await OpenAIService.generateStructure(
            data.prompt,
            data.apiKey
          );
          break;

        case MESSAGE_TYPES.GENERATE_STRUCTURE:
          result = await StructureGenerationService.handleGenerateStructure(
            data
          );
          break;

        case MESSAGE_TYPES.CREATE_CHAPTERS_FROM_STRUCTURE:
          result = await StructureGenerationService.createChaptersFromStructure(
            data
          );
          break;

        case MESSAGE_TYPES.EVALUATE_DISCIPLINE:
          result = await EvaluationService.evaluateDiscipline(
            data.courseText,
            data.referenceText
          );
          break;

        case MESSAGE_TYPES.TRACK_EVALUATION:
          result = await AnalyticsService.trackEvaluation(data);
          break;

        // Legacy message support for gradual migration
        case MESSAGE_TYPES.LEGACY_FETCH_COURSE:
        case "fetchCourse":
          const token1 = data.token || (await TokenManager.getToken());
          const domain1 = data.domain || sender.tab?.url || "";
          result = await ItmoApiService.fetchCourseStructure(
            data.disciplineId,
            token1,
            domain1
          );
          // Legacy format response
          sendResponse({ ok: true, courseText: result });
          return;

        case MESSAGE_TYPES.LEGACY_FIND_APPROVED:
        case "findApprovedPrograms":
          const token2 = data.token || (await TokenManager.getToken());
          const domain2 = data.domain || sender.tab?.url || "";
          result = await ItmoApiService.findApprovedPrograms(
            data.disciplineId,
            token2,
            domain2
          );
          // Legacy format response
          sendResponse({ ok: true, programs: result.programs });
          return;

        case MESSAGE_TYPES.LEGACY_CREATE_DUMMY:
        case "createDummyChapter":
          const token3 = data.token || (await TokenManager.getToken());
          const domain3 = data.domain || sender.tab?.url || "";
          const defaultChapter = {
            order: 1,
            name: "Новый раздел",
            themes: [{ name: "Первая тема", order: 1, resources: [] }],
            program_work_types: [],
          };
          result = await ItmoApiService.createChapter(
            data.disciplineId,
            token3,
            domain3,
            data.chapterData || defaultChapter
          );
          // Legacy format response
          sendResponse({ ok: true, data: result });
          return;

        default:
          throw new Error(`Unknown message type: ${type}`);
      }

      sendResponse(createResponse(true, result));
    } catch (error) {
      console.error(`❌ Background error for ${type}:`, error);
      sendResponse(
        createResponse(false, null, error.message || "Unknown error occurred")
      );
    }
  };

  // Execute async handler
  handleAsync();

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Export message types for use in other scripts
chrome.runtime.onStartup.addListener(() => {
  console.log("🚀 ITMO Discipline Evaluator background service started");
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("📦 ITMO Discipline Evaluator installed/updated");
});
