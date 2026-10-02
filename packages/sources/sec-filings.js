"use strict";

const TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_BASE = "https://data.sec.gov/submissions/CIK";
const SEC_ARCHIVES_BASE = "https://www.sec.gov/Archives/edgar/data";
const SOURCE_TIMEOUT_MS = 10000;
const DEFAULT_USER_AGENT = "";
const SEC_USER_AGENT_ENV = "SEC_USER_AGENT";

function hasContactEmail(userAgent) {
  return (
    typeof userAgent === "string" &&
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(userAgent)
  );
}

function normalizeCik(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits || digits.length > 10) return null;
  return digits.padStart(10, "0");
}

function normalizeTicker(value) {
  const ticker = String(value || "").trim().toUpperCase();
  if (!ticker || ticker.length > 12 || !/^[A-Z0-9.\-]+$/.test(ticker)) return null;
  return ticker.replaceAll(".", "-");
}

async function fetchResponse(fetchImpl, url, init = {}, timeoutMs = SOURCE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function createSecFilingsAdapter({
  fetchImpl = fetch,
  timeoutMs = SOURCE_TIMEOUT_MS,
  userAgent =
    (typeof process !== "undefined" && process?.env?.[SEC_USER_AGENT_ENV]) ||
    DEFAULT_USER_AGENT,
} = {}) {
  async function secJson(url) {
    if (!hasContactEmail(userAgent)) {
      const error = new Error("sec_declared_user_agent_required");
      error.code = "SEC_USER_AGENT_REQUIRED";
      throw error;
    }
    const response = await fetchResponse(
      fetchImpl,
      url,
      {
        headers: {
          "user-agent": userAgent,
          accept: "application/json",
        },
      },
      timeoutMs
    );
    if (!response) {
      const error = new Error("sec_no_response");
      error.code = "SOURCE_HTTP_ERROR";
      throw error;
    }
    if (response.status === 404) return { __notFound: true };
    if (response.ok !== true) {
      const error = new Error("sec_http_" + response.status);
      error.code = "SOURCE_HTTP_ERROR";
      throw error;
    }
    return await response.json();
  }

  async function resolveTicker(ticker) {
    const wanted = normalizeTicker(ticker);
    if (!wanted) {
      const error = new Error("invalid_ticker");
      error.code = "INVALID_INPUT";
      throw error;
    }
    const map = await secJson(TICKERS_URL);
    if (!map || map.__notFound || typeof map !== "object") {
      const error = new Error("sec_ticker_map_invalid");
      error.code = "SOURCE_CONTRACT_INVALID";
      throw error;
    }
    for (const row of Object.values(map)) {
      if (
        row &&
        typeof row === "object" &&
        String(row.ticker ?? "").toUpperCase() === wanted
      ) {
        return normalizeCik(String(row.cik_str ?? ""));
      }
    }
    return null;
  }

  return {
    async lookup({ ticker = "", cik = "", form = "", limit = 25 }) {
      let normalizedCik = cik ? normalizeCik(cik) : null;
      const normalizedTicker = ticker ? normalizeTicker(ticker) : null;

      if (ticker && !normalizedTicker) {
        const error = new Error("invalid_ticker");
        error.code = "INVALID_INPUT";
        throw error;
      }
      if (cik && !normalizedCik) {
        const error = new Error("invalid_cik");
        error.code = "INVALID_INPUT";
        throw error;
      }
      if (!normalizedCik && normalizedTicker) {
        normalizedCik = await resolveTicker(normalizedTicker);
      }
      if (!normalizedCik) {
        return {
          available: true,
          found: false,
          company: null,
          filings: [],
          provenance: {
            source: "U.S. Securities and Exchange Commission EDGAR",
            tickerMap: TICKERS_URL,
          },
        };
      }

      const submissionUrl = SUBMISSIONS_BASE + normalizedCik + ".json";
      const data = await secJson(submissionUrl);
      if (data?.__notFound) {
        return {
          available: true,
          found: false,
          company: null,
          filings: [],
          provenance: {
            source: "U.S. Securities and Exchange Commission EDGAR",
            submissionUrl,
          },
        };
      }

      if (!data || typeof data !== "object") {
        const error = new Error("sec_submission_invalid");
        error.code = "SOURCE_CONTRACT_INVALID";
        throw error;
      }

      const recent = data?.filings?.recent;
      const requiredArrays = [
        "form",
        "filingDate",
        "accessionNumber",
        "primaryDocument",
      ];
      if (
        !recent ||
        typeof recent !== "object" ||
        requiredArrays.some((key) => !Array.isArray(recent[key]))
      ) {
        const error = new Error("sec_recent_filings_invalid");
        error.code = "SOURCE_CONTRACT_INVALID";
        throw error;
      }
      const rowCount = recent.form.length;
      if (
        requiredArrays.some((key) => recent[key].length < rowCount)
      ) {
        const error = new Error("sec_recent_filings_misaligned");
        error.code = "SOURCE_CONTRACT_INVALID";
        throw error;
      }

      const formFilter = String(form || "").trim().toUpperCase();
      if (formFilter.length > 20) {
        const error = new Error("invalid_form");
        error.code = "INVALID_INPUT";
        throw error;
      }
      const boundedLimit = Math.max(1, Math.min(Number(limit) || 25, 25));
      const cikNoZero = String(Number.parseInt(normalizedCik, 10));
      const filings = [];

      for (let i = 0; i < recent.form.length && filings.length < boundedLimit; i += 1) {
        const filingForm = String(recent.form[i] ?? "");
        if (formFilter && filingForm.toUpperCase() !== formFilter) continue;
        const accessionNumber = String(recent.accessionNumber?.[i] ?? "");
        const primaryDocument = String(recent.primaryDocument?.[i] ?? "");
        const accessionCompact = accessionNumber.replace(/-/g, "");
        filings.push({
          form: filingForm,
          filingDate: recent.filingDate?.[i] ?? null,
          reportDate: recent.reportDate?.[i] ?? null,
          acceptanceDateTime: recent.acceptanceDateTime?.[i] ?? null,
          accessionNumber,
          primaryDocument,
          primaryDocDescription: recent.primaryDocDescription?.[i] ?? null,
          filingUrl:
            accessionCompact && primaryDocument
              ? SEC_ARCHIVES_BASE +
                "/" +
                cikNoZero +
                "/" +
                accessionCompact +
                "/" +
                primaryDocument
              : null,
        });
      }

      return {
        available: true,
        found: true,
        company: {
          name: data.name ?? null,
          cik: normalizedCik,
          tickers: Array.isArray(data.tickers) ? data.tickers : [],
          exchanges: Array.isArray(data.exchanges) ? data.exchanges : [],
          sic: data.sic ?? null,
          sicDescription: data.sicDescription ?? null,
        },
        filings,
        provenance: {
          source: "U.S. Securities and Exchange Commission EDGAR",
          tickerMap: TICKERS_URL,
          submissionUrl,
        },
      };
    },
  };
}

module.exports = {
  TICKERS_URL,
  SUBMISSIONS_BASE,
  SEC_ARCHIVES_BASE,
  DEFAULT_USER_AGENT,
  SEC_USER_AGENT_ENV,
  hasContactEmail,
  normalizeCik,
  normalizeTicker,
  createSecFilingsAdapter,
};
