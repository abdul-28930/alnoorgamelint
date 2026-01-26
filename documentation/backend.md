# Gaming-Centre • Backend Specification (v0.1)

_Stack_: **Python 3.11**, **FastAPI**, **Supabase Postgres**, **asyncpg**, **supabase_py**, **JWT** (supabase-issued), **Fly.io** deploy.

> This doc is the contract for implementing the backend.  Front-end and QA teams should treat all shapes/paths as canonical until version bump.

---

## 1  Domain Overview
| Entity      | Description                                          |
|-------------|------------------------------------------------------|
| **User**    | Registered customer (supabase auth user).            |
| **Staff**   | Elevated user; can view all bookings, edit stations. |
| **Admin**   | Full privileges; manage staff/users/stats.          |
| **Station** | A physical PS5 or PC rig that can be booked.         |
| **Booking** | Reservation block (`start_at`, `end_at`, status).    |
| **Stats**   | Materialised views for charts (bookings / revenue).  |

_Role hierarchy_: `admin ⊃ staff ⊃ user`.

---

## 2  Supabase Schema (Postgres)
```sql
-- Users handled by Supabase Auth (id UUID primary key)

create table stations (
    id          uuid primary key default gen_random_uuid(),
    name        text not null,
    type        text check (type in ('PS5','PC')),
    hourly_rate numeric(8,2) not null,
    active      boolean default true,
    created_at  timestamptz default now()
);

create table bookings (
    id           uuid primary key default gen_random_uuid(),
    user_id      uuid references auth.users not null,
    station_id   uuid references stations on delete cascade,
    start_at     timestamptz not null,
    end_at       timestamptz not null,
    paid         boolean default false,
    status       text default 'CONFIRMED' check (status in ('CONFIRMED','CANCELLED','EXPIRED')),
    created_at   timestamptz default now(),
    constraint no_overlap_excl EXCLUDE USING gist (
        station_id WITH =,
        tstzrange(start_at, end_at) WITH &&
    )
);

-- Roles & Policies
alter table stations enable row level security;
alter table bookings  enable row level security;

-- Users can manipulate their own bookings
create policy "User can manage own bookings" on bookings
  for all using ( auth.uid() = user_id );

-- Staff/Admin roles (set via Postgres roles assigned by Supabase)
create policy "Staff & Admin view all" on bookings
  for select using ( auth.role() in ('staff','admin') );

-- Materialised view for stats (example)
create materialized view mv_booking_stats_daily as
select date_trunc('day', start_at AT TIME ZONE 'Asia/Kolkata') as day,
       count(*)                             as total,
       sum(paid::int)                       as paid_count,
       sum(extract(epoch from end_at - start_at)/3600 * s.hourly_rate) as revenue
from bookings b
join stations s on s.id = b.station_id
where status = 'CONFIRMED'
group by 1
order by 1 desc;
```

---

## 3  Authentication & Authorization
1. **Registration / Login handled by Supabase Auth** (email + password hashed server-side by Supabase).  FastAPI trusts incoming `Authorization: Bearer <jwt>` tokens issued by Supabase.
2. **Password reset / email confirmation** flows remain in Supabase.
3. **Admin & Staff assignment** – designated by attaching Postgres roles (`staff`, `admin`) via Supabase dashboard or SQL.
4. **FastAPI security dependency** (`get_current_user`) will:
   - Decode JWT via [`python-jose`](https://python-jose.readthedocs.io/).
   - Verify `iss`, `aud`, expiry.
   - Expose `UserContext` (`id`, `role`, `email`).

---

## 4  API Surface (FastAPI)
> All endpoints prefixed with `/api/v1` and return JSON (RFC 8259).  Dates are ISO-8601 (UTC) unless noted.

| Method | Path                          | Auth   | Description                                           |
|--------|-------------------------------|--------|-------------------------------------------------------|
| POST   | `/auth/register`              | none   | (optional) proxy to Supabase signUp for unified docs  |
| POST   | `/auth/login`                 | none   | "                                                     |
| GET    | `/profile`                    | user   | Get current user profile & role                       |
| PUT    | `/profile`                    | user   | Update display name, phone, avatar                    |
| GET    | `/stations`                   | public | List active stations                                  |
| POST   | `/bookings`                   | user   | Create booking (body: `station_id`, `start`, `end`)   |
| GET    | `/bookings`                   | user   | List own upcoming / past bookings                     |
| DELETE | `/bookings/{booking_id}`      | user   | Cancel own booking (`status → CANCELLED`)             |
| ---    | **Staff/Admin scope**         |        |                                                       |
| GET    | `/admin/bookings`             | staff  | List all bookings (filters, pagination)               |
| GET    | `/admin/bookings/calendar`    | staff  | Calendar JSON grouped per station/day                 |
| POST   | `/admin/stations`             | staff  | CRUD stations (create)                                |
| PUT    | `/admin/stations/{station}`   | staff  | edit                                                  |
| DELETE | `/admin/stations/{station}`   | staff  | soft-delete                                           |
| GET    | `/admin/users`                | admin  | List users & roles                                    |
| PUT    | `/admin/users/{uid}/role`     | admin  | Promote/demote user                                   |
| GET    | `/admin/stats/summary`        | staff  | KPIs: total bookings, revenue, occupancy              |
| GET    | `/admin/stats/daily`          | staff  | Chart series from `mv_booking_stats_daily`            |

_All staff/admin endpoints share `depends(get_current_user(role_required=['staff','admin']))`._

---

## 5  Implementation Notes
- **Concurrency lock**: booking creation uses Postgres advisory lock or transaction isolation _serializable_ to avoid race conditions.
- **Time zone**: convert incoming IST local times → UTC before insert; convert UTC → IST for outward JSON.
- **Pagination**: cursor-based via `?after=<booking_id>&limit=20`.
- **Validation**: Pydantic models with strict types; custom validators for time slots.
- **Error model**: `{ "detail": "string", "code": "ERR_CODE" }`.

---

## 6  Packages & Tooling
```toml
# pyproject.toml (excerpt)
[tool.poetry.dependencies]
fastapi = "^0.111"
uvicorn = { extras=["standard"], version="^0.29" }
supabase-py = "^2.3"
python-jose = { extras=["cryptography"], version="^3.3" }
asyncpg = "^0.29"
pydantic = "^2.7"
python-dateutil = "^2.9"
zonedata = "^0.1"  # thin wrapper for zoneinfo if needed

[tool.poetry.dev-dependencies]
pytest = "^8.0"
pytest-asyncio = "^0.23"
ruff = "*"
```

---

## 7  Deployment
1. **Dockerfile** (python 3.11-slim) with health check at `/healthz`.
2. Fly.io `fly.toml` sets `PRIMARY_REGION = "sin"`, mounts no volumes (stateless).
3. Env vars injected: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`.

---

## 8  Testing Matrix
| Layer        | Tool          | Coverage                                      |
|--------------|--------------|-----------------------------------------------|
| Unit         | Pytest       | Validators, utils, guarding dependencies       |
| Integration  | Pytest + SC  | Against local Supabase CLI; booking overlap    |
| E2E (API)    | Dredd / pr.  | Contract tests vs OpenAPI spec                 |

---

## 9  OpenAPI & Docs
FastAPI auto-generates `/docs` & `/redoc` in dev; commit the json to `/openapi.json` for client code-gen.

---

## 10  Future-Phase Placeholders
- Stripe web-hooks (`/webhooks/stripe`) to set `paid=true`.
- Supabase Realtime broadcasting on new bookings to Next.js via socket.
- Admin analytics: additional MV for hourly occupancy.

---

**Author**: Design Team · _last updated_ {{DATE}} 