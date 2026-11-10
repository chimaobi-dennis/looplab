# LoopLab — expiry & renewal tracker

Tracks the things that expire rarely enough to forget — passport, licence, insurance, car service, warranties, subscriptions — and reminds you with a lead time that suits each one.

Everything is stored in the browser on your device (IndexedDB). There is no server and no account.

## Run it

```bash
npm install
npm run dev      # development server
npm test         # unit tests for the core logic
npm run build    # typecheck + production build into dist/
```

## Layout

- `src/core/` — pure logic with no browser dependencies: dates, category presets, status and timeline buckets, reminders, renewal, form parsing, backup format. Covered by `core.test.ts`.
- `src/storage/db.ts` — IndexedDB persistence for items and photos.
- `src/ui/` — React screens and hooks.

## Known limits

- Notifications fire only while the app is open or installed and running; background delivery would need a push server.
- Backups export item data only, not photos.
- Reading the expiry date off a photo is not built yet; dates are typed in.
