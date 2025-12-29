# Contributing to Turbo Parking

## 1. Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- `npm`

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```

### Environment Variables
Create a `.env` file in the root directory (based on `.env.example` if available).
Required keys for Supabase:
- `VITE_SUPABASE_URL`: Your Supabase Project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase Anon Public Key.

## 2. Development Workflow

### Run Development Server
```bash
npm run dev
```
The app will be available at `http://localhost:5173`.

### Building for Production
```bash
npm run build
```
This generates the optimized production build in the `dist/` folder.

### Preview Production Build
```bash
npm run preview
```

### Linting
```bash
npm run lint
```
We use ESLint with specific plugins for React and React Hooks. Please ensure your code passes linting before committing.

## 3. Code Conventions

### Structure
- **Pages**: Use `src/pages/` for full-page views.
- **Components**: Use `src/components/` for reusable widgets.
- **Icons**: Use `lucide-react` for all iconography.

### Styling
- **Tailwind CSS**: Use utility classes for styling.
- Avoid inline styles where possible.

### Date Handling
- Use native specific `new Date()` logic localized for Thailand where appropriate, or stick to ISO strings for database interactions.

## 4. Submitting Changes
1. Create a feature branch (`git checkout -b feature/my-feature`).
2. Commit your changes (`git commit -m "Add my feature"`).
3. Push to the branch (`git push origin feature/my-feature`).
4. Open a Pull Request.
