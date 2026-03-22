# MHG Store

A modern point-of-sale (POS) and inventory management system built with React, TypeScript, and Supabase.

## Features

- **Authentication** - Secure login and registration with session persistence
- **Role-Based Access Control** - Three admin levels (low, med, high) with granular permissions
- **Dashboard Overview** - Real-time daily stats including sales, revenue, and profit
- **Product Management** - Create, update, and delete products with categories and custom attributes
- **Category Management** - Organize products with categories and dynamic attributes (text, number, boolean, enum)
- **Point of Sale** - Interactive cart system with quantity management, price overrides, and discount support
- **Sales History** - Track all transactions with date filtering and admin attribution
- **Refund System** - Full and partial refunds with automatic stock restoration
- **Real-Time Updates** - Live data synchronization via Supabase Realtime subscriptions
- **Responsive Design** - Mobile-first UI built with Tailwind CSS and shadcn/ui components

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **UI Components:** shadcn/ui, Radix UI, Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Realtime)
- **State Management:** React Query (TanStack Query)
- **Routing:** React Router DOM v6
- **Forms:** React Hook Form with Zod validation
- **Charts:** Recharts
- **Deployment:** Vercel

## Getting Started

### Prerequisites

- Node.js 18+ or Bun
- Supabase account and project

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd storefront-hub

# Install dependencies
npm install
# or
bun install

# Set up environment variables
cp .env.example .env
```

### Environment Variables

Create a `.env` file with your Supabase credentials:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Development

```bash
# Start the development server
npm run dev
# or
bun run dev
```

The app will be available at `http://localhost:8080`

### Build

```bash
# Production build
npm run build

# Development build
npm run build:dev

# Preview the build
npm run preview
```

### Testing

```bash
# Run tests
npm run test

# Run tests in watch mode
npm run test:watch
```

### Linting

```bash
npm run lint
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui base components
│   ├── CartDetailModal.tsx
│   ├── DashboardLayout.tsx
│   ├── ProductDetailModal.tsx
│   └── ProtectedRoute.tsx
├── hooks/              # Custom React hooks
│   ├── useAuth.tsx     # Authentication context
│   ├── useAdminCheck.ts
│   └── useRealtimeSubscription.ts
├── integrations/       # External service integrations
│   └── supabase/       # Supabase client and types
├── lib/                # Utility functions
│   ├── api.ts          # API helpers
│   ├── filters.ts      # Data filtering/sorting
│   ├── formatters.ts   # Currency, date formatting
│   └── permissions.ts  # Role-based permission checks
├── pages/              # Route components
│   ├── dashboard/      # Dashboard pages
│   │   ├── Overview.tsx
│   │   ├── Products.tsx
│   │   ├── Categories.tsx
│   │   ├── NewSale.tsx
│   │   ├── SalesHistory.tsx
│   │   └── Profiles.tsx
│   ├── Login.tsx
│   └── Register.tsx
├── types/              # TypeScript type definitions
└── App.tsx             # Main app with routing
supabase/
├── config.toml         # Supabase configuration
└── migrations/         # Database migrations
```

## Admin Roles & Permissions

| Feature                  | Low Level | Med Level | High Level |
| ------------------------ | --------- | --------- | ---------- |
| View Dashboard           | ✅        | ✅        | ✅         |
| View Own Sales           | ✅        | ✅        | ✅         |
| View Cost & Profit       | ❌        | ✅        | ✅         |
| Manage Products          | ❌        | ✅        | ✅         |
| Manage Categories        | ❌        | ✅        | ✅         |
| View All Sales History   | ❌        | ✅        | ✅         |
| Process Refunds          | ❌        | ✅        | ✅         |
| Manage User Profiles     | ❌        | ✅        | ✅         |
| Full Admin Access        | ❌        | ❌        | ✅         |

## Deployment

The app is configured for deployment on Vercel with SPA routing support via `vercel.json`.

## License

Private - All rights reserved.
