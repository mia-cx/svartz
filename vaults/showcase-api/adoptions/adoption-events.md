---
title: Adoption events
description: A WebSocket that pushes each adoption's decisions as they happen.
tags: [adoptions]
operation:
  protocol: websocket
  path: /adoptions/events
  auth: { scheme: bearer, description: A token with `adoptions:read`. }
  parameters:
    - name: shelter
      in: query
      type: string
      description: Only this shelter's adoptions.
      example: sh_12
  responses:
    101:
      description: Switching Protocols. The socket is open.
    401:
      description: A missing or invalid token.
      schema:
        $ref: Error
    429:
      description: A sixth socket for one token.
  messages:
    - direction: send
      name: ping
      description: Keeps the socket open; the server answers `pong`.
      example: ping
    - direction: receive
      name: adoption.decided
      description: An adoption was approved or declined.
      schema:
        type: object
        properties:
          type: { type: string, const: adoption.decided }
          adoption: { $ref: Adoption }
    - direction: receive
      name: pong
      description: The answer to `ping`.
      example: pong
  close:
    1000: The client closed the socket.
    4003: The token lost `adoptions:read`.
---

Frames arrive at most once. After a lost connection, read missed decisions with [[get-adoption|Retrieve an adoption]].
