create table orders (
  id serial primary key,
  user_id integer not null references users(id),
  total_cents integer not null check (total_cents >= 0),
  placed_at timestamptz not null default now()
);
