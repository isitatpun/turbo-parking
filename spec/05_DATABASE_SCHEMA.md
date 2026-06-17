# Database Schema

Supabase (PostgreSQL) instance: `rrkuolzbthnmqvnfoani.supabase.co`  
Auth: Supabase Auth — access restricted to `@turbo.co.th` emails.

---

## Tables

### `user_roles`

Mirrors `auth.users` — automatically created via database trigger on sign-up.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK, FK → `auth.users.id` |
| `email` | TEXT | Must be `@turbo.co.th` |
| `role` | TEXT | `"user"` \| `"admin"` \| `"master_admin"` |
| `is_verified` | BOOLEAN | Manual verification flag |
| `created_at` | TIMESTAMP | |

**Rules:**
- Only `master_admin` can promote another user to `master_admin`.
- Users cannot edit their own role or a higher-role user's record.

---

### `central_employee_from_databrick`

Read-only employee directory synced from Databricks.

| Column | Type | Notes |
|---|---|---|
| `employee_id` | TEXT | PK |
| `employee_code` | TEXT | e.g. `"00012345"` |
| `full_name_eng` | TEXT | |
| `division_name` | TEXT | |
| `department_name` | TEXT | |
| `pos_level` | TEXT | Position level |
| `start_date` | DATE | Employment start |
| `resignation_effective_date` | DATE | `NULL` if still active |

---

### `employee_vehicles`

License plates registered per employee (up to 5).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `employee_code` | TEXT | FK → `central_employee_from_databrick.employee_code` |
| `license_plate` | TEXT | |
| `is_active` | BOOLEAN | `false` = soft-deleted |
| `created_at` | TIMESTAMP | |

---

### `employee_privileges`

Optional privilege tags per employee (e.g. VIP, Reserved Parking).

| Column | Type | Notes |
|---|---|---|
| `employee_code` | TEXT | PK, FK → `central_employee_from_databrick.employee_code` |
| `privilege` | TEXT | Free-text tag; nullable |
| `updated_at` | TIMESTAMP | |

Writes use `upsert` — insert on first set, update on subsequent changes.

---

### `bond_holders`

Employees holding company bonds, imported via CSV.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT | PK (imported from CSV) |
| `full_name` | TEXT | |
| `employee_code` | TEXT | FK → `central_employee_from_databrick.employee_code` |
| `tier` | INTEGER | Bond tier level (0, 1, 2, …) |
| `created_at` | TIMESTAMP | |

**Update flow:** wipe-and-replace — bulk delete followed by bulk insert on CSV upload.

---

### `zones`

Parking lot zones.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `lot_code` | TEXT | UNIQUE — e.g. `"A"`, `"B"` |
| `name` | TEXT | Display name |

---

### `parking_spots`

Individual parking spaces within a zone.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `lot_id` | TEXT | e.g. `"A1"`, `"B2"` |
| `lot_code` | TEXT | FK → `zones.lot_code` (implicit) |
| `spot_number` | TEXT | |
| `zone_text` | TEXT | Display name, denormalised from `zones.name` |
| `roof_type` | BOOLEAN | Covered spot |
| `spot_type` | TEXT | `"General Parking"` \| `"Reserved (Paid) Parking"` \| `"EV Charging"` |
| `price` | INTEGER | Monthly price |
| `is_active` | BOOLEAN | `false` = soft-deleted |

---

### `bookings`

Parking spot reservations.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `spot_id` | UUID | FK → `parking_spots.id` |
| `employee_id` | TEXT | FK → `central_employee_from_databrick.employee_id` |
| `booking_start` | DATE | Reservation start |
| `booking_end` | DATE | `"9999-12-31"` = indefinite |
| `license_plate_used` | TEXT | Plate active at booking time |
| `status` | TEXT | `"confirmed"` \| other |
| `is_deleted` | BOOLEAN | Soft delete flag |

**Booking constraints (enforced at application level):**
- No overlapping bookings on the same spot.
- One employee cannot have two overlapping bookings across any spots.
- A warning is shown if `booking_end` is past the employee's `resignation_effective_date`.
- Employee must have at least one active vehicle to book.

---

## Relationships

```
auth.users
    └── user_roles.id

central_employee_from_databrick
    ├── employee_vehicles.employee_code
    ├── employee_privileges.employee_code
    ├── bond_holders.employee_code
    └── bookings.employee_id

zones
    └── parking_spots.lot_code (implicit, by text)

parking_spots
    └── bookings.spot_id
```

---

## Auth & RLS

- Authentication is handled by Supabase Auth; the `user_roles` table extends it with app-specific roles.
- Row-Level Security policies are enabled on the Supabase side; the frontend additionally enforces access via `AuthContext`, `ProtectedRoute`, and `AdminRoute`.
- `master_admin` has full CRUD across all tables; `admin` manages parking/employees; `user` can only manage their own bookings and vehicles.
