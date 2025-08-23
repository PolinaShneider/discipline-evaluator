// Message Types for Browser Extension Communication
// Shared constants for type-safe messaging between background, content, and popup scripts

export const MESSAGE_TYPES = {
  // ITMO API operations
  FETCH_DISCIPLINE_INFO: "fetchDisciplineInfo",
  FETCH_COURSE_STRUCTURE: "fetchCourseStructure",
  FIND_APPROVED_PROGRAMS: "findApprovedPrograms",
  CREATE_CHAPTER: "createChapter",
  GENERATE_STRUCTURE: "generateStructure",

  // Token management
  VALIDATE_TOKEN: "validateToken",
  STORE_TOKEN: "storeToken",
  GET_STORED_TOKEN: "getStoredToken",

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

// Response status constants
export const RESPONSE_STATUS = {
  SUCCESS: "success",
  ERROR: "error",
  LOADING: "loading",
};

// Error codes for standardized error handling
export const ERROR_CODES = {
  INVALID_TOKEN: "INVALID_TOKEN",
  TOKEN_EXPIRED: "TOKEN_EXPIRED",
  API_ERROR: "API_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  UNKNOWN_DOMAIN: "UNKNOWN_DOMAIN",
  MISSING_PARAMETER: "MISSING_PARAMETER",
};

// Helper function to create standardized messages
export function createMessage(type, data = {}) {
  return {
    type,
    data,
    timestamp: Date.now(),
  };
}

// Helper function to create standardized responses
export function createResponse(success, data = null, error = null) {
  return {
    success,
    data,
    error,
    timestamp: Date.now(),
  };
}
