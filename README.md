# Reseller Hub MVP

A starting point for a multi-marketplace reseller inventory, sales, SKU and fulfillment system.

## Architecture

- Next.js + React: web application
- Prisma + PostgreSQL: hosted production database
- API routes: inventory and sales ingestion
- Integrations in progress: eBay API, Gmail API, Poshmark/Mercari/Depop email parsers
- Fulfillment in progress: PDF label ingestion, barcode-preserving 4x6 conversion, 1x4 pick labels

## Database model

BulkBuy
  └── InventoryItem
        ├── Listing (one or more marketplace listings)
        └── SaleLine
                └── Sale
                      └── ShippingLabel

## Deployment

This repository is connected to Vercel for hosted deployment. Production data is stored in PostgreSQL.

## Quick Add Inventory

Open `/inventory/bulk-entry` to add multiple inventory records in a spreadsheet-style grid, generate missing SKUs, assign a bulk purchase to rows, and save all rows in one operation.

## Sales + Matching

Open `/sales` to record sales, automatically match by marketplace listing ID or exact title, manually match anything unresolved, decrement inventory on match, and see an MVP profit estimate.

## Pick & Pack

`/pick-pack` is the SKU-first fulfillment queue. Select matched orders, print 1x4 pick labels, mark orders picked/packed/shipped, and use the buyer/item fallback for orders without a SKU match.

## Gmail Ingestion

`/gmail` is the read-only Gmail ingestion control panel. It records sync runs, deduplicates imported messages by Gmail message ID, detects eBay/Poshmark/Mercari/Depop emails, and provides a normalized parsing layer. Live Gmail API transport is enabled after Google OAuth environment variables are supplied.

## Automation Engine

Sale ingestion is idempotent, tracks match confidence/method, tries exact listing-ID matching first, then title matching, decrements inventory on first ingestion only, and routes unresolved sales for manual matching.

## Hosting Readiness

- Google OAuth read-only Gmail connection with CSRF state check
- AES-256-GCM encrypted token storage
- Gmail sync and marketplace sale ingestion
- Manual Gmail sync on Vercel Hobby; frequent automated scheduling can be added separately
- Persistent PostgreSQL production database

OAuth production credentials refreshed.
OAuth client ID whitespace cleaned for production.
