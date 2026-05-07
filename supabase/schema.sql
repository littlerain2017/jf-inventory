-- JF Inventory — Supabase Schema
-- Run this in Supabase SQL Editor after creating your project

-- Items (SKU master list)
create table if not exists items (
  id              uuid primary key default gen_random_uuid(),
  item_code       text unique not null,
  description     text not null,
  length_mm       integer not null default 0,
  min_order_strips integer not null default 840,
  strips_per_box  integer not null default 120
);

-- Monthly Sales
create table if not exists monthly_sales (
  id          uuid primary key default gen_random_uuid(),
  item_code   text not null references items(item_code) on delete cascade,
  month_date  date not null,
  qty_sold    integer not null default 0,
  unique(item_code, month_date)
);

-- Stock Positions (current stock + on order per SKU)
create table if not exists stock_positions (
  id                    uuid primary key default gen_random_uuid(),
  item_code             text unique not null references items(item_code) on delete cascade,
  current_stock         integer not null default 0,
  on_order_qty          integer not null default 0,
  on_order_arrival_date date,
  updated_at            timestamptz not null default now()
);

-- Ship Schedules
create table if not exists ship_schedules (
  id                  uuid primary key default gen_random_uuid(),
  vessel_name         text not null default '',
  arrival_date        date not null,
  next_departure_date date not null,
  notes               text not null default '',
  created_at          timestamptz not null default now()
);

-- Setup Parameters
create table if not exists setup_params (
  key   text primary key,
  value numeric not null
);

-- Seed default setup params
insert into setup_params (key, value) values
  ('production_lead_days', 10),
  ('shipping_months', 1),
  ('safety_stable', 1.5),
  ('safety_irregular', 2.0),
  ('safety_high_irregular', 2.5),
  ('cv_threshold_low', 0.5),
  ('cv_threshold_high', 1.0),
  ('order_now_threshold', 1.5),
  ('order_soon_threshold', 2.5)
on conflict (key) do nothing;

-- Enable Realtime on all tables
alter publication supabase_realtime add table items;
alter publication supabase_realtime add table monthly_sales;
alter publication supabase_realtime add table stock_positions;
alter publication supabase_realtime add table ship_schedules;
alter publication supabase_realtime add table setup_params;

-- Row Level Security (open for team use — add auth policies if needed)
alter table items           enable row level security;
alter table monthly_sales   enable row level security;
alter table stock_positions enable row level security;
alter table ship_schedules  enable row level security;
alter table setup_params    enable row level security;

create policy "allow_all_items"       on items           for all using (true) with check (true);
create policy "allow_all_sales"       on monthly_sales   for all using (true) with check (true);
create policy "allow_all_positions"   on stock_positions for all using (true) with check (true);
create policy "allow_all_schedules"   on ship_schedules  for all using (true) with check (true);
create policy "allow_all_setup"       on setup_params    for all using (true) with check (true);
