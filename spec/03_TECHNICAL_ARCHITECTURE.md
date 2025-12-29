# Technical Architecture

## 1. System Overview
Turbo Parking is a Single Page Application (SPA) built with **React (Vite)** that communicates directly with **Supabase** (BaaS) for database, authentication, and realtime subscriptions.

## 2. Technology Stack
- **Frontend**: React 19, Vite 7
- **Language**: JavaScript (ES6+)
- **Styling**: Tailwind CSS v3
- **State Management**: React Context (`AuthContext`)
- **Backend**: Supabase (PostgreSQL)
- **Deployment Targets**: Static Web Host (e.g., Vercel, Netlify)

## 3. Database Schema (Inferred)

### Core Tables
- **`bookings`**: Stores reservation data.
    - `id` (UUID), `spot_id` (FK), `employee_id` (FK), `booking_start` (Date), `booking_end` (Date), `license_plate_used` (Text), `is_deleted` (Boolean).
- **`parking_spots`**: Inventory of spaces.
    - `id`, `lot_id` (Text), `zone_text` (Text), `price` (Int), `spot_type` (Enum/Text), `is_active` (Boolean).
- **`zones`**: Zone definitions.
    - `id`, `lot_code` (Text, Unique), `name` (Text).
- **`central_employee_from_databrick`**: Master list of employees.
    - `employee_id`, `employee_code`, `full_name_eng`, `pos_level`, `start_date`, `resignation_effective_date`.
- **`employee_vehicles`**: Vehicle mapping.
    - `employee_code` (FK), `license_plate`, `is_active`.
- **`user_roles`**: Application permissions.
    - `id` (FK to Auth.Users), `role` ('admin', 'master_admin', 'user'), `is_verified` (Boolean).
- **`bond_holders`**: Stores tiers for bond holders.
    - `employee_code`, `tier` (Int).
- **`employee_privileges`**: Special overrides.
    - `employee_code`, `privilege` (Text, e.g., 'Free Parking').

## 4. Security Model
- **Authentication**: Managed via `supabase.auth`.
- **Authorization (Row Level Security)**:
    - *Inferred*: Tables likely have RLS policies enabled.
    - **Frontend Gatekeeper**: `ProtectedRoute` and `AdminRoute` components in `App.jsx` enforce UI-level access control based on the `user_roles` table.

## 5. Folder Structure
```
src/
├── components/     # Reusable UI elements (Cards, Modals, Buttons)
├── context/        # Global State (AuthContext)
├── layout/         # UI Wrappers (MainLayout)
├── lib/            # Configuration (Supabase client, Utils)
├── pages/          # View Controllers (Booking, Home, ZoneManagement)
└── App.jsx         # Main Router & Entry Point
```

## 6. Integration Points
- **PDF Generation**: `jspdf` used for generating client-side reports.
- **Excel Export**: `xlsx` for spreadsheet generation.
- **Thai Fonts**: `src/lib/ThaiFont.js` contains base64 font data for PDF support.
