---
title: Getting started
description: Get a token, then look up a pet over HTTP, GraphQL, and MCP.
---

## Get a token

Create a token in the Harbour dashboard. Send it as a bearer token on every call: HTTP requests, GraphQL queries, and the MCP server's endpoint.

## Look up a pet

The same pet, three ways:

- Over HTTP, [retrieve a pet](../rest/get-pet.md). Its [responses](../rest/get-pet.md#responses) list what comes back.
- Over GraphQL, run the [pet query](../graphql/pet.md).
- From an agent, [call `find_pets`](../mcp/find-pets.md). Its [input](../mcp/find-pets.md#input) takes the same filters as [listing pets](../rest/list-pets.md#params-query).

Each returns the [Pet object](../schemas/Pet.md).

## Calling tools

MCP tools take JSON-RPC `tools/call` requests at `https://mcp.harbour.example/mcp`. A tool that runs and fails returns a result with `isError: true`. A request the server can't accept returns a JSON-RPC error instead. See [Look up a pet](#look-up-a-pet) for the tools to start with.
