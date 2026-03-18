# Dockerized setup

**NOT READY YET**

- [1. OIDC Adapter](#1-oidc-adapter)
- [2. Jitsi](#2-jitsi)
  - [2.1 OIDC adapter as a proxy](#21-oidc-adapter-as-a-proxy)
  - [2.2 Token authentication](#22-token-authentication)
  - [2.3 Guest participants](#23-guest-participants)

The setup guide to integrate `Jitsi OIDC Adapter` with a Dockerized Jitsi setup.

This guide assumes that you have already a working `Jitsi` on a Docker
environment. See
[Jitsi Meet Handbook](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/)
for further details.

Tested with Jitsi `stable-10741` images.

## 1. OIDC Adapter

```bash
docker run -d \
  --name adapter \
  -p "9000:9000/TCP" \
  -e OIDC_ISSUER_URL=https://my.provider.tld/realms/myrealm \
  -e OIDC_CLIENT_ID=myclientid \
  -e OIDC_CLIENT_SECRET= \
  -e JWT_APP_ID=myappid \
  -e JWT_APP_SECRET=myappsecret \
  -e ALLOW_UNSECURE_CERT=true \
  -e AUTO_RETURN_TO_APP=true \
  ghcr.io/jitsi-contrib/jitsi-oidc-adapter
```

- `OIDC_ISSUER_URL` must be resolvable and accessible for participants and the
  container.

- `JWT_APP_ID` and `JWT_APP_SECRET` must be the same for both
  `jitsi-oidc-adapter` and Jitsi containers.

- Set `ALLOW_UNSECURE_CERT` to `true` if the OIDC provider has not a trusted
  certificate. For the production environment, it should have a trusted
  certificate and this value should be `false` (_it is `false` by default_).

- Set `OIDC_CLIENT_SECRET` if the client authentication is enabled in the OIDC
  provider. Otherwise it must be empty.

- Set `AUTO_RETURN_TO_APP` to `true` to automatically redirect users back to the
  initiating Jitsi app (Android, iOS or Electron) after authentication. If
  `false`, users must manually click a link in the final step to return. This
  setting does not affect the web client.

  **Important:** When `true`, certain OIDC providers may cause a "broken tab"
  issue (see [#1](https://github.com/jitsi-contrib/jitsi-oidc-adapter/pull/1))
  on Chromium-based Android browsers (Chrome, Brave, etc.) when returning to the
  app. Firefox (Android) and Safari (iOS) are unaffected.

  To test this behavior:

  - Set a Chromium-based browser as the default on Android.
  - Ensure the browser is signed out of your OIDC provider.
  - Start a meeting in the Jitsi Meet mobile app and log in.
  - Observe if the browser tab fails to close or displays an error after
    returning to the app.

## 2. Jitsi

### 2.1 OIDC adapter as a proxy

Create a proxy config for Jitsi's `web` container. If you have a docker-compose
environment, this file should be `~/.jitsi-meet-cfg/web/nginx-custom/oidc.conf`.
Update the address of `proxy_pass` according to your environment.

```config
location ~ /oidc/ {
    proxy_pass http://172.17.17.1:9000;
    proxy_http_version 1.1;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header Host $http_host;
}
```

I use `172.17.17.1` in this example because this is the IP address of my host
machine and Jitsi's `web` container can access my `jitsi-oidc-adapter` container
using this IP and port.

### 2.2 Token authentication

Set the following environment variables to enable the token authentication for
`Jitsi`:

- Enable authentication

  `ENABLE_AUTH=true`

- But not for `jicofo`

  `JICOFO_ENABLE_AUTH=false`

- Select the authentication type

  `AUTH_TYPE=jwt`

- Application identifier

  `JWT_APP_ID=myappid`

- Application secret known only to your token generators (_such as_
  `jitsi-oidc-adapter`)

  `JWT_APP_SECRET=myappsecret`

- Set `tokenAuthUrl` according to your domain

  `TOKEN_AUTH_URL=https://my.jitsi.tld/oidc/auth?state={state}`

### 2.3 Guest participants

Set the following environment variables to allow guest participants and to
activate "wait for host" feature:

- Enable guest participants

  `ENABLE_GUESTS=true`

- Enable the persistent lobby module

  `XMPP_MODULES=persistent_lobby`

- Enable the wait for host module

  `XMPP_MUC_MODULES=muc_wait_for_host`
