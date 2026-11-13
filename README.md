# bitbot-plugins

Plugins for [bitbot](https://github.com/bitrot-cafe/bitbot), the bitrot.cafe Fluxer bot.

| Plugin | What it does |
|---|---|
| [`addemote`](addemote/) | `!addemote <search>`: search 7TV and add emotes to the server, with compression, splitting for wide emotes, a preview and renaming. |
| [`access-sync`](access-sync/README.md) | Disables and re-enables Nextcloud accounts as people gain or lose the Central guild's access role. |
| [`whoami`](whoami/) | `!whoami [@user]`: identity, bot roles and staff status, roles and notable permissions. Also the example plugin. |

## Installing

As bot root, in any channel the bot can see:

```
!root plugins add https://github.com/bitrot-cafe/bitbot-plugins
```

The bot clones this repo and lists the plugins; **none are enabled** until you opt in to each one:

```
!root plugins enable whoami
```

A plugin with dependencies (addemote) shows them first; ✅ approves and installs them. Later,
`!root plugins update` shows new commits (and changed dependencies) and applies them after you confirm.
Some plugins need settings (`!admin config <plugin>`); see each plugin's README.

## Writing a plugin

A plugin is a folder with a `package.json` that has a `"bitbot"` object (its id, title, API version,
settings, roles) and an `index.ts` that default-exports a factory, `(bot) => ({ commands, setup?, stop? })`.
Use `whoami/` as a template; bitbot's README ("Writing a plugin") has the full format. A plugin imports
**types only** from the bot and from `@fluxerjs/core`. At runtime everything comes from the `bot` object
(`bot.fluxer`, `bot.prefixFor`, `bot.config`, `bot.store`, `bot.log`, ...). For bad input,
`return ctx.usage()` (the 4th argument to `run`): it replies with the command's standard usage line and the
use isn't charged to the cooldown.

- **Dependencies:** list them in the plugin's `package.json` and commit its `package-lock.json`. The bot
  installs only what root approved, with install scripts off (`"allowScripts"` lists the exceptions), and
  refuses git dependencies.
- **Declare the bot API version** the plugin needs: `"bitbot": { "api": "0.4", ... }` (the bot's own
  major.minor; while the bot is on 0.x, plugins may need updating with any release). Incompatible plugins
  aren't loaded, and undeclared ones load with a warning. See bitbot's README, "Plugin API versions".
- **Command names and ids must be unique** across every plugin the bot loads. If two plugins claim the
  same command, or share an id, the bot disables **both**, so the clash gets noticed.
- **Never write into the plugin's own folder:** the bot resets repo clones on every start.

## Developing

Check this repo out **next to** a bitbot checkout (`~/Projects/bitbot` and `~/Projects/bitbot-plugins`):
`tsconfig.json` maps `bitbot` (the plugin API types) to `../bitbot/src/plugin.ts`.

To try a change, push it to `main`, then run `??root plugins update` on the dev bot (Breakbot). Bots
install this repo themselves from GitHub, so don't copy it into a bot's `plugins/repos/` folder. For a
quick local test, copy one plugin to the bot's `plugins/local/` and enable it as `local/<plugin>`
(disable the repo copy first: they share an id).

```sh
# in a container, with both checkouts mounted:
#   podman run --rm -v ~/Projects:/p:z -w /p/bitbot-plugins <bitbot dev image> sh -c 'pnpm install && pnpm typecheck && pnpm test'
pnpm install          # dev tools + @fluxerjs/core types
pnpm typecheck
pnpm test
```

## License

GPL-3.0, the same as bitbot. See [LICENSE](LICENSE).
