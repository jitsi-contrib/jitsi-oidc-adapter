// oidc
export const OIDC_ISSUER_URL = Deno.env.get("OIDC_ISSUER_URL") ||
  "https://ucs-sso-ng.mydomain.corp/realms/ucs";
export const OIDC_CLIENT_ID = Deno.env.get("OIDC_CLIENT_ID") || "jitsi";
export const OIDC_CLIENT_SECRET = Deno.env.get("OIDC_CLIENT_SECRET") || "";
export const OIDC_SCOPES = Deno.env.get("OIDC_SCOPES") ||
  "openid profile email";

// jwt
export const JWT_ALG = Deno.env.get("JWT_ALG") || "HS256";
export const JWT_HASH = Deno.env.get("JWT_HASH") || "SHA-256";
export const JWT_APP_ID = Deno.env.get("JWT_APP_ID") || "myappid";
export const JWT_APP_SECRET = Deno.env.get("JWT_APP_SECRET") || "myappsecret";
export const JWT_EXP_SECOND = Number(Deno.env.get("JWT_EXP_SECOND") || 10800);

// adapter
export const HOSTNAME = Deno.env.get("HOSTNAME") || "127.0.0.1";
export const PORT = Number(Deno.env.get("PORT") || 9000);
