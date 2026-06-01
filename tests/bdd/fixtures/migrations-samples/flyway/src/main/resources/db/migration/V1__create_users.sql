create table users (
  id serial primary key,
  email text not null unique,
  created_at timestamptz not null default now()
);
