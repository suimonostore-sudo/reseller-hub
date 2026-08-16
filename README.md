# Reseller Hub MVP

A starting point for a multi-marketplace reseller inventory, sales, SKU and fulfillment system.

## Architecture

- Next.js + React: web application
- Prisma + SQLite: MVP database
- API routes: inventory and sales ingestion
- Future integrations: eBay API, Gmail API, Poshmark/Mercari/Depop email parsers
- Future fulfillment: PDF label ingestion, barcode-preserving 4x6 conversion, 1x4 pick labels

## Database model

BulkBuy
  └── InventoryItem
        ├── Listing (one or more marketplace listings)
        └── SaleLine
                └── Sale
                      └── ShippingLabel

## Run locally

Requirements: Node.js 20+

1. `npm install`
2. Copy `.env.example` to `.env`
3. `npm run db:push`
4. `npm run db:seed`
5. `npm run dev`
6. Open http://localhost:3000

## Next build steps

1. Inventory UI: create/edit items, bulk buys, COGS and unlisted quantities.
2. Listing mapping UI and matching engine.
3. Gmail OAuth and email ingestion.
4. eBay OAuth and inventory synchronization.
5. Sales normalization across all platforms.
6. Pick-list generation and 1x4 label printing.
7. Shipping-label/PDF processing.
8. Profit and inventory reporting.
9. Authentication and multi-user support if the app becomes a product.


## Quick Add Inventory

Open `/inventory/bulk-entry` to add multiple inventory records in a spreadsheet-style grid, generate missing SKUs, assign a bulk purchase to rows, and save all rows in one operation.

## Sales + Matching

Open `/sales` to record sales, automatically match by marketplace listing ID or exact title, manually match anything unresolved, decrement inventory on match, and see an MVP profit estimate.


## Pick & Pack

`/pick-pack` is the SKU-first fulfillment queue. Select matched orders, print 1x4 pick labels, mark orders picked/packed/shipped, and use the buyer/item fallback for orders without a SKU match.

## Gmail Ingestion v8

`/gmail` is the read-only Gmail ingestion control panel. It records sync runs, deduplicates imported messages by Gmail message ID, detects eBay/Poshmark/Mercari/Depop emails, and provides a normalized parsing layer. Live Gmail API transport is gated behind Google OAuth environment variables and is not enabled until credentials are supplied.


## Automation Engine

v10 adds idempotent sale ingestion, match confidence/method tracking, exact listing-ID matching, title similarity fallback, inventory decrement on first ingestion only, and `/automation` to simulate marketplace sales before Gmail is connected.


## v11 Gmail + Hosting Readiness
- Google OAuth read-only Gmail connection with CSRF state check.
- AES-256-GCM encrypted token storage.
- Gmail sync, email deduplication, marketplace detection and sale ingestion.
- Scheduled `/api/cron/gmail` endpoint and Vercel cron definition for every 20 minutes.
- `.env.example` documents the deployment secrets required.
- Gmail UI shows configuration/connection state and supports manual Sync Now.

### User action required to go live
The app is code-complete up to the external-account/hosting boundary. A hosting account/domain and Google OAuth credentials must be configured before live Gmail authorization can work.
