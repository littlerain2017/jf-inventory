# Script Adaptation Skill

Adapt an existing SQL migration script, shell script, or data script for use in this jf-inventory project.

## What this skill does

Given a script (SQL, shell, or otherwise), this skill will:

1. Analyze the script's intent and structure
2. Map it to the jf-inventory schema (items, monthly_sales, stock_positions, ship_schedules, setup_params)
3. Rewrite or annotate the script to be compatible with the project's Supabase setup
4. Flag any incompatibilities or required manual steps

## Usage

Paste the script you want to adapt below (or describe what it should do), and Claude will produce an adapted version ready for the Supabase SQL Editor.

## Schema reference

- **items** — SKU master list (item_code, description, length_mm, min_order_strips, strips_per_box)
- **monthly_sales** — monthly qty sold per SKU (item_code, month_date, qty_sold)
- **stock_positions** — current stock & on-order per SKU (item_code, current_stock, on_order_qty, on_order_arrival_date)
- **ship_schedules** — vessel arrival/departure schedule (vessel_name, arrival_date, next_departure_date, notes)
- **setup_params** — key/value config parameters (key, value)

## Instructions for Claude

When this skill is invoked:

1. Ask the user to paste the script or describe what it should do if they haven't already.
2. Read `supabase/schema.sql` to confirm the current schema.
3. Produce an adapted script with:
   - Correct table and column names matching the schema
   - Supabase-compatible SQL syntax (PostgreSQL)
   - `ON CONFLICT` clauses where upserts are needed
   - RLS (Row Level Security) notes if the operation touches auth
4. Explain what changed and why.
5. Warn about any data that must be prepared manually before running.
