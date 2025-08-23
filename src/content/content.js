// Content Script for ITMO Discipline Evaluator
// Handles only DOM-specific operations on ITMO pages
// All API calls are delegated to background service worker

// Message types constants (inline since ES modules not supported in content scripts)
const MESSAGE_TYPES = {
  // ITMO API
  FETCH_DISCIPLINE_INFO: "fetchDisciplineInfo",
  FETCH_COURSE_STRUCTURE: "fetchCourseStructure",
  FIND_APPROVED_PROGRAMS: "findApprovedPrograms",
  CREATE_CHAPTER: "createChapter",

  // Token management
  STORE_TOKEN: "storeToken",
  GET_STORED_TOKEN: "getStoredToken",
  VALIDATE_TOKEN: "validateToken",

  // Analytics
  TRACK_EVALUATION: "trackEvaluation",

  // External API
  EVALUATE_DISCIPLINE: "evaluateDiscipline",
  CALL_OPENAI: "callOpenAI",

  // Structure generation
  CREATE_CHAPTERS_FROM_STRUCTURE: "createChaptersFromStructure",

  // ITMO API Proxy (through content script)
  ITMO_API_PROXY: "itmoApiProxy",

  // Legacy support (for gradual migration)
  LEGACY_FETCH_COURSE: "fetchCourse",
  LEGACY_FIND_APPROVED: "findApprovedPrograms",
  LEGACY_CREATE_DUMMY: "createDummyChapter",
};

// Utility: Extract token from page cookies
function getTokenFromCookies() {
  const token = document.cookie
    .split("; ")
    .find((c) => c.startsWith("auth._token.itmoId="))
    ?.split("=")[1];

  return token ? decodeURIComponent(token) : null;
}

// Utility: Get current domain for API calls
function getCurrentDomain() {
  return location.href;
}

// Utility: Extract discipline ID from current URL
function getCurrentDisciplineId() {
  const match = location.pathname.match(/programs\/(\d+)/);
  return match ? match[1] : null;
}

// DOM-specific: Check if we're on the chapters page
function isOnChaptersPage() {
  return location.href.includes("p=chapters");
}

// Send message to background script with proper error handling
function sendBackgroundMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response) {
        reject(new Error("No response from background script"));
        return;
      }

      if (response.success) {
        resolve(response.data);
      } else {
        reject(new Error(response.error || "Unknown error"));
      }
    });
  });
}

// Modern message handler for new architecture
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Only handle messages with the new message format
  if (!msg.type || typeof msg.type !== "string") {
    console.warn("⚠️ Content script received invalid message format:", msg);
    return false;
  }

  console.log(
    "🔄 Content script received modern message:",
    msg.type,
    "Full message:",
    msg
  );

  switch (msg.type) {
    case "GET_PAGE_INFO":
      // Return information about the current page
      sendResponse({
        success: true,
        data: {
          url: location.href,
          domain: location.hostname,
          disciplineId: getCurrentDisciplineId(),
          isChaptersPage: isOnChaptersPage(),
          token: getTokenFromCookies(),
        },
      });
      return true;

    case "CHECK_TOKEN_AVAILABILITY":
      // Check if auth token is available in cookies
      const token = getTokenFromCookies();
      sendResponse({
        success: true,
        data: {
          hasToken: !!token,
          token: token,
        },
      });
      return true;

    case "INJECT_NOTIFICATION":
      // DOM operation: Show notification on page
      try {
        showPageNotification(msg.data.message, msg.data.type || "info");
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return true;

    case "ITMO_API_PROXY":
      // Proxy ITMO API calls through content script to access session cookies
      handleItmoApiProxy(msg.data)
        .then((result) => {
          sendResponse({ success: true, data: result });
        })
        .catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      return true;

    default:
      console.warn("⚠️ Unknown modern message type:", msg.type);
      sendResponse({
        success: false,
        error: `Unknown message type: ${msg.type}`,
      });
      return true;
  }
});

// DOM Utility: Show notification on page
function showPageNotification(message, type = "info") {
  // Remove existing notifications
  const existing = document.querySelectorAll(".itmo-evaluator-notification");
  existing.forEach((el) => el.remove());

  // Create notification element
  const notification = document.createElement("div");
  notification.className = `itmo-evaluator-notification notification-${type}`;
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${
        type === "error"
          ? "#f8d7da"
          : type === "success"
          ? "#d4edda"
          : "#cce7ff"
      };
      color: ${
        type === "error"
          ? "#721c24"
          : type === "success"
          ? "#155724"
          : "#004085"
      };
      border: 1px solid ${
        type === "error"
          ? "#f5c6cb"
          : type === "success"
          ? "#c3e6cb"
          : "#abd8ff"
      };
      border-radius: 6px;
      padding: 12px 16px;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.4;
    ">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 16px;">
          ${type === "error" ? "❌" : type === "success" ? "✅" : "ℹ️"}
        </span>
        <span>${message}</span>
        <button onclick="this.parentElement.parentElement.parentElement.remove()" 
                style="
                  background: none; 
                  border: none; 
                  font-size: 18px; 
                  cursor: pointer; 
                  margin-left: auto;
                  padding: 0;
                  color: inherit;
                ">×</button>
      </div>
    </div>
  `;

  // Add to page
  document.body.appendChild(notification);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    notification.remove();
  }, 5000);
}

// Helper function for backward compatibility
// TODO: Remove this once popup migration is complete
function getSimilarDisciplineStructure(disciplineId) {
  const token = getTokenFromCookies();
  const domain = getCurrentDomain();

  if (!token) {
    return Promise.resolve("");
  }

  return sendBackgroundMessage(MESSAGE_TYPES.FIND_APPROVED_PROGRAMS, {
    disciplineId,
    token,
    domain,
  })
    .then((result) => {
      if (!result.programs?.length) {
        return "";
      }

      const similarId = result.programs[0].id;
      return sendBackgroundMessage(MESSAGE_TYPES.FETCH_COURSE_STRUCTURE, {
        disciplineId: similarId,
        token,
        domain,
      });
    })
    .catch(() => "");
}

// Initialize content script
console.log("🚀 ITMO Discipline Evaluator content script loaded");

// ITMO API Proxy Handler - makes API calls with access to session cookies
async function handleItmoApiProxy(data) {
  const { method, endpoint, body, disciplineId } = data;

  console.log("🔄 Content script handling ITMO API proxy:", method, endpoint);

  const token = getTokenFromCookies();
  if (!token) {
    throw new Error("❌ No authentication token found in cookies");
  }

  const domain = getCurrentDomain();
  const baseUrl = domain.includes("dev.my.itmo.su")
    ? "https://dev.my.itmo.su"
    : "https://my.itmo.ru";

  const headers = {
    Authorization: token,
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  let url = `${baseUrl}${endpoint}`;

  // Replace placeholder in URL
  if (disciplineId) {
    url = url.replace("{disciplineId}", disciplineId);
  }

  console.log("🌐 Content script making request to:", url);

  const requestOptions = {
    method: method || "GET",
    headers,
    credentials: "include",
  };

  if (body && (method === "POST" || method === "PUT")) {
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(url, requestOptions);

  console.log(
    "📡 Content script response status:",
    response.status,
    response.statusText
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ITMO API Error ${response.status}: ${text}`);
  }

  return await response.json();
}

// Export for potential use by other scripts (though this shouldn't be needed)
window.itmoEvaluator = {
  getTokenFromCookies,
  getCurrentDomain,
  getCurrentDisciplineId,
  isOnChaptersPage,
  showPageNotification,
  getSimilarDisciplineStructure,
  handleItmoApiProxy,
};
