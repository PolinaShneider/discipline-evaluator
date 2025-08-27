// Options page script for extension settings
class OptionsManager {
  constructor() {
    this.elements = {};
    this.init();
  }

  init() {
    this.bindElements();
    this.attachEventListeners();
    this.loadSettings();
  }

  bindElements() {
    this.elements = {
      openaiToken: document.getElementById("openaiToken"),
      toggleTokenVisibility: document.getElementById("toggleTokenVisibility"),
      developerMode: document.getElementById("developerMode"),
      itmoToken: document.getElementById("itmoToken"),
      toggleItmoTokenVisibility: document.getElementById(
        "toggleItmoTokenVisibility"
      ),
      analyticsEnabled: document.getElementById("analyticsEnabled"),
      saveButton: document.getElementById("saveButton"),
      resetButton: document.getElementById("resetButton"),
      statusMessage: document.getElementById("statusMessage"),
    };
  }

  attachEventListeners() {
    // Save settings
    this.elements.saveButton.addEventListener("click", () =>
      this.saveSettings()
    );

    // Reset settings
    this.elements.resetButton.addEventListener("click", () =>
      this.resetSettings()
    );

    // Toggle token visibility
    this.elements.toggleTokenVisibility.addEventListener("click", () => {
      this.togglePasswordVisibility(this.elements.openaiToken);
    });

    this.elements.toggleItmoTokenVisibility.addEventListener("click", () => {
      this.togglePasswordVisibility(this.elements.itmoToken);
    });

    // Auto-save on input change (debounced)
    Object.values(this.elements).forEach((element) => {
      if (
        element &&
        (element.type === "checkbox" ||
          element.type === "password" ||
          element.type === "text")
      ) {
        element.addEventListener("change", () => {
          clearTimeout(this.autoSaveTimeout);
          this.autoSaveTimeout = setTimeout(
            () => this.saveSettings(true),
            1000
          );
        });
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        this.saveSettings();
      }
    });
  }

  togglePasswordVisibility(input) {
    const isPassword = input.type === "password";
    input.type = isPassword ? "text" : "password";

    const button = input.nextElementSibling;
    button.textContent = isPassword ? "🙈" : "👁️";
    button.title = isPassword ? "Скрыть" : "Показать";
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.sync.get([
        "openaiApiKey",
        "developerMode",
        "itmoToken",
        "analyticsEnabled",
      ]);

      // Load values
      this.elements.openaiToken.value = settings.openaiApiKey || "";
      this.elements.developerMode.checked = settings.developerMode || false;
      this.elements.itmoToken.value = settings.itmoToken || "";
      this.elements.analyticsEnabled.checked =
        settings.analyticsEnabled !== false; // default true

      this.showStatus("Настройки загружены", "success");
    } catch (error) {
      console.error("❌ Error loading settings:", error);
      this.showStatus("Ошибка загрузки настроек", "error");
    }
  }

  async saveSettings(isAutoSave = false) {
    try {
      this.elements.saveButton.disabled = true;

      const settings = {
        openaiApiKey: this.elements.openaiToken.value.trim(),
        developerMode: this.elements.developerMode.checked,
        itmoToken: this.elements.itmoToken.value.trim(),
        analyticsEnabled: this.elements.analyticsEnabled.checked,
        lastUpdated: Date.now(),
      };

      // Validate OpenAI key format
      if (
        settings.openaiApiKey &&
        !this.validateOpenAIKey(settings.openaiApiKey)
      ) {
        this.showStatus("Неверный формат OpenAI ключа", "error");
        return;
      }

      // Save to chrome.storage.sync (synced across devices)
      await chrome.storage.sync.set(settings);

      // Also save to local storage for faster access
      await chrome.storage.local.set({
        cachedSettings: settings,
      });

      // Notify background script about settings change
      await chrome.runtime.sendMessage({
        type: "SETTINGS_UPDATED",
        data: settings,
      });

      const message = isAutoSave ? "Автосохранение" : "Настройки сохранены";
      this.showStatus(message, "success");

      // Log for developer mode
      if (settings.developerMode) {
        console.log("🔧 Settings saved:", settings);
      }
    } catch (error) {
      console.error("❌ Error saving settings:", error);
      this.showStatus("Ошибка сохранения настроек", "error");
    } finally {
      this.elements.saveButton.disabled = false;
    }
  }

  async resetSettings() {
    if (!confirm("Сбросить все настройки к значениям по умолчанию?")) {
      return;
    }

    try {
      // Clear storage
      await chrome.storage.sync.clear();
      await chrome.storage.local.remove(["cachedSettings"]);

      // Reset form
      this.elements.openaiToken.value = "";
      this.elements.developerMode.checked = false;
      this.elements.itmoToken.value = "";
      this.elements.analyticsEnabled.checked = true;

      // Notify background script
      await chrome.runtime.sendMessage({
        type: "SETTINGS_RESET",
      });

      this.showStatus("Настройки сброшены к умолчаниям", "success");
    } catch (error) {
      console.error("❌ Error resetting settings:", error);
      this.showStatus("Ошибка сброса настроек", "error");
    }
  }
  validateOpenAIKey(key) {
    // Допустимы два формата: старый "sk-" и новый "sk-proj-"
    const oldFormat = /^sk-[a-zA-Z0-9]{48,}$/;
    const newFormat = /^sk-proj-[a-zA-Z0-9\-_]{80,}$/; // допускаем длинные ключи с дефисами и _
    return oldFormat.test(key) || newFormat.test(key);
  }

  showStatus(message, type = "success") {
    const status = this.elements.statusMessage;
    status.textContent = message;
    status.className = `status ${type} show`;

    // Auto-hide after 3 seconds
    setTimeout(() => {
      status.classList.remove("show");
    }, 3000);
  }

  // Static method to get settings from any script
  static async getSettings() {
    try {
      // Try local cache first (faster)
      const local = await chrome.storage.local.get(["cachedSettings"]);
      if (local.cachedSettings) {
        return local.cachedSettings;
      }

      // Fallback to sync storage
      const settings = await chrome.storage.sync.get([
        "openaiApiKey",
        "developerMode",
        "itmoToken",
        "analyticsEnabled",
      ]);

      return {
        openaiApiKey: settings.openaiApiKey || "",
        developerMode: settings.developerMode || false,
        itmoToken: settings.itmoToken || "",
        analyticsEnabled: settings.analyticsEnabled !== false,
      };
    } catch (error) {
      console.error("❌ Error getting settings:", error);
      return {
        openaiApiKey: "",
        developerMode: false,
        itmoToken: "",
        analyticsEnabled: true,
      };
    }
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new OptionsManager();
});

// Export for use in other scripts
window.OptionsManager = OptionsManager;
