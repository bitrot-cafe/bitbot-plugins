# bitbot-plugins

Plugins for [bitbot](https://github.com/bitrot-cafe/bitbot), the bitrot.cafe Fluxer bot.

| Plugin | What it does |
|---|---|
| [`addemote`](addemote/) | `!addemote <search>`: search 7TV and add emotes to the server, with compression, splitting for wide emotes, a preview and renaming. |
| [`access-sync`](access-sync/README.md) | Disables and re-enables Nextcloud accounts as people gain or lose the Central guild's access role. |
| [`whoami`](whoami/) | `!whoami [@user]`: identity, bot-admin and staff status, roles and notable permissions. Also the example plugin. |

## Installing

As a bot administrator, in any channel the bot can see:

```
!admin plugins add https://github.com/bitrot-cafe/bitbot-plugins
```

The bot clones this repo, lists the plugins, and loads them after you confirm. Later,
`!admin plugins update` shows new commits and applies them after you confirm. Some plugins need
settings in the bot's `.env`; see each plugin's README.

## Writing a plugin

A plugin is a folder with an `index.ts` that default-exports a factory, `(bot) => ({ name, version, author, commands })`.
Use `whoami/` as a template. A plugin imports **types only** from the bot and from `@fluxerjs/core`. At
runtime everything comes from the `bot` object (`bot.fluxer`, `bot.prefix`, `bot.createLogger`, ...).
The API is the `BotAPI` type in bitbot's `src/plugin.ts`.

- **Dependencies:** give the plugin its own `package.json` with `"type": "module"`. The bot runs
  `npm install --omit=dev` in it when the repo is added or the file changes.
- **Declare the bot API version** the plugin needs, in its `package.json`: `"bitbot": { "api": "1.0" }`
  (1.0 or later, not 2.0). Incompatible plugins aren't loaded, and undeclared ones load with a warning.
  See bitbot's README, "Plugin API versions".
- **Command names must be unique** across every plugin the bot loads. If two plugins claim the same
  command, or share a folder name, the bot disables **both**, so the clash gets noticed.

## Developing

`tsconfig.json` maps `bitbot` (the plugin API types) to `../../src/plugin.ts`. That works when this repo is
checked out inside a bitbot checkout's `plugins/` folder, the normal dev setup. For a standalone checkout,
point that path at your bitbot checkout instead.

```sh
pnpm install          # dev tools + @fluxerjs/core types
pnpm typecheck
pnpm test
```

## License

GPL-3.0, the same as bitbot. See [LICENSE](LICENSE).
