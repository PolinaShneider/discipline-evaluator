// Settings Management Utilities
export class SettingsManager {
  // Default settings
  static DEFAULT_SETTINGS = {
    openaiApiKey: "",
    developerMode: false,
    itmoToken: "",
    analyticsEnabled: true,
  };

  // Get all settings
  static async getSettings() {
    try {
      // Try cached settings first (faster)
      const local = await chrome.storage.local.get(["cachedSettings"]);

      if (local.cachedSettings && this.isSettingsValid(local.cachedSettings)) {
        return { ...this.DEFAULT_SETTINGS, ...local.cachedSettings };
      }

      // Fallback to sync storage
      const syncSettings = await chrome.storage.sync.get(
        Object.keys(this.DEFAULT_SETTINGS)
      );

      const settings = { ...this.DEFAULT_SETTINGS, ...syncSettings };

      // Cache for faster access
      await this.cacheSettings(settings);

      return settings;
    } catch (error) {
      console.error("Error getting settings:", error);
      return this.DEFAULT_SETTINGS;
    }
  }

  // Get specific setting
  static async getSetting(key) {
    const settings = await this.getSettings();
    return settings[key];
  }

  // Set specific setting
  static async setSetting(key, value) {
    try {
      const currentSettings = await this.getSettings();
      const newSettings = {
        ...currentSettings,
        [key]: value,
        lastUpdated: Date.now(),
      };

      await chrome.storage.sync.set({ [key]: value });
      await this.cacheSettings(newSettings);

      return true;
    } catch (error) {
      console.error(`❌ Error setting ${key}:`, error);
      return false;
    }
  }

  // Check if developer mode is enabled
  static async isDeveloperMode() {
    return await this.getSetting("developerMode");
  }

  // Get OpenAI API key
  static async getOpenAIKey() {
    return await this.getSetting("openaiApiKey");
  }

  // Get ITMO token (fallback)
  static async getItmoToken() {
    return await this.getSetting("itmoToken");
  }

  // Check if analytics is enabled
  static async isAnalyticsEnabled() {
    return await this.getSetting("analyticsEnabled");
  }

  // Cache settings locally for faster access
  static async cacheSettings(settings) {
    try {
      await chrome.storage.local.set({
        cachedSettings: settings,
        cacheTimestamp: Date.now(),
      });
    } catch (error) {
      console.error("❌ Error caching settings:", error);
    }
  }

  // Validate settings object
  static isSettingsValid(settings) {
    if (!settings || typeof settings !== "object") return false;

    // Check if cache is not too old (1 hour)
    const cacheAge = Date.now() - (settings.lastUpdated || 0);
    return cacheAge < 3600000; // 1 hour in milliseconds
  }

  // Clear all settings
  static async clearSettings() {
    try {
      await chrome.storage.sync.clear();
      await chrome.storage.local.remove(["cachedSettings", "cacheTimestamp"]);
      return true;
    } catch (error) {
      console.error("❌ Error clearing settings:", error);
      return false;
    }
  }

  // Listen for settings changes
  static onSettingsChanged(callback) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync") {
        // Invalidate cache and notify
        chrome.storage.local.remove(["cachedSettings"]);
        callback(changes);
      }
    });
  }

  // Debug log (only in developer mode)
  static async debugLog(message, data = null) {
    const isDev = await this.isDeveloperMode();
    if (isDev) {
      console.log(`🔧 [Settings] ${message}`, data || "");
    }
  }
}

// Convenience functions for common operations
export const Settings = {
  // Quick access methods
  get: (key) => SettingsManager.getSetting(key),
  set: (key, value) => SettingsManager.setSetting(key, value),
  getAll: () => SettingsManager.getSettings(),
  isDev: () => SettingsManager.isDeveloperMode(),
  getOpenAI: () => SettingsManager.getOpenAIKey(),
  getItmoToken: () => SettingsManager.getItmoToken(),
  isAnalyticsEnabled: () => SettingsManager.isAnalyticsEnabled(),
  clear: () => SettingsManager.clearSettings(),
  debugLog: (msg, data) => SettingsManager.debugLog(msg, data),
};
