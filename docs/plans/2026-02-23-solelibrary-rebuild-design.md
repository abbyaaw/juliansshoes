# SoleLibrary Rebuild Design

## Overview
Shoe collection manager that identifies shoes from photos using Gemini AI, researches marketplace prices with source links, and tracks collection value.

## Architecture
- **Monorepo**: client/, server/, shared/
- **Server**: Express + better-sqlite3, port 5150
- **Client**: React + Vite + Tailwind CSS, port 5173
- **Vision**: Gemini 3 Flash Preview for shoe identification
- **Pricing**: Gemini 3 Pro Preview with Google Search grounding for marketplace sources

## Data Model

### shoes table
- id, image_path, image_filename
- type (Boxed Shoes / Boxless Shoes)
- location (Closet, Office, Storage Box #1, etc.)
- sub_location (Back, Front, Kitchen Side, etc. — nullable)
- brand, model, colorway, size, year
- shoe_condition (New/DS, Excellent, Good, Fair)
- box_condition (Pristine, Damaged, Missing)
- my_price (user-selected selling price)
- identified (boolean)

### price_sources table
- id, shoe_id (FK)
- source_name (StockX, GOAT, eBay, etc.)
- url (direct link to listing)
- price
- shoe_condition, box_condition
- created_at

## Folder Parsing
| Folder | Type | Location | Sub-location |
|---|---|---|---|
| Boxed Shoes \| Closet \| Back | Boxed Shoes | Closet | Back |
| Boxless Shoes \| Storage Box #1 | Boxless Shoes | Storage Box #1 | null |

## Pricing
- Full price matrix: shoe condition × box condition
- Each cell backed by marketplace source URLs
- User picks "My Price" by clicking a source or typing custom value
- Export includes full matrix + sources

## Pages
- Collection (grid + stats dashboard + filters)
- Shoe Detail (photo + ID + price matrix + editable conditions)
- Import (scan folders + vision progress)
- Settings (API key + bulk operations)
- Export (spreadsheet with all data)
