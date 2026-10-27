---
title: Get an access token
description: Exchange shelter credentials or a refresh token for an access token.
operation:
  protocol: rest
  method: POST
  path: /oauth2/token
  server: https://auth.harbour.example
  auth: none
  requestBody:
    contentType: application/x-www-form-urlencoded
    schema:
      oneOf:
        - type: object
          description: Signs in with a shelter's client credentials.
          required: [grant_type, client_id, client_secret]
          properties:
            grant_type: { type: string, const: client_credentials }
            client_id: { type: string }
            client_secret: { type: string }
        - type: object
          description: Renews an expiring token.
          required: [grant_type, refresh_token]
          properties:
            grant_type: { type: string, const: refresh_token }
            refresh_token: { type: string }
    example: { grant_type: client_credentials, client_id: shelter_7, client_secret: "<secret>" }
  responses:
    200:
      description: A bearer token for the HTTP API and MCP server.
      schema:
        type: object
        required: [access_token, token_type, expires_in]
        properties:
          access_token: { type: string, example: hb_example }
          token_type: { type: string, const: Bearer }
          expires_in: { type: integer, example: 3600 }
          refresh_token: { type: [string, "null"], example: hbr_example }
    400: { description: "An unknown grant or wrong credentials, as an OAuth error." }
---

The token endpoint lives on the auth server, so it takes a form body like any OAuth 2 server.
