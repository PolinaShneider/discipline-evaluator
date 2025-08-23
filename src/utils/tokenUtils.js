// JWT Token utilities

// Parse JWT token safely
export function parseJwt(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const jsonPayload = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("❌ JWT parsing error:", e);
    return null;
  }
}

// Validate JWT token structure and extract ISU
export function validateToken(token) {
  try {
    const decoded = parseJwt(decodeURIComponent(token));
    if (!decoded) return { valid: false, error: "Invalid token format" };

    return {
      valid: true,
      isu: decoded.isu?.toString(),
      exp: decoded.exp,
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

// Get ISU from token (convenience function)
export function getISUFromToken(token) {
  if (!token) return null;
  const decoded = parseJwt(decodeURIComponent(token));
  return decoded?.isu?.toString() || null;
}
