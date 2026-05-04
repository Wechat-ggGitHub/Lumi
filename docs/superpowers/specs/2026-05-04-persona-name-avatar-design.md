# Persona Name, Avatar & Markdown Separation

## Problem

Persona name is embedded in `persona.md` as plain text (`你的名称是 Shrew。`). There is no structured name field, no avatar support, and the chat header hardcodes `"Shrew"` and `"S"`. Changing the persona name in settings has no effect on the chat UI or Claude's self-knowledge.

## Design

### Storage

All persona data lives under `~/.shrew/persona/`:

```
~/.shrew/persona/
├── profile.json    # { "name": "钱多多", "avatar": "avatar.png" }
├── persona.md      # Markdown personality/style config
└── avatar.png      # Uploaded avatar image (optional)
```

**profile.json schema:**
```json
{
  "name": "string (required, default: 'Shrew')",
  "avatar": "string | null (filename of uploaded image, null = use first-letter)"
}
```

- `avatar` is the filename only (e.g. `"avatar.png"`), resolved relative to the `persona/` directory
- When `avatar` is null or the file doesn't exist, UI shows a colored circle with the first character of `name`

### Persona Settings Page (`/persona`)

**Top section — Identity:**
- A circular avatar button on the left:
  - If avatar image exists: shows the image clipped to a circle
  - If no avatar: shows first character of name on `bg-brand-soft` background
  - On click: opens native file picker (`dialog.showOpenDialog` via IPC), filtered to `jpg/png/webp`
  - Selected file is copied to `~/.shrew/persona/avatar.png` and `profile.json` updated
  - Long-press or right-click to remove avatar (reset to first-letter)
- A name text input on the right of the avatar

**Below — Personality editor:**
- Full-width markdown textarea for `persona.md` content

**Save action:**
- Writes `profile.json` (name + avatar filename) and `persona.md` (personality content)
- Single save button in bottom action bar

### ChatHeader

- Add `name: string` and `avatarPath: string | null` props
- Avatar: if `avatarPath` is valid, show circular `<img>`, otherwise show first letter of `name` in brand-colored circle
- Name: display `name` prop instead of hardcoded `"Shrew"`
- `chat/page.tsx` fetches persona profile on mount via IPC (`persona:load` returns `{ name, avatar, content }`)

### Claude Context (`executePrompt`)

In `electron/main.ts`:
1. Read `profile.json` → get `name`
2. Read `persona.md` → get personality content
3. Build context: prepend `"你的名称是{name}。"` to the persona.md content before passing to `buildShrewContext`

### IPC Handlers

- `persona:load` → returns `{ name: string, avatar: string | null, content: string }`
- `persona:save` → accepts `{ name: string, content: string }` (writes profile.json + persona.md)
- `persona:avatar` → accepts image file path (copies to persona dir, updates profile.json)
- `persona:avatar:remove` → removes avatar file, sets avatar to null in profile.json

### Migration

On startup, if `~/.shrew/persona/` doesn't exist:
1. Create the directory
2. If old `~/.shrew/persona.md` exists: move to `~/.shrew/persona/persona.md`, strip the `你的名称是X。` line from content, extract name into `profile.json`
3. If old `~/.shrew/persona.md` doesn't exist: create defaults
4. Database migration (`migratePersonaFromDb`) writes to the new directory structure

### Files Changed

| File | Change |
|------|--------|
| `src/lib/persona-file.ts` | Rewrite: new directory structure, profile.json + persona.md, avatar file handling |
| `src/app/persona/page.tsx` | Add avatar button + name input, avatar upload/remove via IPC |
| `electron/main.ts` | Update IPC handlers, update executePrompt to read from new structure |
| `src/components/chat/ChatHeader.tsx` | Add name/avatarPath props, dynamic rendering |
| `src/app/chat/page.tsx` | Load persona profile on mount, pass to ChatHeader |
| `src/types/index.ts` | Update IPC type definitions |

### Default Content

**profile.json:**
```json
{ "name": "Shrew", "avatar": null }
```

**persona.md:**
```markdown
你是一个专业、高效的编程助手。
```
