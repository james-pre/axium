# Axium

> [!WARNING]
> This is a work in progress and under active development!

Axium is a platform for anything.
Building a self-hosted productively app?
The next big tech start-up?
Axium provides a foundation for you to work off of.

## Architecture

Axium is split up into three main components:

#### @axium/core

This includes schemas and types shared between the client and server.
It also includes cross-platform functions that can be used in both environments.

#### @axium/server

The server is the primary package for working with Axium. The package includes:

- Database functions and schemas
- The `axium` CLI for managing the server
- Built-in pages and API endpoints
- Authentication and authorization
- Routing
- Plugin APIs
- Configuration handling

#### @axium/client

The client is a collection of functions used to interact with the server's HTTP API.
At the moment, this is only used browser-side on pages served by the server,
however this can easily be used in other environments provided the Webauthn API is supported.

## Getting Started

To get started with Axium

- Install Node.js v22+
- Install postgreSQL
- `npm install -g @axium/server`
- `sudo axium init`
