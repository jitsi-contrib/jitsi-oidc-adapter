# Development Notes

## Building the image

```bash
docker build -t jitsi-oidc-adapter .
```

## Running the container

```bash
docker run \
  --name adapter \
  -p "9000:9000/TCP" \
  -e OIDC_ISSUER_URL=https://ucs-sso-ng.mydomain.corp/realms/ucs \
  -e OIDC_CLIENT_ID=jitsi \
  -e JWT_APP_ID=myappid \
  -e JWT_APP_SECRET=myappsecret \
  -e ALLOW_UNSECURE_CERT=true \
  jitsi-oidc-adapter
```

## Stopping the container

```bash
docker stop adapter
```
