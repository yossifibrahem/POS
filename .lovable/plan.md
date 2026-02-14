

# Store Management App — Phase 1: Core Features

## Overview
A store management application with staff authentication, an admin dashboard, and a point-of-sale system. Built with React + Vite + React Router, connected to your existing Supabase database.

---

## 1. Authentication & Role-Based Routing
- **Login page** (`/login`) — Email + password form with validation
- **Registration page** (`/register`) — Full name, email, phone, password. Creates auth user + inserts into `customers` table
- **Role check on login** — Query the `admins` table to determine if user is staff or customer
  - Admin → redirect to `/dashboard`
  - Customer → redirect to `/account` (placeholder for now)
- **Route protection** — All `/dashboard/*` routes require authenticated admin; unauthorized users redirected to `/login`

## 2. Dashboard Layout & Overview
- **Fixed left sidebar** with navigation: Overview, Products, Categories, Customers, New Sale, Sales History
- **Overview page** (`/dashboard`) with summary cards:
  - Total products, total customers, today's sales count, today's revenue
  - Recent sales table (last 10 carts with customer name, staff name, total, date)
  - Low stock alerts (products with stock ≤ 5)

## 3. Product Management (`/dashboard/products`)
- Sortable/searchable table of all products showing name, category, price, cost, stock, and date
- Color-coded stock badges (green ≥ 10, yellow 1–9, red = 0)
- **Add Product** — Modal form with fields: name, price, cost, category dropdown, stock. Full Zod validation
- **Edit Product** — Same form pre-filled with existing data
- **Delete Product** — Confirmation dialog; blocked if product has sold_products records
- Filter by category + search by name

## 4. Category Management (`/dashboard/categories`)
- Simple table: category name, product count, created date
- Add/Edit/Delete with protection against deleting categories that have products

## 5. Customer Management (`/dashboard/customers`)
- Table showing full name, email, phone, join date, number of orders
- **View** button to see a customer's full purchase history
- **Add Customer** — Form to create a new customer (creates auth user + customer record)
- **Promote/Demote Admin** — Insert/remove from admins table with confirmation

## 6. Point of Sale (`/dashboard/sales`)
- **Two-panel layout:**
  - **Left: Product Picker** — Search/filter products, click to add to cart, disabled when out of stock
  - **Right: Cart Builder** — Customer selector (searchable dropdown), editable line items (quantity, unit price), notes field, running total
- **Process Sale** button that:
  - Validates customer selected and cart not empty
  - Validates quantities don't exceed stock
  - Creates cart record, sold_products records, and decrements stock
  - Shows success confirmation and resets

## 7. Sales History & Cart Detail
- **Sales History** (`/dashboard/sales/history`) — Table of all past carts with date range filter
- **Cart Detail** (`/dashboard/sales/[cartId]`) — Read-only view of cart metadata and line items

---

## Design Approach
- Clean, minimal staff-tool aesthetic — clarity and speed over decoration
- Desktop-first for dashboard
- Toast notifications (sonner) for all mutations
- Loading states and inline validation on all forms
- shadcn/ui components throughout (tables, forms, dialogs, badges, cards)

