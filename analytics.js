const GA_MEASUREMENT_ID = "G-XE8K3XVTBL";
const GA_API_SECRET = "EbFJvWbYQ0eDZFemDXDfdw";

// JWT-декодер без подписи
function parseJwt(token) {
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
    console.warn("❌ Failed to decode JWT:", e);
    return null;
  }
}

// Извлекает isu из токена
function getISU(rawToken) {
  if (!rawToken) return null;

  const decodedToken = parseJwt(decodeURIComponent(rawToken));
  return decodedToken?.isu?.toString() || null;
}

// Отправка события через Measurement Protocol
async function trackEvaluationEvent({
  token,
  disciplineId,
  referenceId,
  metrics,
}) {
  const isu = getISU(token);
  const hashedIsu = isu ? isu : `user-${Date.now()}`;

  const payload = {
    client_id: hashedIsu,
    events: [
      {
        name: "discipline_evaluated",
        params: {
          discipline_id: disciplineId,
          reference_id: referenceId || "none",
          final_score: metrics.final_score,
          ...Object.fromEntries(
            Object.entries(metrics)
              .filter(([k, v]) => typeof v === "number")
              .map(([k, v]) => [`metric_${k}`, v])
          ),
        },
      },
    ],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload),
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      console.log("📊 GA event sent:", payload);
    } else {
      console.warn("❌ GA event failed:", await res.text());
    }
  } catch (err) {
    console.error("❌ Failed to send GA event:", err);
  }
}

export { trackEvaluationEvent };
