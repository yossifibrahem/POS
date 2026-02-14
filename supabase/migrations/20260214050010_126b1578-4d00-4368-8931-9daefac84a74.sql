
-- Categories table
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  cost NUMERIC NOT NULL DEFAULT 0,
  category_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Customers table (linked to auth.users)
CREATE TABLE public.customers (
  id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Admins table (subset of customers)
CREATE TABLE public.admins (
  id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Carts table
CREATE TABLE public.carts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  processed_by UUID NOT NULL REFERENCES public.admins(id) ON DELETE RESTRICT,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Sold products table
CREATE TABLE public.sold_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Security definer function to check admin status (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE id = _user_id
  )
$$;

-- Enable RLS on all tables
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sold_products ENABLE ROW LEVEL SECURITY;

-- Categories: public read, admin write
CREATE POLICY "Anyone can read categories" ON public.categories FOR SELECT USING (true);
CREATE POLICY "Admins can insert categories" ON public.categories FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update categories" ON public.categories FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete categories" ON public.categories FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Products: public read, admin write
CREATE POLICY "Anyone can read products" ON public.products FOR SELECT USING (true);
CREATE POLICY "Admins can insert products" ON public.products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update products" ON public.products FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete products" ON public.products FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Customers: users can read own, admins can read all, users can update own
CREATE POLICY "Users can read own customer record" ON public.customers FOR SELECT TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Users can insert own customer record" ON public.customers FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can update own customer record" ON public.customers FOR UPDATE TO authenticated USING (id = auth.uid() OR public.is_admin(auth.uid()));

-- Admins table: admins can read, only admins can modify
CREATE POLICY "Admins can read admins" ON public.admins FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert admins" ON public.admins FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can delete admins" ON public.admins FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Carts: customers can read own, admins can do everything
CREATE POLICY "Users can read own carts" ON public.carts FOR SELECT TO authenticated USING (customer_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admins can insert carts" ON public.carts FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update carts" ON public.carts FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- Sold products: customers can read own (via cart), admins can do everything
CREATE POLICY "Users can read own sold products" ON public.sold_products FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.carts WHERE carts.id = sold_products.cart_id AND (carts.customer_id = auth.uid() OR public.is_admin(auth.uid())))
);
CREATE POLICY "Admins can insert sold products" ON public.sold_products FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
