# User Stories & Features

## 1. Feature: Booking Management
**Primary User**: Admin / Master Admin

### User Stories
- **View Availability**: As an Admin, I want to see a list of all parking spots on a specific date, filtering by Zone, Type (Paid/Free/EV), or Status (Occupied/Available), so I can find open spots quickly.
- **Create Booking**: As an Admin, I want to book a spot for a specific employee.
    - *Constraint*: An employee cannot have overlapping bookings.
    - *Constraint*: A spot cannot be double-booked.
    - *Constraint*: Booking cannot extend beyond an employee’s resignation date (Logic: Warning prompt).
- **Indefinite Booking**: As an Admin, I want to create "Indefinite" bookings (auto-set to year 9999) for permanent assignments.
- **Manage License Plates**: As an Admin, I want the system to auto-fill the user's license plate but allow manual override if they are using a different car.

## 2. Feature: Reporting Center (Home Dashboard)
**Primary User**: Admin / Master Admin

### User Stories
- **Financial Overview**: As an Admin, I want to see the total revenue, net revenue (after free parking privileges), and occupancy rates for the selected month.
- **Detailed Reports**: As an Admin, I want detailed tables showing:
    - **Movement**: Beginning balance, new bookings, expired bookings, ending balance.
    - **Tenant Details**: List of all active parkers with their fee status (Paid vs Free).
- **Export Data**: As an Admin, I want to export these reports to **Excel** (for analysis) and **PDF** (for formal reporting).

## 3. Feature: Zone & Spot Management
**Primary User**: Admin

### User Stories
- **Manage Zones**: As an Admin, I want to add, edit, or delete zones (e.g., "Zone A", "VIP Zone").
    - *Constraint*: Zone codes must be unique.
- **Manage Spots** (Implied): As an Admin, I want to configure individual spots within these zones, defining their type (Reserved, Visitor, etc.).

## 4. Feature: Employee & User Management
**Primary User**: Admin

### User Stories
- **Employee Database**: As an Admin, I want to sync or view employee data (Code, Name, Position, Contract Dates).
- **Vehicle Registration**: As an Admin (or User), I want to link license plates to employee profiles so bookings can be accurately tracked.
- **Privilege Management**: As an Admin, I want to assign "Free Parking" privileges to specific employees (e.g., Management level).
- **User Approval**: As a Master Admin, I want to verify new user registrations before they can access the system.

## 5. Feature: Security & Access
**System Requirement**

### features
- **Role-Based Access**:
    - `Master Admin` / `Admin`: Full access to all pages.
    - `User`: Limited access (Home, Profile).
- **Authentication**: Secure login via Email/Password (Supabase Auth).
- **Gatekeeper**: Unverified users must be blocked from logging in until approved.
