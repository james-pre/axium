# Axium

> [!WARNING]
> This is a work in progress and under active development!

Axium is a composable platform for building web applications.
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

## Plugins

One of the key features of Axium is its plugin system.
Plugins allow you to extend the functionality of Axium by adding new API endpoints, GUI applications and routes, database models, and more.
Below you'll find descriptions of the official plugins maintained in this repository.

#### @axium/storage

The storage plugin, at a high level, is a cloud storage application.
It is similar to the cloud storage offered by large tech companies.
Unlike widely-used solutions, you can self-host it and always have full control over your data.
This plugin includes the Files app along with significant code infrastructure for managing files.

#### @axium/tasks

Create to-do lists with ease. The tasks plugins adds the Tasks app and APIs to Axium.

#### @axium/notes

Take and manage notes. This plugin adds the Notes app and APIs to Axium.
