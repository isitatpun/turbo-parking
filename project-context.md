# Project Context: Turbo Parking

## Overview
Turbo Parking is a web-based parking management system designed to handle bookings, car park zones, employees, and user administration. It features a role-based access control system ensuring that admins and standard users have appropriate access permissions.

## Technology Stack

### Core Frameworks & Libraries
- **Frontend Framework**: [React](https://react.dev/) (v19)
- **Build Tool**: [Vite](https://vitejs.dev/) (v7)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) (v3)
- **Routing**: [React Router](https://reactrouter.com/) (v7)
- **State Management**: React Context API (AuthContext)

### Backend & Data
- **Database/Auth**: [Supabase](https://supabase.com/) (using `@supabase/supabase-js`)

### Utilities
- **PDF Generation**: `jspdf`, `jspdf-autotable`
- **Spreadsheet/CSV**: `xlsx`, `papaparse`, `file-saver`
- **Date Handling**: Native JS / Intl (implied, no moment/date-fns seen in package.json)
- **Icons**: `lucide-react`

## Project Capabilities & Features

### 1. Authentication & Security
- **Login System**: Dedicated login page (`/login`).
- **Role-Based Access Control (RBAC)**:
    - **Protected Routes**: Ensures users are authenticated before accessing the app.
    - **Admin Routes**: Restricts specific pages to `admin` or `master_admin` roles only.
- **Context**: `AuthContext` manages user sessions and loading states.

### 2. General User Features
- **Home Dashboard**: General landing view (`/`).
- **Booking Interface**: Allows users to manage or view bookings (`/booking`).

### 3. Administrative Features (Admin Only)
- **Booking Management**: Comprehensive list of bookings (`/booking-list`).
- **Car Park Management**: Configuration of car parks (`/car-park`).
- **Zone Management**: Management of parking zones (`/zones`).
- **Personnel Management**:
    - **Employees**: Manage employee records (`/employees`).
    - **Bond Holders**: Manage bond holder records (`/bond-holder`).
- **User Administration**: System user management (`/users`).

## Development & Build

### Project Structure (Key Directories)
- `src/pages`: Contains all page-level components (views).
- `src/components`: Reusable UI components.
- `src/context`: React Context definitions (e.g., Auth).
- `src/layout`: Layout wrappers (e.g., `MainLayout`).
- `src/lib`: Likely contains Supabase client initialization and utility functions.

### Scripts
- **Install Dependencies**: `npm install`
- **Run Development Server**: `npm run dev`
- **Build for Production**: `npm run build`
    - Output directory: `dist/`
- **Preview Production Build**: `npm run preview`
- **Lint Code**: `npm run lint`

## Recent Build Status
- **Last Build**: Successful (`npm run build`)
- **Output**: Optimized static assets in `dist/` folder.
