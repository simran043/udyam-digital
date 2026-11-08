// Thin wrapper around the Udyam Digital API.
let authToken = null;
export const setAuthToken = (token) => {
  authToken = token || null;
};

async function request(method, path, body) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  health: () => request("GET", "/api/health"),
  catalogue: () => request("GET", "/api/catalogue"),
  register: (form) => request("POST", "/api/auth/register", form),
  verifyRegister: (challengeId, otp) => request("POST", "/api/auth/register/verify", { challengeId, otp }),
  login: (email, password) => request("POST", "/api/auth/login", { email, password }),
  verifyLogin: (challengeId, otp) => request("POST", "/api/auth/login/verify", { challengeId, otp }),
  resendOtp: (challengeId) => request("POST", "/api/auth/resend", { challengeId }),
  me: () => request("GET", "/api/auth/me"),
  logout: () => request("POST", "/api/auth/logout"),
  startSession: (language) => request("POST", "/api/advisor/session", { language }),
  sendMessage: (sessionId, text) => request("POST", "/api/advisor/message", { sessionId, text }),
  quote: (sessionId, items, contractMonths) => request("POST", "/api/quote", { sessionId, items, contractMonths }),
  callback: (body) => request("POST", "/api/callback", body),
  lookupGstin: (gstin) => request("GET", `/api/kyc/gstin/${encodeURIComponent(gstin)}`),
  consent: (sessionId, purposes) => request("POST", "/api/kyc/consent", { sessionId, accepted: true, purposes }),
  withdraw: (consentId) => request("DELETE", `/api/kyc/${consentId}`),
  uploadDocument: (consentId, docType, image) => request("POST", "/api/kyc/document", { consentId, docType, image }),
  samples: () => request("GET", "/api/kyc/samples"),
  sampleDocument: (consentId, file) => request("POST", "/api/kyc/sample-document", { consentId, file }),
  validate: (consentId) => request("POST", "/api/kyc/validate", { consentId }),
  esignStart: (consentId) => request("POST", "/api/kyc/esign/start", { consentId }),
  esignVerify: (consentId, otp) => request("POST", "/api/kyc/esign/verify", { consentId, otp }),
  placeOrder: (sessionId, consentId) => request("POST", "/api/orders", { sessionId, consentId }),
  order: (id) => request("GET", `/api/orders/${encodeURIComponent(id)}`),
  advanceOrder: (id) => request("POST", `/api/orders/${encodeURIComponent(id)}/advance`),
  boSummary: () => request("GET", "/api/backoffice/summary"),
  boWinback: (params) => request("GET", `/api/backoffice/winback?${new URLSearchParams(params)}`),
  boAdvisor: () => request("GET", "/api/backoffice/advisor"),
};

export const inr = (n, digits = 0) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

// Failure-tolerant storage for per-viewer conveniences only.
export const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* storage unavailable - fine */
    }
  },
};
