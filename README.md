# bitbot-plugins

Plugins for [bitbot](https://github.com/bitrot-cafe/bitbot), the bitrot.cafe Fluxer bot.

| Plugin | What it does |
|---|---|
| [`addemote`](addemote/) | `!addemote <search>`: search 7TV and add emotes to the server, with compression, splitting for wide emotes, a preview and renaming. |
| [`access-sync`](access-sync/README.md) | Disables and re-enables Nextcloud accounts as people gain or lose the Central guild's access role. |
| [`whoami`](whoami/) | `!whoami [@user]`: identity, bot-admin and staff status, roles and notable permissions. Also the example plugin. |

## Installing

As bot root, in any channel the bot can see:

```
!root plugins add https://github.com/bitrot-cafe/bitbot-plugins
```

The bot clones this repo and lists the plugins; **none are enabled** until you opt in to each one:

```
!root plugins enable whoami
``` Later,
`!root plugins update` shows new commits and applies them after you confirm. Some plugins need
settings in the bot's `.env`; see each plugin's README.

## Writing a plugin

A plugin is a folder with an `index.ts` that default-exports a factory, `(bot) => ({ name, version, author, commands })`.
Use `whoami/` as a template. A plugin imports **types only** from the bot and from `@fluxerjs/core`. At
runtime everything comes from the `bot` object (`bot.fluxer`, `bot.prefixFor`, `bot.config`, `bot.store`, `bot.log`, ...).
For bad input, `return ctx.usage()` (the 4th argument to `run`): it replies with the command's standard
usage line and the use isn't charged to the cooldown.
The API is the `BotAPI` type in bitbot's `src/plugin.ts`.

- **Dependencies:** give the plugin its own `package.json` with `"type": "module"`. The bot runs
  `npm install --omit=dev` in it when the repo is added or the file changes.
- **Declare the bot API version** the plugin needs, in its `package.json`: `"bitbot": { "api": "0.3" }`
  (the bot's own major.minor; while the bot is on 0.x, plugins may need updating with any release). Incompatible plugins aren't loaded, and undeclared ones load with a warning.
  See bitbot's README, "Plugin API versions".
- **Command names must be unique** across every plugin the bot loads. If two plugins claim the same
  command, or share a folder name, the bot disables **both**, so the clash gets noticed.

## Developing

Check this repo out **next to** a bitbot checkout (`~/Projects/bitbot` and `~/Projects/bitbot-plugins`):
`tsconfig.json` maps `bitbot` (the plugin API types) to `../bitbot/src/plugin.ts`.

To try a change, push it to `main`, then run `??root plugins update` on the dev bot (Breakbot). Bots
install this repo themselves from GitHub, so don't copy it into a bot's `plugins/` folder.

```sh
# in a container, with both checkouts mounted:
#   podman run --rm -v ~/Projects:/p:z -w /p/bitbot-plugins <bitbot dev image> sh -c 'pnpm install && pnpm typecheck && pnpm test'
pnpm install          # dev tools + @fluxerjs/core types
pnpm typecheck
pnpm test
```

## License

GPL-3.0, the same as bitbot. See [LICENSE](LICENSE).
