# ------------------------------------------------------------------------------
# trivy to generate SBOM
# ------------------------------------------------------------------------------
FROM ghcr.io/aquasecurity/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c AS trivy

RUN trivy image --format spdx-json --output /container.json denoland/deno

# ------------------------------------------------------------------------------
# prod
# ------------------------------------------------------------------------------
FROM denoland/deno
LABEL version="v20260328"

WORKDIR /app

COPY --from=trivy /container.json /SBOM/container.json
COPY src/config.ts src/context.ts src/adapter.ts /app/
COPY docker-entrypoint.sh /usr/local/bin/
RUN \
  deno cache /app/adapter.ts && \
  deno info /app/adapter.ts --json > /SBOM/application-dependencies.json && \
  chmod +x /usr/local/bin/docker-entrypoint.sh

ENV OIDC_ISSUER_URL="https://ucs-sso-ng.mydomain.corp/realms/ucs"
ENV OIDC_CLIENT_ID="jitsi"
ENV OIDC_CLIENT_SECRET=""
ENV OIDC_SCOPES="openid profile email"
ENV JWT_ALG="HS256"
ENV JWT_HASH="SHA-256"
ENV JWT_APP_ID="myappid"
ENV JWT_APP_SECRET="myappsecret"
ENV JWT_EXP_SECOND=10800
ENV ALLOW_UNSECURE_CERT=false
ENV HOSTNAME="0.0.0.0"
ENV PORT=9000

USER deno
EXPOSE 9000
ENTRYPOINT ["docker-entrypoint.sh"]
