// Background API Helper
// Provides convenient methods for communicating with the background service worker

import {
  MESSAGE_TYPES,
  createMessage,
  createResponse,
} from "../types/messageTypes.js";

// Helper class for making calls to background script
export class BackgroundApi {
  // Generic method to send messages to background script
  static async sendMessage(type, data = {}) {
    return new Promise((resolve, reject) => {
      const message = createMessage(type, data);

      chrome.runtime.sendMessage(message, (response) => {
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

  // Token management methods
  static async validateToken(token) {
    return this.sendMessage(MESSAGE_TYPES.VALIDATE_TOKEN, { token });
  }

  static async storeToken(token) {
    return this.sendMessage(MESSAGE_TYPES.STORE_TOKEN, { token });
  }

  static async getStoredToken() {
    return this.sendMessage(MESSAGE_TYPES.GET_STORED_TOKEN);
  }

  // ITMO API methods
  static async fetchDisciplineInfo(disciplineId, token, domain) {
    return this.sendMessage(MESSAGE_TYPES.FETCH_DISCIPLINE_INFO, {
      disciplineId,
      token,
      domain,
    });
  }

  static async fetchCourseStructure(disciplineId, token, domain) {
    return this.sendMessage(MESSAGE_TYPES.FETCH_COURSE_STRUCTURE, {
      disciplineId,
      token,
      domain,
    });
  }

  static async findApprovedPrograms(disciplineId, token, domain) {
    return this.sendMessage(MESSAGE_TYPES.FIND_APPROVED_PROGRAMS, {
      disciplineId,
      token,
      domain,
    });
  }

  static async createChapter(disciplineId, token, domain, chapterData) {
    return this.sendMessage(MESSAGE_TYPES.CREATE_CHAPTER, {
      disciplineId,
      token,
      domain,
      chapterData,
    });
  }

  // OpenAI API methods
  static async callOpenAI(prompt, apiKey) {
    return this.sendMessage(MESSAGE_TYPES.CALL_OPENAI, {
      prompt,
      apiKey,
    });
  }

  // Structure generation methods
  static async generateStructure(disciplineId, token, domain, openaiKey) {
    return this.sendMessage(MESSAGE_TYPES.GENERATE_STRUCTURE, {
      disciplineId,
      token,
      domain,
      openaiKey,
    });
  }

  static async createChaptersFromStructure(
    disciplineId,
    token,
    domain,
    chapters,
    workTypes
  ) {
    return this.sendMessage(MESSAGE_TYPES.CREATE_CHAPTERS_FROM_STRUCTURE, {
      disciplineId,
      token,
      domain,
      chapters,
      workTypes,
    });
  }

  // Evaluation API methods
  static async evaluateDiscipline(courseText, referenceText = null) {
    return this.sendMessage(MESSAGE_TYPES.EVALUATE_DISCIPLINE, {
      courseText,
      referenceText,
    });
  }

  // Analytics methods
  static async trackEvaluation(data) {
    return this.sendMessage(MESSAGE_TYPES.TRACK_EVALUATION, data);
  }

  // Utility methods
  static getCurrentTabDomain() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          resolve(tabs[0].url);
        } else {
          resolve("");
        }
      });
    });
  }

  static extractDisciplineIdFromUrl(url) {
    const match = url.match(/\/programs\/(\d+)/);
    return match ? match[1] : null;
  }

  static isItmoProgramsPage(url) {
    return /my\.itmo\.(ru|su)/.test(url) && /programs\/\d+/.test(url);
  }

  static isItmoChaptersPage(url) {
    return this.isItmoProgramsPage(url) && url.includes("p=chapters");
  }
}

// Convenience methods for common operations
export const TokenManager = {
  async validate(token) {
    return BackgroundApi.validateToken(token);
  },

  async store(token) {
    return BackgroundApi.storeToken(token);
  },

  async get() {
    return BackgroundApi.getStoredToken();
  },
};

export const ItmoApi = {
  async getDisciplineInfo(disciplineId, token, domain) {
    return BackgroundApi.fetchDisciplineInfo(disciplineId, token, domain);
  },

  async getCourseStructure(disciplineId, token, domain) {
    return BackgroundApi.fetchCourseStructure(disciplineId, token, domain);
  },

  async findSimilarPrograms(disciplineId, token, domain) {
    return BackgroundApi.findApprovedPrograms(disciplineId, token, domain);
  },

  async createChapter(disciplineId, token, domain, chapterData) {
    return BackgroundApi.createChapter(
      disciplineId,
      token,
      domain,
      chapterData
    );
  },
};

export const EvaluationApi = {
  async evaluate(courseText, referenceText = null) {
    return BackgroundApi.evaluateDiscipline(courseText, referenceText);
  },

  async trackUsage(data) {
    return BackgroundApi.trackEvaluation(data);
  },
};

export const OpenAI = {
  async generateStructure(prompt, apiKey) {
    return BackgroundApi.callOpenAI(prompt, apiKey);
  },
};
