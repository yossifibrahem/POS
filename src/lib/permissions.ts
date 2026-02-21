/**
 * Permission helpers for admin level hierarchy
 * 
 * Note: Column-level cost suppression currently happens in the frontend only.
 * A Supabase view or Edge Function can enforce this at the API level in a future iteration if needed.
 */

export type AdminLevel = 'high' | 'med' | 'low' | null;

export const isAdmin = (level: AdminLevel): boolean => level !== null;

export const canSeeCostAndProfit = (level: AdminLevel): boolean => level === 'high';

export const canManageInventory = (level: AdminLevel): boolean => level === 'high' || level === 'med';

export const canManageRefunds = (level: AdminLevel): boolean => level === 'high' || level === 'med';

export const canManageUsers = (level: AdminLevel): boolean => level === 'high' || level === 'med';

export const canManageAdmins = (level: AdminLevel): boolean => level === 'high';

export const canCreateSale = (level: AdminLevel): boolean => isAdmin(level);

export const canAccessDashboard = (level: AdminLevel): boolean => level === 'high' || level === 'med';

export const canAccessSalesHistory = (level: AdminLevel): boolean => isAdmin(level);
