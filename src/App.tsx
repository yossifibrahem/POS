import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import PurchaseHistory from "./pages/PurchaseHistory";
import DashboardLayout from "./components/DashboardLayout";
import Overview from "./pages/dashboard/Overview";
import Products from "./pages/dashboard/Products";
import Categories from "./pages/dashboard/Categories";
import NewSale from "./pages/dashboard/NewSale";
import SalesHistory from "./pages/dashboard/SalesHistory";
import Profiles from "./pages/dashboard/Profiles";
import Settings from "./pages/dashboard/Settings";
import DataMonitor from "./pages/dashboard/DataMonitor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/purchase-history" element={
              <ProtectedRoute><PurchaseHistory /></ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute adminOnly><DashboardLayout /></ProtectedRoute>
            }>
              <Route index element={<Overview />} />
              <Route path="products" element={
                <ProtectedRoute requiredLevel="med"><Products /></ProtectedRoute>
              } />
              <Route path="categories" element={
                <ProtectedRoute requiredLevel="med"><Categories /></ProtectedRoute>
              } />
              <Route path="sales" element={<NewSale />} />
              <Route path="sales/history" element={<SalesHistory />} />
              <Route path="profiles" element={
                <ProtectedRoute requiredLevel="med"><Profiles /></ProtectedRoute>
              } />
              <Route path="data" element={
                <ProtectedRoute requiredLevel="high"><DataMonitor /></ProtectedRoute>
              } />
              <Route path="settings" element={
                <ProtectedRoute requiredLevel="high"><Settings /></ProtectedRoute>
              } />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
