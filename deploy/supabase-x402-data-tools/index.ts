
const FUNCTION_NAME = "x402-data-tools";
const BUILD_ID = "supabase-x402-v5";
const NETWORK = "eip155:8453";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x708f7b52b56eafd7fc7752ed732914021";
const FACILITATOR = "https://facilitator.payai.network";
const PRICE = "$0.005";
const AMOUNT = "5000";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "PAYMENT-SIGNATURE, X-PAYMENT, Content-Type, Accept",
  "access-control-expose-headers":
    "PAYMENT-REQUIRED, PAYMENT-RESPONSE, x402-settled, x402-price, x402-network, x402-asset, x402-pay-to, Retry-After",
};

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function plain(body: string, status = 200, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: {
      ...CORS,
      "content-type": contentType,
      "cache-control": "public, max-age=300",
    },
  });
}

function utf8ToB64(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToUtf8(value: string) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function decodePayment(value: string) {
  if (!value || value.length > 16384) throw new Error("invalid_payment_header");
  const parsed = JSON.parse(b64ToUtf8(value));
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.x402Version !== 2
  ) {
    throw new Error("invalid_payment_payload");
  }
  return parsed;
}

function requirements() {
  return {
    scheme: "exact",
    network: NETWORK,
    amount: AMOUNT,
    asset: USDC,
    payTo: PAY_TO,
    maxTimeoutSeconds: 60,
    extra: { name: "USD Coin", version: "2" },
  };
}

function requestContext(url: URL) {
  const marker = "/" + FUNCTION_NAME;
  const index = url.pathname.lastIndexOf(marker);
  const remainder =
    index >= 0 ? url.pathname.slice(index + marker.length) : "/";
  return {
    base: "https://" + url.host + "/functions/v1/" + FUNCTION_NAME,
    subpath: remainder || "/",
  };
}

async function fetchTimed(
  url: string,
  init: RequestInit = {},
  timeoutMs = 12000,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function facilitator(path: "verify" | "settle", paymentPayload: unknown) {
  const response = await fetchTimed(
    FACILITATOR + "/" + path,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        x402Version: 2,
        paymentPayload,
        paymentRequirements: requirements(),
      }),
    },
    6000,
  );
  let body: any = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function settleSamePayment(paymentPayload: unknown) {
  for (const wait of [0, 250, 750]) {
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    try {
      const result = await facilitator("settle", paymentPayload);
      if (result.body?.success === true) return { ok: true, receipt: result.body };
      const reason = String(
        result.body?.errorReason ||
          (result.status === 429
            ? "rate_limited"
            : result.status >= 500
              ? "facilitator_unavailable"
              : "payment_settlement_failed"),
      );
      if (
        ![
          "settlement_pending",
          "duplicate_settlement",
          "rate_limited",
          "facilitator_unavailable",
        ].includes(reason)
      ) {
        return { ok: false, terminal: true, reason };
      }
    } catch {
    }
  }
  return { ok: false, terminal: false, reason: "settlement_unknown" };
}

type RouteDef = {
  path: string;
  serviceName: string;
  description: string;
  tags: string[];
  example: Record<string, unknown>;
  outputExample: Record<string, unknown>;
  parameters: Array<Record<string, unknown>>;
  execute: (params: URLSearchParams, base: string) => Promise<any>;
};

function paymentDocument(route: RouteDef, base: string) {
  return {
    x402Version: 2,
    resource: {
      url: base + route.path,
      description: route.description,
      mimeType: "application/json",
      serviceName: route.serviceName,
      tags: route.tags,
    },
    accepts: [requirements()],
    extensions: {
      bazaar: {
        info: {
          input: {
            type: "http",
            method: "GET",
            queryParams: route.example,
          },
          output: {
            type: "json",
            example: route.outputExample,
          },
        },
      },
    },
  };
}

function paymentRequired(route: RouteDef, base: string, reason = "payment_required") {
  const document = paymentDocument(route, base);
  return json(
    {
      error: reason,
      ...document,
      price: PRICE,
      currency: "USDC",
      network: NETWORK,
      payTo: PAY_TO,
    },
    402,
    {
      "PAYMENT-REQUIRED": utf8ToB64(JSON.stringify(document)),
      "x402-price": PRICE,
      "x402-asset": "USDC",
      "x402-network": NETWORK,
      "x402-pay-to": PAY_TO,
    },
  );
}

function normalizeCik(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits && digits.length <= 10 ? digits.padStart(10, "0") : null;
}

async function secJson(url: string) {
  const response = await fetchTimed(
    url,
    {
      headers: {
        "user-agent": "x402-data-tools/1.0 jayp19386@gmail.com",
        accept: "application/json",
      },
    },
    10000,
  );
  if (!response.ok) throw new Error("SEC returned " + response.status);
  return await response.json();
}

async function secLookup(params: URLSearchParams) {
  const ticker = (params.get("ticker") || "").trim();
  const cikInput = (params.get("cik") || "").trim();
  const form = (params.get("form") || "").trim();
  const rawLimit = Number.parseInt(params.get("limit") || "10", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 25)) : 10;

  if (!ticker && !cikInput) {
    throw Object.assign(new Error("Provide ticker or cik."), { status: 400 });
  }
  if (ticker.length > 12) {
    throw Object.assign(new Error("ticker is too long."), { status: 400 });
  }
  if (form.length > 20) {
    throw Object.assign(new Error("form is too long."), { status: 400 });
  }

  let cik = cikInput ? normalizeCik(cikInput) : null;
  if (cikInput && !cik) {
    throw Object.assign(new Error("cik must contain 1 to 10 digits."), { status: 400 });
  }

  if (!cik && ticker) {
    const map = await secJson("https://www.sec.gov/files/company_tickers.json");
    const wanted = ticker.toUpperCase();
    for (const row of Object.values(map) as any[]) {
      if (String(row?.ticker || "").toUpperCase() === wanted) {
        cik = normalizeCik(String(row?.cik_str || ""));
        break;
      }
    }
  }

  if (!cik) {
    throw Object.assign(new Error("Company not found; payment was not settled."), {
      status: 404,
    });
  }

  const data: any = await secJson(
    "https://data.sec.gov/submissions/CIK" + cik + ".json",
  );
  const recent: any = data?.filings?.recent || {};
  const forms: any[] = Array.isArray(recent.form) ? recent.form : [];
  const formFilter = form.toUpperCase();
  const cikNoZero = String(Number.parseInt(cik, 10));
  const filings: any[] = [];

  for (let i = 0; i < forms.length && filings.length < limit; i += 1) {
    const filingForm = String(forms[i] || "");
    if (formFilter && filingForm.toUpperCase() !== formFilter) continue;
    const accessionNumber = String(recent.accessionNumber?.[i] || "");
    const primaryDocument = String(recent.primaryDocument?.[i] || "");
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
          ? "https://www.sec.gov/Archives/edgar/data/" +
            cikNoZero +
            "/" +
            accessionCompact +
            "/" +
            primaryDocument
          : null,
    });
  }

  return {
    company: {
      name: data.name ?? null,
      cik,
      tickers: data.tickers ?? [],
      exchanges: data.exchanges ?? [],
      sic: data.sic ?? null,
      sicDescription: data.sicDescription ?? null,
    },
    count: filings.length,
    filings,
    source: "U.S. Securities and Exchange Commission EDGAR",
  };
}

function parseCsv(input: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field.replace(/\r$/, ""));
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    if (row.some((value) => value.length)) rows.push(row);
  }
  return rows;
}

function clean(value: any) {
  if (!value || value === "-0-") return null;
  return String(value).trim() || null;
}

function normalizeName(value: any) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortedTokens(value: any) {
  return normalizeName(value).split(" ").filter(Boolean).sort().join(" ");
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next[j] = Math.min(next[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = next;
  }
  return previous[b.length];
}

function jaccardTokens(a: string, b: string) {
  const aa = new Set(normalizeName(a).split(" ").filter(Boolean));
  const bb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let shared = 0;
  for (const token of aa) if (bb.has(token)) shared += 1;
  return shared / new Set([...aa, ...bb]).size;
}

function scoreName(query: string, candidate: string) {
  const q = normalizeName(query);
  const c = normalizeName(candidate);
  if (!q || !c) return 0;
  if (q === c) return 100;
  if (sortedTokens(q) === sortedTokens(c)) return 99;
  const contains =
    q.length >= 5 && c.length >= 5 && (q.includes(c) || c.includes(q)) ? 94 : 0;
  const maxLen = Math.max(q.length, c.length);
  const edit = maxLen ? (1 - levenshtein(q, c) / maxLen) * 100 : 0;
  const qs = sortedTokens(q);
  const cs = sortedTokens(c);
  const editSorted =
    (1 - levenshtein(qs, cs) / Math.max(qs.length, cs.length, 1)) * 100;
  return Math.max(contains, edit, editSorted, jaccardTokens(q, c) * 100);
}

let ofacCache: any[] | null = null;

async function loadOfac() {
  if (ofacCache) return ofacCache;
  const base =
    "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports";
  const getCsv = async (name: string) => {
    const response = await fetchTimed(
      base + "/" + name,
      {
        headers: {
          "user-agent": "x402-ofac-screen/1.0",
          accept: "text/csv,*/*",
        },
      },
      15000,
    );
    if (!response.ok) throw new Error("OFAC returned " + response.status);
    return await response.text();
  };

  const [sdn, alt] = await Promise.all([getCsv("SDN.CSV"), getCsv("ALT.CSV")]);
  const entries = new Map<string, any>();

  for (const cols of parseCsv(sdn)) {
    const uid = String(cols[0] || "").trim();
    const name = String(cols[1] || "").trim();
    if (uid && name) {
      entries.set(uid, {
        uid,
        name,
        type: clean(cols[2]),
        program: clean(cols[3]),
        title: clean(cols[4]),
        remarks: clean(cols[11]),
        aliases: [],
      });
    }
  }

  for (const cols of parseCsv(alt)) {
    const uid = String(cols[0] || "").trim();
    const name = String(cols[3] || "").trim();
    const entry = entries.get(uid);
    if (entry && name) entry.aliases.push({ name });
  }

  ofacCache = [...entries.values()];
  if (!ofacCache.length) throw new Error("OFAC returned no data");
  return ofacCache;
}

async function ofacLookup(params: URLSearchParams) {
  const name = (params.get("name") || "").trim();
  const parsedLimit = Number.parseInt(params.get("limit") || "5", 10);
  const parsedScore = Number.parseInt(params.get("minScore") || "85", 10);
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(parsedLimit, 10))
    : 5;
  const minScore = Number.isFinite(parsedScore)
    ? Math.max(70, Math.min(parsedScore, 100))
    : 85;

  if (name.length < 2) {
    throw Object.assign(new Error("name must contain at least 2 characters."), {
      status: 400,
    });
  }
  if (name.length > 160) {
    throw Object.assign(new Error("name must be 160 characters or fewer."), {
      status: 400,
    });
  }

  const candidates: any[] = [];
  for (const entry of await loadOfac()) {
    let bestScore = scoreName(name, entry.name);
    let matchedOn = "primary";
    let matchedName = entry.name;
    for (const alias of entry.aliases) {
      const aliasScore = scoreName(name, alias.name);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        matchedOn = "alias";
        matchedName = alias.name;
      }
    }
    if (bestScore >= minScore) {
      candidates.push({
        uid: entry.uid,
        primaryName: entry.name,
        type: entry.type,
        program: entry.program,
        title: entry.title,
        remarks: entry.remarks,
        matchedOn,
        matchedName,
        score: Math.round(bestScore),
      });
    }
  }

  candidates.sort(
    (a, b) =>
      Number(b.score) - Number(a.score) ||
      String(a.primaryName).localeCompare(String(b.primaryName)),
  );

  return {
    query: name,
    minScore,
    count: Math.min(candidates.length, limit),
    totalCandidatesAboveThreshold: candidates.length,
    candidates: candidates.slice(0, limit),
    source: "U.S. Treasury OFAC Specially Designated Nationals (SDN) List",
    sourceFiles: ["SDN.CSV", "ALT.CSV"],
    reviewRequired: true,
    limitations: [
      "Candidate-name screening only; a match is not a legal determination.",
      "A no-match is not a sanctions clearance.",
      "This service does not implement OFAC 50 Percent Rule ownership analysis.",
      "Review identifiers, addresses, dates of birth, program tags, and other OFAC data before acting.",
    ],
  };
}

function firstGeoByKey(geographies: any, key: string) {
  const value = geographies?.[key];
  return Array.isArray(value) && value.length ? value[0] : null;
}

function firstGeoByPattern(geographies: any, pattern: RegExp) {
  for (const [key, value] of Object.entries(geographies || {})) {
    if (pattern.test(key) && Array.isArray(value) && value.length) {
      return value[0];
    }
  }
  return null;
}

async function censusLookup(params: URLSearchParams) {
  const address = (params.get("address") || "").trim();
  if (address.length < 6) {
    throw Object.assign(
      new Error("address must contain at least 6 characters."),
      { status: 400 },
    );
  }
  if (address.length > 240) {
    throw Object.assign(
      new Error("address must be 240 characters or fewer."),
      { status: 400 },
    );
  }

  const url = new URL(
    "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress",
  );
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");

  const response = await fetchTimed(url.toString(), {}, 12000);
  if (!response.ok) throw new Error("Census returned " + response.status);
  const data: any = await response.json();
  const match = data?.result?.addressMatches?.[0];

  if (!match) {
    return {
      input: address,
      matched: false,
      matchedAddress: null,
      coordinates: null,
      addressComponents: null,
      geographies: null,
      source: "U.S. Census Bureau Geocoding Services",
    };
  }

  const geos = match.geographies || {};
  const state = firstGeoByKey(geos, "States");
  const county = firstGeoByKey(geos, "Counties");
  const tract = firstGeoByKey(geos, "Census Tracts");
  const block =
    firstGeoByKey(geos, "Census Blocks") ||
    firstGeoByPattern(geos, /^\d{4} Census Blocks$/i);
  const district = firstGeoByPattern(
    geos,
    /^(?:\d+(?:st|nd|rd|th) )?Congressional Districts$/i,
  );

  return {
    input: address,
    matched: true,
    matchedAddress: match.matchedAddress ?? null,
    coordinates: {
      longitude: match.coordinates?.x ?? null,
      latitude: match.coordinates?.y ?? null,
    },
    addressComponents: match.addressComponents ?? null,
    geographies: {
      stateFips: state?.STATE ?? null,
      countyFips: county?.COUNTY ?? null,
      countyGeoid: county?.GEOID ?? null,
      tract: tract?.TRACT ?? null,
      tractGeoid: tract?.GEOID ?? null,
      block: block?.BLOCK ?? null,
      blockGeoid: block?.GEOID ?? null,
      congressionalDistrict: district?.CD ?? district?.BASENAME ?? null,
    },
    source: "U.S. Census Bureau Geocoding Services",
  };
}

let rdapBootstrap: any = null;

function normalizeDomain(raw: string) {
  let value = raw.trim().toLowerCase();
  if (value.endsWith(".")) value = value.slice(0, -1);
  if (
    value.length < 3 ||
    value.length > 253 ||
    !/^[a-z0-9.-]+$/.test(value)
  ) return null;
  const labels = value.split(".");
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        label.startsWith("-") ||
        label.endsWith("-"),
    )
  ) return null;
  return value;
}

function findRdapBase(data: any, tld: string) {
  for (const service of data?.services || []) {
    if (
      (service?.[0] || []).some(
        (value: any) => String(value).toLowerCase() === tld,
      ) &&
      (service?.[1] || []).length
    ) return String(service[1][0]);
  }
  return null;
}

function vcardName(entity: any) {
  const card = entity?.vcardArray;
  if (!Array.isArray(card) || !Array.isArray(card[1])) return null;
  for (const item of card[1]) {
    if (Array.isArray(item) && item[0] === "fn") {
      return String(item[3] ?? "") || null;
    }
  }
  return null;
}

function eventMap(events: any) {
  const out: Record<string, string> = {};
  if (!Array.isArray(events)) return out;
  for (const item of events) {
    const action = String(item?.eventAction ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_match, char) => char.toUpperCase());
    const date = String(item?.eventDate ?? "");
    if (action && date && !out[action]) out[action] = date;
  }
  return out;
}

async function rdapLookup(params: URLSearchParams, baseUrl: string) {
  const domain = normalizeDomain(params.get("domain") || "");
  if (!domain) {
    throw Object.assign(
      new Error("domain must be a valid ASCII or punycode domain name."),
      { status: 400 },
    );
  }

  if (!rdapBootstrap) {
    const bootstrapResponse = await fetchTimed(
      "https://data.iana.org/rdap/dns.json",
      {
        headers: {
          accept: "application/json",
          "user-agent": "x402-data-tools/1.0",
        },
      },
      10000,
    );
    if (!bootstrapResponse.ok) {
      throw new Error("IANA returned " + bootstrapResponse.status);
    }
    rdapBootstrap = await bootstrapResponse.json();
  }

  const tld = domain.split(".").pop() || "";
  const rdapBase = findRdapBase(rdapBootstrap, tld);
  if (!rdapBase) {
    return {
      domain,
      registered: null,
      error: "no_rdap_bootstrap_service",
      source: "IANA RDAP Bootstrap Service Registry",
    };
  }

  const lookupUrl =
    rdapBase.replace(/\/+$/, "") + "/domain/" + encodeURIComponent(domain);
  const response = await fetchTimed(
    lookupUrl,
    {
      headers: {
        Accept: "application/rdap+json, application/json",
        "User-Agent": "x402-domain-rdap/1.0 (" + baseUrl + ")",
      },
      redirect: "follow",
    },
    12000,
  );

  if (response.status === 404) {
    return {
      domain,
      registered: false,
      authoritativeRdap: rdapBase,
      source: "Authoritative RDAP server discovered via IANA bootstrap",
    };
  }
  if (!response.ok) throw new Error("RDAP returned " + response.status);

  const data: any = await response.json();
  const registrarEntity = Array.isArray(data.entities)
    ? data.entities.find(
        (entity: any) =>
          Array.isArray(entity.roles) &&
          entity.roles
            .map((role: any) => String(role).toLowerCase())
            .includes("registrar"),
      )
    : undefined;

  const nameservers = Array.isArray(data.nameservers)
    ? data.nameservers
        .map((ns: any) => String(ns.ldhName ?? ns.unicodeName ?? ""))
        .filter(Boolean)
    : [];

  return {
    domain,
    registered: true,
    handle: data.handle ?? null,
    unicodeName: data.unicodeName ?? null,
    status: Array.isArray(data.status) ? data.status : [],
    registrar: registrarEntity
      ? {
          name: vcardName(registrarEntity),
          handle: registrarEntity.handle ?? null,
        }
      : null,
    events: eventMap(data.events),
    nameservers,
    secureDns: data.secureDNS
      ? { delegationSigned: data.secureDNS.delegationSigned ?? null }
      : null,
    authoritativeRdap: rdapBase,
    source: "Authoritative RDAP server discovered via IANA bootstrap",
  };
}

async function treasuryLookup(params: URLSearchParams, baseUrl: string) {
  const security = (params.get("security") || "").trim();
  if (security.length > 100) {
    throw Object.assign(
      new Error("security filter must be 100 characters or fewer."),
      { status: 400 },
    );
  }

  const url = new URL(
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates",
  );
  url.searchParams.set(
    "fields",
    "record_date,security_type_desc,security_desc,avg_interest_rate_amt",
  );
  url.searchParams.set("sort", "-record_date");
  url.searchParams.set("page[size]", "100");

  const response = await fetchTimed(
    url.toString(),
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "x402-treasury-average-rates/1.0 (" + baseUrl + ")",
      },
    },
    10000,
  );
  if (!response.ok) throw new Error("Treasury returned " + response.status);

  const payload: any = await response.json();
  const rows = payload?.data || [];
  if (!rows.length) throw new Error("Treasury returned no data");

  const recordDate = String(rows[0]?.record_date || "");
  const needle = security.toLowerCase();
  const latest = rows.filter(
    (row: any) => String(row.record_date || "") === recordDate,
  );
  const filtered = needle
    ? latest.filter((row: any) =>
        String(row.security_desc || "").toLowerCase().includes(needle)
      )
    : latest;

  return {
    recordDate,
    count: filtered.length,
    rates: filtered.map((row: any) => ({
      securityDescription: row.security_desc ?? null,
      securityType: row.security_type_desc ?? null,
      averageInterestRatePercent:
        row.avg_interest_rate_amt === "" || row.avg_interest_rate_amt == null
          ? null
          : Number(row.avg_interest_rate_amt),
    })),
    source:
      "U.S. Treasury Fiscal Data — Average Interest Rates on U.S. Treasury Securities",
    frequency: "monthly",
  };
}

const ROUTES: RouteDef[] = [
  {
    path: "/api/sec-filings",
    serviceName: "SEC Recent Filings",
    description:
      "Check a public company's latest SEC filings when an agent needs to verify whether a filing exists or inspect recent filing activity before continuing research or diligence.",
    tags: ["SEC", "EDGAR", "filings", "finance", "company-data"],
    example: { ticker: "AAPL", form: "10-K", limit: 5 },
    outputExample: { company: { name: "Apple Inc." }, count: 1, filings: [], paid: true },
    parameters: [
      { name: "ticker", in: "query", required: false, schema: { type: "string", maxLength: 12 }, example: "AAPL" },
      { name: "cik", in: "query", required: false, schema: { type: "string" }, example: "0000320193" },
      { name: "form", in: "query", required: false, schema: { type: "string", maxLength: 20 }, example: "10-K" },
      { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 25, default: 10 }, example: 5 },
    ],
    execute: (params) => secLookup(params),
  },
  {
    path: "/api/ofac-sdn-screen",
    serviceName: "OFAC Name Screen",
    description:
      "Check whether a submitted person or organization name produces current OFAC SDN review candidates before an agent continues a compliance-sensitive workflow. No-match is not sanctions clearance.",
    tags: ["OFAC", "sanctions", "compliance", "name-screening", "risk"],
    example: { name: "VLADIMIR PUTIN", limit: 5, minScore: 85 },
    outputExample: { query: "VLADIMIR PUTIN", count: 1, candidates: [], paid: true },
    parameters: [
      { name: "name", in: "query", required: true, schema: { type: "string", minLength: 2, maxLength: 160 }, example: "VLADIMIR PUTIN" },
      { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 10, default: 5 } },
      { name: "minScore", in: "query", required: false, schema: { type: "integer", minimum: 70, maximum: 100, default: 85 } },
    ],
    execute: (params) => ofacLookup(params),
  },
  {
    path: "/api/us-address-geocode",
    serviceName: "US Census Geocoder",
    description:
      "Verify and normalize a U.S. street address with official Census data when an agent needs location consistency or geography identifiers before continuing a workflow.",
    tags: ["geocoding", "Census", "address", "geography", "US"],
    example: { address: "4600 Silver Hill Rd, Washington, DC 20233" },
    outputExample: { matched: true, matchedAddress: "4600 SILVER HILL RD, WASHINGTON, DC, 20233", paid: true },
    parameters: [
      { name: "address", in: "query", required: true, schema: { type: "string", minLength: 6, maxLength: 240 }, example: "4600 Silver Hill Rd, Washington, DC 20233" },
    ],
    execute: (params) => censusLookup(params),
  },
  {
    path: "/api/domain-rdap",
    serviceName: "Domain RDAP Lookup",
    description:
      "Check authoritative domain registration, registrar, lifecycle dates, and nameservers when an agent needs domain-age or identity evidence before trusting a counterparty.",
    tags: ["RDAP", "domain", "registration", "DNS", "internet"],
    example: { domain: "example.com" },
    outputExample: { domain: "example.com", registered: true, paid: true },
    parameters: [
      { name: "domain", in: "query", required: true, schema: { type: "string", minLength: 3, maxLength: 253 }, example: "example.com" },
    ],
    execute: (params, base) => rdapLookup(params, base),
  },
  {
    path: "/api/treasury-average-rates",
    serviceName: "Treasury Avg Rates",
    description:
      "Get the latest official monthly average Treasury rate for a requested security category when an agent needs a government-source rate input for a decision or calculation.",
    tags: ["Treasury", "interest-rates", "government", "macro", "finance"],
    example: { security: "Total Marketable" },
    outputExample: { recordDate: "2026-09-30", count: 1, rates: [], paid: true },
    parameters: [
      { name: "security", in: "query", required: false, schema: { type: "string", maxLength: 100 }, example: "Total Marketable" },
    ],
    execute: (params, base) => treasuryLookup(params, base),
  },
];

function catalog(base: string) {
  return {
    x402Version: 2,
    name: "Agent Data Tools x402",
    description: "Five public-data x402 APIs on Base USDC.",
    resources: ROUTES.map((route) => ({
      resource: base + route.path,
      method: "GET",
      description: route.description,
      price: PRICE,
      tags: route.tags,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          route.parameters.map((parameter: any) => [parameter.name, parameter.schema]),
        ),
        required: route.parameters
          .filter((parameter: any) => parameter.required)
          .map((parameter: any) => parameter.name),
      },
      outputSchema: { type: "object" },
      accepts: [requirements()],
    })),
  };
}

function openApi(base: string) {
  const paths: Record<string, any> = {};
  for (const route of ROUTES) {
    paths[route.path] = {
      get: {
        operationId: route.path
          .replace(/[^a-z0-9]+/gi, "_")
          .replace(/^_|_$/g, ""),
        summary: route.description,
        tags: [route.serviceName],
        security: [],
        "x-payment-info": {
          price: { mode: "fixed", currency: "USD", amount: "0.005000" },
          protocols: [{ x402: {} }],
        },
        parameters: route.parameters,
        responses: {
          "200": { description: "Paid result" },
          "400": { description: "Invalid input" },
          "402": { description: "Payment Required" },
          "502": { description: "Authoritative source temporarily unavailable" },
        },
      },
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Agent Data Tools x402",
      version: "1.0.0",
      description:
        "Five machine-purchasable public-data APIs with x402 v2 Base USDC settlement.",
      "x-guidance":
        "Use the five GET operations for SEC filings, OFAC candidate-name screening, Census address geocoding, authoritative domain RDAP, and Treasury average rates. Every paid route costs $0.005 USDC on Base. Discovery documents are free and public. Source failures before a result do not settle payment.",
      contact: { email: "jayp19386@gmail.com" },
    },
    servers: [{ url: base }],
    paths,
  };
}

async function handlePaid(
  request: Request,
  url: URL,
  base: string,
  route: RouteDef,
) {
  const signature =
    request.headers.get("payment-signature") ||
    request.headers.get("x-payment");

  if (!signature) return paymentRequired(route, base);

  let paymentPayload: any;
  try {
    paymentPayload = decodePayment(signature);
  } catch {
    return paymentRequired(route, base, "invalid_payment_header");
  }

  try {
    const verification = await facilitator("verify", paymentPayload);
    if (
      verification.body?.isValid !== true &&
      verification.body?.success !== true
    ) {
      return paymentRequired(
        route,
        base,
        String(
          verification.body?.invalidReason ||
            verification.body?.errorReason ||
            "payment_verification_failed",
        ),
      );
    }
  } catch {
    return json(
      {
        error: "payment_verifier_unavailable",
        paymentState: "unresolved",
        retrySamePayment: true,
      },
      503,
      { "Retry-After": "2" },
    );
  }

  let result: any;
  try {
    result = await route.execute(url.searchParams, base);
  } catch (error: any) {
    const status = Number(error?.status) || 502;
    return json(
      {
        error: error?.message || "required_source_unavailable",
        chargeable: false,
      },
      status,
    );
  }

  const settlement = await settleSamePayment(paymentPayload);
  if (!settlement.ok) {
    if (settlement.terminal) {
      return paymentRequired(route, base, settlement.reason);
    }
    return json(
      {
        error: settlement.reason,
        paymentState: "unresolved",
        retrySamePayment: true,
      },
      503,
      { "Retry-After": "2" },
    );
  }

  // Observability is best-effort: logging must never break a paid response.
  // Facilitator claims are NOT independent on-chain or outside-buyer evidence.
  try {
    const receipt = settlement.receipt ?? {};
    const transaction =
      typeof receipt.transaction === "string" &&
      /^0x[0-9a-fA-F]{64}$/.test(receipt.transaction)
        ? receipt.transaction.toLowerCase()
        : null;
    const payer =
      typeof receipt.payer === "string" &&
      /^0x[0-9a-fA-F]{40}$/.test(receipt.payer)
        ? receipt.payer.toLowerCase()
        : null;
    const expectedNetwork = receipt.network === NETWORK;

    console.info(JSON.stringify({
      event: "x402_settlement_succeeded",
      schema_version: 2,
      product_id: route.path.slice("/api/".length),
      route: route.path,
      listed_price_usdc: PRICE.slice(1),
      expected_amount_atomic_usdc: AMOUNT,
      network: expectedNetwork ? NETWORK : null,
      transaction,
      payer,
      evidence_source: "facilitator_settle_response",
      onchain_verified: false,
      external_buyer_verified: false,
      eligible_for_revenue_scoreboard: false,
      settled_at: new Date().toISOString(),
    }));
  } catch {
    // Successful settlement and the client's receipt take priority over logs.
  }

  return json(
    { ...result, paid: true },
    200,
    {
      "PAYMENT-RESPONSE": utf8ToB64(JSON.stringify(settlement.receipt)),
      "x402-settled": "true",
    },
  );
}

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);
  const context = requestContext(url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (request.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405);
  }

  if (context.subpath === "/" || context.subpath === "") {
    return json({
      ok: true,
      service: "Agent Data Tools x402",
      build: BUILD_ID,
      seller: context.base,
      price: "$0.005 USDC per route",
      network: NETWORK,
      routes: ROUTES.map((route) => route.path),
    });
  }

  if (context.subpath === "/health") {
    return json({
      ok: true,
      service: "Agent Data Tools x402",
      build: BUILD_ID,
      routeCount: ROUTES.length,
    });
  }

  if (context.subpath === "/api/payment-info") {
    return json({
      price: PRICE,
      amountAtomic: AMOUNT,
      asset: USDC,
      network: NETWORK,
      payTo: PAY_TO,
      facilitator: FACILITATOR,
      routes: ROUTES.map((route) => route.path),
    });
  }

  if (
    context.subpath === "/.well-known/x402" ||
    context.subpath === "/.well-known/x402.json"
  ) {
    return json(catalog(context.base), 200, {
      "cache-control": "public, max-age=300",
    });
  }

  if (context.subpath === "/openapi.json") {
    return json(openApi(context.base), 200, {
      "cache-control": "public, max-age=300",
    });
  }

  if (context.subpath === "/llms.txt") {
    return plain(
      "# Agent Data Tools x402\n\nFive paid GET APIs on one seller origin.\n\n" +
        ROUTES.map(
          (route) =>
            "- " +
            context.base +
            route.path +
            " — " +
            route.description +
            " — $0.005 USDC on Base",
        ).join("\n") +
        "\n\nOpenAPI: " +
        context.base +
        "/openapi.json\n",
    );
  }

  if (context.subpath === "/skill.md") {
    return plain(
      "# Agent Data Tools x402\n\nUse for authoritative SEC filings, OFAC candidate-name review, Census address geocoding, domain RDAP, and Treasury average rates.\n\nEvery paid route costs $0.005 USDC on Base via x402 v2. Unpaid calls return HTTP 402 with PAYMENT-REQUIRED. Source failures before a result are not settled.\n",
      200,
      "text/markdown; charset=utf-8",
    );
  }

  if (context.subpath === "/robots.txt") {
    return plain("User-agent: *\nAllow: /\n");
  }

  const route = ROUTES.find((candidate) => candidate.path === context.subpath);
  if (!route) return json({ error: "not_found" }, 404);

  return await handlePaid(request, url, context.base, route);
});
