# MHG Store - Retail Management System

## Executive Summary

**MHG Store** is a modern, full-featured retail management system and Point of Sale (POS) application designed for small to medium-sized retail businesses. Built with a focus on simplicity, real-time data, and mobile responsiveness, it provides store administrators with complete control over inventory, sales processing, customer management, and business analytics.

The application combines a sleek React frontend with Supabase's powerful backend-as-a-service, offering real-time inventory tracking, dynamic product categorization, comprehensive sales history with refund capabilities, and role-based access control.

---

## Architecture Overview

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI framework with type safety |
| **Build Tool** | Vite | Fast development and optimized builds |
| **Styling** | Tailwind CSS | Utility-first CSS framework |
| **UI Components** | shadcn/ui + Radix UI | 50+ accessible, customizable components |
| **State Management** | TanStack Query | Server state caching and synchronization |
| **Backend** | Supabase | PostgreSQL database, Auth, Realtime |
| **Routing** | React Router v6 | Client-side navigation |
| **Testing** | Vitest + Testing Library | Unit and integration testing |
| **Icons** | Lucide React | Consistent iconography |

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Browser)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  React UI   │  │ React Query │  │  React Router   │ │
│  │  Components │  │   Cache     │  │    Navigation   │ │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────┘ │
└─────────┼────────────────┼─────────────────────────────┘
          │                │
          ▼                ▼
┌─────────────────────────────────────────────────────────┐
│              Supabase Backend (BaaS)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │  PostgreSQL │  │    Auth     │  │   Realtime API  │ │
│  │   Database  │  │  (JWT/RBAC) │  │  (WebSocket)    │ │
│  └─────────────┘  └─────────────┘  └─────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Core Features

### 1. Authentication & Role-Based Access Control

**Features:**
- Email/password authentication via Supabase Auth
- "Remember Me" functionality with custom storage adapter (switches between localStorage/sessionStorage)
- Role-based access: Admin vs Customer
- Protected routes with automatic redirects
- Admin-only dashboard access

**Implementation Highlights:**
- Custom `rememberMeStorage` adapter in `src/integrations/supabase/client.ts`
- `useAuth` hook provides global auth state
- `ProtectedRoute` component guards admin-only routes
- `is_admin` PostgreSQL function for server-side role verification

### 2. Dashboard Analytics (Overview)

**Real-time KPIs Displayed:**
- Total Products in inventory
- Total Categories
- Total Registered Customers
- Sales Today (completed orders count)
- Revenue Today (total sales amount)
- Profit Today (calculated from unit_price - cost)

**Additional Features:**
- Recent sales list with line item details
- Low stock alerts (products with ≤5 units)
- Visual indicators for refund status (fully/partially refunded items)
- Click-through navigation to detailed views

### 3. Product Management

**Full CRUD Operations:**
- Create, read, update, delete products
- Product attributes: name, price, cost, stock, category
- Dynamic category-based custom attributes

**Advanced Features:**
- **Dynamic Attributes System**: Categories can define custom attributes (text, number, boolean, enum) that apply to all products in that category
- Stock level badges (In Stock, Low Stock, Out of Stock)
- Product detail modal with full information
- Search and filter by category
- Sort by name, price, stock, creation date

**Category Attributes Types:**
- `text` - Free text input
- `number` - Numeric input with optional unit (e.g., "kg", "cm")
- `boolean` - Yes/No checkbox
- `enum` - Dropdown with predefined options

### 4. Category Management

**Features:**
- Create and manage product categories
- Define custom attributes per category
- Attribute configuration: label, type, unit, options, required/optional
- Product count per category
- Delete protection (categories with products cannot be deleted)

### 5. Sales Processing (New Sale)

**POS Interface:**
- Product grid with search, filter, and sort
- Shopping cart with slide-over panel
- Quantity adjustment with stock validation
- Price override capability (discounts or markups)
- Customer selection (registered or walk-in)
- Optional notes per sale

**Sales Workflow:**
1. Select products from grid
2. Adjust quantities (validated against stock)
3. Modify prices if needed (shows discount/premium indicators)
4. Select customer or use walk-in
5. Add optional notes
6. Process sale (creates pending cart → adds line items → completes cart)

**Technical Implementation:**
- Two-phase transaction: pending → completed
- Database triggers handle stock deduction on completion
- Automatic rollback on stock constraint violations

### 6. Sales History

**Features:**
- Complete transaction history with filtering
- Date range filter
- Hide/show fully refunded sales toggle
- Search by product name, customer, notes, or admin
- Visual indicators for refund status

**Refund System:**
- Full or partial refunds supported
- Automatic stock restoration
- Refund reason tracking
- Preserved transaction records for audit

### 7. User & Profile Management

**Admin Capabilities:**
- View all user profiles
- Edit user information (name, email, phone)
- Promote/demote users to/from admin role
- Delete user accounts (cascades to auth)

**Role Visualization:**
- Admin badge with shield icon
- Customer badge with user icon
- Regular user badge for non-customer users

---

## Database Schema

### Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `profiles` | User profile data (name, email, phone) | 1:1 with `auth.users` |
| `admins` | Admin role assignments | 1:1 with `profiles` |
| `customers` | Customer role assignments | 1:1 with `profiles` |
| `categories` | Product categories | - |
| `category_attributes` | Dynamic attribute definitions | N:1 with `categories` |
| `products` | Product inventory | N:1 with `categories` |
| `carts` | Sales transactions | N:1 with `customers`, `admins` |
| `sold_products` | Line items (immutable record) | N:1 with `carts`, `products` |
| `refunds` | Refund transactions | N:1 with `carts`, `admins` |
| `refund_items` | Refunded line items | N:1 with `refunds`, `sold_products` |

### Database Views

| View | Purpose |
|------|---------|
| `cart_summary` | Aggregated cart data with customer/admin names, refund status |
| `cart_line_items` | Detailed line items with product info, refund quantities |
| `cart_refund_status` | Refund calculations per cart |
| `refund_detail` | Complete refund information with product details |

### Key Functions

```sql
is_admin(_user_id uuid) -> boolean
```
Verifies if a user has admin privileges (used for RBAC).

---

## User Workflows

### Admin Login Flow
1. Navigate to `/login`
2. Enter credentials with optional "Remember Me"
3. Authenticated via Supabase Auth
4. Redirected to `/dashboard` (admin-only route)
5. Sidebar navigation provides access to all modules

### Processing a Sale
1. Click "New Sale" in sidebar
2. Search/filter products or browse by category
3. Click product to view details or "Add" to cart
4. Review cart (adjust quantities, modify prices)
5. Select customer or use walk-in
6. Add optional notes
7. Click "Process Sale"
8. System validates stock and completes transaction

### Managing Inventory
1. Navigate to "Products" or "Categories"
2. Add new products with category-specific attributes
3. Monitor low stock alerts on dashboard
4. Update stock levels as needed

### Handling Refunds
1. Go to "Sales History"
2. Locate the transaction to refund
3. Click "Refund" button
4. System calculates remaining refundable amount
5. Confirm to restore stock and record refund

---

## Technical Highlights

### 1. Custom Storage Adapter
The application implements a sophisticated session persistence mechanism that respects user preference for "Remember Me":

```typescript
// Switches between localStorage and sessionStorage
const rememberMeStorage = {
  getItem: (key: string) => { /* ... */ },
  setItem: (key: string, value: string) => { /* ... */ },
  removeItem: (key: string) => { /* ... */ },
};
```

### 2. Dynamic Form Generation
Category attributes automatically generate appropriate form inputs:

```typescript
switch (attr.attribute_type) {
  case 'text': return <Input ... />;
  case 'number': return <Input type="number" ... />;
  case 'boolean': return <Checkbox ... />;
  case 'enum': return <Select ... />;
}
```

### 3. Optimistic UI Patterns
- Loading skeletons for all data grids
- Toast notifications for success/error feedback
- Disabled states during async operations
- Real-time stock validation

### 4. Responsive Design
- Mobile-first approach with Tailwind
- Collapsible sidebar on mobile
- Touch-friendly button sizes
- Responsive grid layouts (1/2/3 columns based on viewport)

### 5. Type Safety
- Full TypeScript coverage
- Generated Supabase types from database schema
- Strict prop typing for all components

---

## Development Setup

### Prerequisites
- Node.js 18+
- npm or bun

### Installation

```bash
# Clone repository
git clone <repository-url>
cd storefront-hub

# Install dependencies
npm install
# or
bun install

# Set up environment variables
# Create .env file with:
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_key

# Start development server
npm run dev
# or
bun run dev
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run build:dev` | Development build |
| `npm run lint` | ESLint check |
| `npm run test` | Run Vitest tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run preview` | Preview production build |

---

## Deployment

The project is configured for deployment on **Vercel** with the following settings:

- **Build Command:** `vite build`
- **Output Directory:** `dist`
- **Framework Preset:** Vite

Environment variables must be configured in the Vercel dashboard:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

---

## Project Structure

```
storefront-hub/
├── src/
│   ├── components/          # React components
│   │   ├── ui/             # shadcn/ui components (50+ files)
│   │   ├── CartDetailModal.tsx
│   │   ├── CategoryAttributeForm.tsx
│   │   ├── DashboardLayout.tsx
│   │   ├── LoadingGrid.tsx
│   │   ├── ProductDetailModal.tsx
│   │   └── ProtectedRoute.tsx
│   ├── hooks/              # Custom React hooks
│   │   ├── useAuth.tsx     # Authentication context
│   │   ├── useAdminCheck.ts
│   │   ├── useSignOut.ts
│   │   └── use-toast.ts
│   ├── integrations/       # External service integrations
│   │   └── supabase/       # Supabase client & types
│   ├── lib/                # Utility functions
│   │   ├── api.ts          # API helpers
│   │   ├── attributes.ts   # Attribute parsing
│   │   ├── filters.ts      # Search/filter logic
│   │   ├── formatters.ts   # Date/currency formatting
│   │   └── utils.ts        # General utilities
│   ├── pages/              # Route components
│   │   ├── dashboard/      # Admin dashboard pages
│   │   │   ├── Categories.tsx
│   │   │   ├── NewSale.tsx
│   │   │   ├── Overview.tsx
│   │   │   ├── Products.tsx
│   │   │   ├── Profiles.tsx
│   │   │   └── SalesHistory.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   └── NotFound.tsx
│   ├── types/              # TypeScript type definitions
│   └── test/               # Test files
├── supabase/               # Supabase configuration
│   ├── migrations/         # Database migrations
│   └── functions/          # Edge functions
├── public/                 # Static assets
├── docs/                   # Documentation
└── Configuration files     # vite.config.ts, tailwind.config.ts, etc.
```

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.3.1 | UI library |
| @supabase/supabase-js | ^2.95.3 | Backend SDK |
| @tanstack/react-query | ^5.83.0 | Server state management |
| react-router-dom | ^6.30.1 | Client-side routing |
| tailwindcss | ^3.4.17 | CSS framework |
| lucide-react | ^0.462.0 | Icon library |
| zod | ^3.25.76 | Schema validation |
| recharts | ^2.15.4 | Data visualization |
| date-fns | ^3.6.0 | Date formatting |

---

## Future Enhancements

Potential features for future development:
- Multi-store support
- Barcode/QR code scanning
- Receipt printing
- Email notifications
- Advanced reporting and analytics
- Inventory forecasting
- Supplier management
- Purchase order workflow

---

## License

This project was built with [Lovable](https://lovable.dev) and is intended for commercial retail use.

---

*Last Updated: Based on codebase exploration of the MHG Store retail management system.*
