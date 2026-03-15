import { STATUS_CODE } from "jsr:@std/http@^1.0.23/status";
import { encodeBase64 } from "jsr:@std/encoding@^1.0.10/base64";
import { create, getNumericDate } from "jsr:@emrahcom/jwt@^0.4.8";
import type { Algorithm } from "jsr:@emrahcom/jwt@^0.4.8/algorithm";
import {
  HOSTNAME,
  JWT_ALG,
  JWT_APP_ID,
  JWT_APP_SECRET,
  JWT_EXP_SECOND,
  JWT_HASH,
  OIDC_CLIENT_ID,
  OIDC_CLIENT_SECRET,
  OIDC_ISSUER_URL,
  OIDC_SCOPES,
  PORT,
} from "./config.ts";
import { createContext } from "./context.ts";
import type { UserInfo } from "./context.ts";

// -----------------------------------------------------------------------------
// Globals
// -----------------------------------------------------------------------------
const DISCOVERY_URL = `${OIDC_ISSUER_URL}/.well-known/openid-configuration`;
let AUTH_ENDPOINT = "";
let TOKEN_ENDPOINT = "";
let USERINFO_ENDPOINT = "";
let CRYPTO_KEY: CryptoKey;

interface StateType {
  tenant?: string;
  room: string;
  [key: string]: boolean | string | undefined;
}

const enum ClientType {
  ios,
  android,
  electron,
  browser,
}

// -----------------------------------------------------------------------------
// Detect the client type by using the state data coming from the client.
// -----------------------------------------------------------------------------
function detectClientType(state: StateType): ClientType {
  if (state.ios) return ClientType.ios;
  if (state.android) return ClientType.android;
  if (state.electron) return ClientType.electron;

  return ClientType.browser;
}

// -----------------------------------------------------------------------------
// HTTP response for OK
// -----------------------------------------------------------------------------
function ok(body: string): Response {
  return new Response(body, {
    status: STATUS_CODE.OK,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for NotFound
// -----------------------------------------------------------------------------
function notFound(): Response {
  return new Response(null, {
    status: STATUS_CODE.NotFound,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for MethodNotAllowed
// -----------------------------------------------------------------------------
function methodNotAllowed(): Response {
  return new Response(null, {
    status: STATUS_CODE.MethodNotAllowed,
  });
}

// -----------------------------------------------------------------------------
// HTTP response for Unauthorized
// -----------------------------------------------------------------------------
function unauthorized(): Response {
  return new Response(null, {
    status: STATUS_CODE.Unauthorized,
  });
}

// -----------------------------------------------------------------------------
// Generate and set the crypto key at the beginning and use the same crypto key
// during the process lifetime.
// -----------------------------------------------------------------------------
async function setCryptoKey() {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(JWT_APP_SECRET);

  CRYPTO_KEY = await crypto.subtle.importKey(
    "raw",
    keyData,
    {
      name: "HMAC",
      hash: JWT_HASH,
    },
    true,
    ["sign"],
  );
}

// -----------------------------------------------------------------------------
// Get OIDC endpoints.
// -----------------------------------------------------------------------------
async function getEndpoints() {
  try {
    const res = await fetch(DISCOVERY_URL);
    if (!res.ok) throw "Failed to get endpoints";

    const config = await res.json();
    AUTH_ENDPOINT = config.authorization_endpoint || "";
    TOKEN_ENDPOINT = config.token_endpoint || "";
    USERINFO_ENDPOINT = config.userinfo_endpoint || "";

    if (!AUTH_ENDPOINT || !TOKEN_ENDPOINT || !USERINFO_ENDPOINT) {
      throw "Missing endpoint";
    }

    console.log(`AUTH_ENDPOINT: ${AUTH_ENDPOINT}`);
    console.log(`TOKEN_ENDPOINT: ${TOKEN_ENDPOINT}`);
    console.log(`USERINFO_ENDPOINT: ${USERINFO_ENDPOINT}`);
  } catch (e) {
    console.error(e);
  }
}

// -----------------------------------------------------------------------------
// Prepare the auth URI for the OIDC auth page.
// -----------------------------------------------------------------------------
async function getAuthUri(redirectUri: string, state: string) {
  if (!AUTH_ENDPOINT) await getEndpoints();
  if (!AUTH_ENDPOINT) throw "missing authentication endpoint";

  const params = new URLSearchParams({
    client_id: OIDC_CLIENT_ID,
    response_type: "code",
    scope: OIDC_SCOPES,
    prompt: "consent",
    redirect_uri: redirectUri,
    state: state,
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

// -----------------------------------------------------------------------------
// Redirect the user to the OIDC auth page to get the short-term auth code.
// -----------------------------------------------------------------------------
async function auth(req: Request): Promise<Response> {
  try {
    const host = req.headers.get("host");
    if (!host) throw "host not found";

    const url = new URL(req.url);
    const state = url.searchParams.get("state");
    if (!state) throw "state not found";

    const redirectUri = `https://${host}/oidc/tokenize`;
    const authPage = await getAuthUri(redirectUri, state);

    return Response.redirect(authPage, STATUS_CODE.Found);
  } catch (e) {
    console.error(e);
    return unauthorized();
  }
}

// -----------------------------------------------------------------------------
// - Sub is tenant (if exists). If not then sub is the meeting domain (host).
// - Tenant is the previous folder in Jitsi's path before the room name.
// - stateTenant (as input) doesn't contain the room name. So, get the last
//   folder.
// - stateTenant doesn't exist all the times. So, it may be undefined.
// -----------------------------------------------------------------------------
function getSub(host: string, stateTenant: string | undefined): string {
  if (!stateTenant) return host;

  // trim trailing slashes
  const tenantPath = stateTenant.replace(/\/+$/g, "");

  // get the latest folder from the path
  const tenant = tenantPath.split("/").at(-1);

  return tenant || host;
}

// -----------------------------------------------------------------------------
// Get the access token by using the short-term auth code.
// -----------------------------------------------------------------------------
async function getAccessToken(
  host: string,
  code: string,
  jsonState: string,
): Promise<string> {
  const redirectUri = `https://${host}/oidc/tokenize`;

  const headers = new Headers();
  headers.append("Accept", "application/json");

  const data = new URLSearchParams();
  data.append("grant_type", "authorization_code");
  data.append("redirect_uri", redirectUri);
  data.append("code", code);
  data.append("state", jsonState);

  if (OIDC_CLIENT_SECRET) {
    headers.append(
      "Authorization",
      "Basic " + encodeBase64(`${OIDC_CLIENT_ID}:${OIDC_CLIENT_SECRET}`),
    );
  } else {
    data.append("client_id", OIDC_CLIENT_ID);
  }

  if (!TOKEN_ENDPOINT) await getEndpoints();
  if (!TOKEN_ENDPOINT) throw "missing token endpoint";

  // Send the request for the access token.
  const res = await fetch(TOKEN_ENDPOINT, {
    headers: headers,
    method: "POST",
    body: data,
  });
  const json = await res.json();
  const accessToken = json.access_token;
  if (!accessToken) throw "access-token request failed";

  return accessToken;
}

// -----------------------------------------------------------------------------
// Get the user info from OIDC by using the access token.
// -----------------------------------------------------------------------------
async function getUserInfo(
  accessToken: string,
): Promise<UserInfo> {
  if (!USERINFO_ENDPOINT) await getEndpoints();
  if (!USERINFO_ENDPOINT) throw "missing userinfo endpoint";

  // Send request for the user info.
  const res = await fetch(USERINFO_ENDPOINT, {
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    method: "GET",
  });
  const userInfo = await res.json() as UserInfo;

  // Sub is the mandotary field in response for a successful request.
  if (!userInfo.sub) throw "no user info";

  return userInfo;
}

// -----------------------------------------------------------------------------
// Generate Jitsi's token (jwt).
// -----------------------------------------------------------------------------
async function generateJwt(
  sub: string,
  room: string,
  userInfo: UserInfo,
): Promise<string> {
  const header = { typ: "JWT", alg: JWT_ALG as Algorithm };
  const payload = {
    aud: JWT_APP_ID,
    iss: JWT_APP_ID,
    sub: sub,
    room: room,
    iat: getNumericDate(0),
    nbf: getNumericDate(0),
    exp: getNumericDate(JWT_EXP_SECOND),
    context: createContext(userInfo),
  };

  return await create(header, payload, CRYPTO_KEY);
}

// -----------------------------------------------------------------------------
// Generate hashes for Jitsi session.
// -----------------------------------------------------------------------------
function generateHash(jsonState: string): string {
  let hash = "adapter=true";

  try {
    const state = JSON.parse(jsonState) as StateType;

    for (const key in state) {
      // See https://github.com/jitsi/jitsi-meet for allowed hashes.
      // react/features/authentication/functions.any.ts
      if (
        !key.startsWith("config.") &&
        !key.startsWith("interfaceConfig.") &&
        !key.startsWith("iceServers.")
      ) continue;

      hash = `${hash}&${encodeURIComponent(key)}`;
      hash = `${hash}=${encodeURIComponent(JSON.stringify(state[key]))}`;
    }
  } catch (e) {
    console.error(e);
  }

  return hash;
}

// -----------------------------------------------------------------------------
// Create URI of the Jitsi meeting with a token and hashes.
// Use URI scheme depending on the detected client type.
// -----------------------------------------------------------------------------
function getMeetingUri(
  host: string,
  tenant: string | undefined,
  room: string,
  jwt: string,
  hash: string,
  client: ClientType,
): string {
  const clientUriScheme: Record<ClientType, string> = {
    [ClientType.ios]: "org.jitsi.meet",
    [ClientType.android]: "intent",
    [ClientType.electron]: "jitsi-meet",
    [ClientType.browser]: "https",
  };

  const scheme = clientUriScheme[client];

  tenant = tenant || "";

  let uri = `${host}/${tenant}/${room}`;
  uri = uri.replace(/\/+/g, "/");
  uri = `${scheme}://${uri}?jwt=${jwt}#${hash}`;
  if (client == ClientType.android) {
    uri += "#Intent;scheme=org.jitsi.meet;package=org.jitsi.meet;end";
  }

  return uri;
}

// -----------------------------------------------------------------------------
// Generate the response for the tokenize endpoint.
// -----------------------------------------------------------------------------
function generateTokenizeResponse(uri: string, client: ClientType): Response {
  // Normal browser client, redirect to the meeting page.
  if (client == ClientType.browser) {
    return Response.redirect(uri, STATUS_CODE.Found);
  }

  // Show page in web browser that feeds JWT to other clients via auto-refresh.
  const body = `<!DOCTYPE html>
    <html>
    <head>
      <title>Authentication successful</title>
    </head>
    <body>
      <h3>Authentication successful.</h3>
      <p>You can close this tab and go back to your Jitsi client.</p>
    </body>
    </html>`;

  return new Response(body, {
    headers: {
      "refresh": `0; url=${uri}`,
      "content-type": "text/html",
    },
  });
}

// -----------------------------------------------------------------------------
// - User comes here after redirected by the auth page with a short-term code
// - Get the OIDC access token by using this short-term auth code
// - Get the OIDC user info by using the access code
// - Generate Jitsi's token by using the user info
// - Redirect the user to Jitsi's meeting page with a token and hashes
// -----------------------------------------------------------------------------
async function tokenize(req: Request): Promise<Response> {
  try {
    const host = req.headers.get("host");
    if (!host) throw "host not found";

    const url = new URL(req.url);
    const searchParams = url.searchParams;

    const code = searchParams.get("code");
    if (!code) throw "code not found";

    const jsonState = searchParams.get("state");
    if (!jsonState) throw "state not found";

    const state = JSON.parse(jsonState) as StateType;
    const sub = getSub(host, state.tenant);
    const room = state.room;
    if (!room) throw "room not found in state";

    // Detect client type
    const client = detectClientType(state);
    // Get the OIDC access token by using the short-term auth code.
    const accessToken = await getAccessToken(host, code, jsonState);
    // Get the OIDC user info by using the access token.
    const userInfo = await getUserInfo(accessToken);
    // Generate Jitsi token.
    const jwt = await generateJwt(sub, room, userInfo);
    // Generate Jitsi hash.
    const hash = generateHash(jsonState);
    // Get URI of the Jitsi meeting. Use unmodified path (state.tenant) which is
    // different than the tenant in JWT context.
    const uri = getMeetingUri(host, state.tenant, room, jwt, hash, client);

    return generateTokenizeResponse(uri, client);
  } catch (e) {
    console.error(e);
    return unauthorized();
  }
}

// -----------------------------------------------------------------------------
// handler
// -----------------------------------------------------------------------------
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method !== "GET") return methodNotAllowed();

  if (path === "/health") {
    return ok("healthy");
  } else if (path === "/oidc/health") {
    return ok("healthy");
  } else if (path === "/oidc/auth") {
    return await auth(req);
  } else if (path === "/oidc/tokenize") {
    return await tokenize(req);
  } else {
    return notFound();
  }
}

// -----------------------------------------------------------------------------
// main
// -----------------------------------------------------------------------------
async function main() {
  // Get OIDC endpoints. It will try again if it fails in the first try.
  await getEndpoints();

  console.log(`OIDC_ISSUER_URL: ${OIDC_ISSUER_URL}`);
  console.log(`OIDC_CLIENT_ID: ${OIDC_CLIENT_ID}`);
  console.log(
    `OIDC_CLIENT_SECRET: ${OIDC_CLIENT_SECRET ? "*** masked ***" : "not used"}`,
  );
  console.log(`OIDC_SCOPES: ${OIDC_SCOPES}`);
  console.log(`JWT_ALG: ${JWT_ALG}`);
  console.log(`JWT_HASH: ${JWT_HASH}`);
  console.log(`JWT_APP_ID: ${JWT_APP_ID}`);
  console.log(`JWT_APP_SECRET: *** masked ***`);
  console.log(`JWT_EXP_SECOND: ${JWT_EXP_SECOND}`);
  console.log(`HOSTNAME: ${HOSTNAME}`);
  console.log(`PORT: ${PORT}`);

  // Generate and set the crypto key once at the beginning and use the same key
  // during the process lifetime.
  await setCryptoKey();

  Deno.serve({
    hostname: HOSTNAME,
    port: PORT,
  }, handler);
}

// -----------------------------------------------------------------------------
main();
