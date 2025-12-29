# Product Overview

## 1. Vision
Turbo Parking is a comprehensive parking management solution designed to streamline the allocation, booking, and billing of parking spaces within a corporate or managed facility. The system aims to replace manual tracking with a centralized, data-driven dashboard that ensures fair access, automated fee calculation based on employee privileges, and real-time occupancy tracking.

## 2. Goals
- **Centralized Management**: Consolidate disparate data sources (bookings, employee records, vehicle details) into a single platform.
- **Automated Billing**: Automatically calculate parking fees based on diverse rules (daily rates, bond holder tiers, management privileges).
- **Security & Access Control**: Ensure only verified personnel can access the system, with strict separation between administrative capabilities and user functions.
- **Reporting**: Provide real-time financial and operational reports ("Reporting Center") for decision-makers.

## 3. User Personas

### 3.1 Master Admin / Admin
- **Role**: System administrators responsible for configuration and oversight.
- **Capabilities**:
    - Manage parking zones and spots.
    - View and export financial reports (Excel/PDF).
    - Manage employee and user records.
    - Oversee active bookings and handle exceptions.
    - Approve new user registrations.

### 3.2 Employee (End User)
- **Role**: Staff members utilizing the parking facilities.
- **Capabilities**:
    - View personal booking history (implied).
    - Register vehicles.
    - Benefit from automated fee adjustments based on their status (e.g., Management level, Bond Holder).

### 3.3 Bond Holder
- **Role**: A specific subset of employees who hold "Bonds" granting them specific parking privileges.
- **Attributes**:
    - **Tier 1 & 2**: Typically receive free parking.
    - **Tier 3+**: May have different fee structures (logic to be confirmed in deeper analysis).

## 4. Key terminology
- **Lot ID**: Unique identifier for a parking space.
- **Zone**: Grouping of parking spots (e.g., "Zone A", "Visitor Zone").
- **Booking**: A reservation record linking an employee, a vehicle, and a parking spot for a specific time range.
- **Privilege**: Special status assigned to employees (e.g., "Free Parking") that overrides standard billing rules.
