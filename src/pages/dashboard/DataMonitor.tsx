import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Columns3, Database, Download, Filter, RefreshCw, Search } from "lucide-react";
import { formatDateTime } from "@/lib/formatters";

type ViewRow = Record<string, unknown>;

type MonitorColumn = {
  key: string;
  label: string;
  defaultHidden?: boolean;
};

type MonitorView = {
  name: string;
  label: string;
  description: string;
  columns: MonitorColumn[];
  organizationColumn?: string;
  organizationIdColumn?: string;
  branchColumn?: string;
  orderBy?: string;
};

type QueryResult = {
  data: ViewRow[] | null;
  count: number | null;
  error: { message: string } | null;
};

type ReadOnlyQuery = {
  select: (columns: string, options?: { count?: "exact" }) => ReadOnlyQuery;
  eq: (column: string, value: string) => ReadOnlyQuery;
  in: (column: string, values: string[]) => ReadOnlyQuery;
  order: (column: string, options?: { ascending?: boolean }) => ReadOnlyQuery;
  range: (from: number, to: number) => Promise<QueryResult>;
};

type ReadOnlyClient = {
  from: (view: string) => ReadOnlyQuery;
};

const ROW_LIMIT_OPTIONS = [50, 100, 250, 500, 1000];

const monitorViews: MonitorView[] = [
  {
    name: "admin_profiles",
    label: "Admin Profiles",
    description: "Admins, levels, branch assignment, and presence",
    columns: [
      { key: "id", label: "ID", defaultHidden: true },
      { key: "organization_id", label: "Organization ID", defaultHidden: true },
      { key: "organization_name", label: "Organization" },
      { key: "full_name", label: "Name" },
      { key: "email", label: "Email" },
      { key: "phone", label: "Phone" },
      { key: "level", label: "Level" },
      { key: "branch_id", label: "Branch ID", defaultHidden: true },
      { key: "branch_name", label: "Branch" },
      { key: "is_online", label: "Online" },
      { key: "last_seen_at", label: "Last seen" },
      { key: "admin_since", label: "Admin since" },
    ],
    organizationColumn: "organization_id",
    branchColumn: "branch_id",
    orderBy: "full_name",
  },
  {
    name: "products_with_branch_stock",
    label: "Product Stock",
    description: "Products with category and branch stock",
    columns: [
      { key: "id", label: "ID", defaultHidden: true },
      { key: "organization_id", label: "Organization ID", defaultHidden: true },
      { key: "branch_id", label: "Branch ID", defaultHidden: true },
      { key: "branch_name", label: "Branch" },
      { key: "name", label: "Product" },
      { key: "category_name", label: "Category" },
      { key: "price", label: "Price" },
      { key: "cost", label: "Cost" },
      { key: "stock", label: "Stock" },
      { key: "is_active", label: "Active" },
      { key: "attributes", label: "Attributes", defaultHidden: true },
      { key: "created_at", label: "Created" },
      { key: "updated_at", label: "Updated" },
    ],
    organizationColumn: "organization_id",
    branchColumn: "branch_id",
    orderBy: "created_at",
  },
  {
    name: "cart_summary",
    label: "Cart Summary",
    description: "Sales, customers, processors, and refund status",
    columns: [
      { key: "id", label: "ID", defaultHidden: true },
      { key: "branch_id", label: "Branch ID", defaultHidden: true },
      { key: "branch_name", label: "Branch" },
      { key: "status", label: "Status" },
      { key: "total", label: "Total" },
      { key: "refunded_amount", label: "Refunded" },
      { key: "net_amount", label: "Net" },
      { key: "refund_status", label: "Refund status" },
      { key: "customer_name", label: "Customer" },
      { key: "customer_email", label: "Customer email" },
      { key: "processed_by_name", label: "Processed by" },
      { key: "processed_by_level", label: "Admin level" },
      { key: "notes", label: "Notes" },
      { key: "created_at", label: "Created" },
      { key: "updated_at", label: "Updated" },
    ],
    branchColumn: "branch_id",
    orderBy: "created_at",
  },
  {
    name: "cart_refund_status",
    label: "Cart Refund Status",
    description: "Refund totals and net amounts per cart",
    columns: [
      { key: "cart_id", label: "Cart ID", defaultHidden: true },
      { key: "sale_total", label: "Sale total" },
      { key: "refunded_amount", label: "Refunded" },
      { key: "net_amount", label: "Net" },
      { key: "refund_status", label: "Refund status" },
    ],
    orderBy: "cart_id",
  },
  {
    name: "cart_line_items",
    label: "Cart Line Items",
    description: "Sold products and refunded quantities per cart",
    columns: [
      { key: "cart_id", label: "Cart ID", defaultHidden: true },
      { key: "branch_id", label: "Branch ID", defaultHidden: true },
      { key: "sold_product_id", label: "Line ID", defaultHidden: true },
      { key: "product_id", label: "Product ID", defaultHidden: true },
      { key: "product_name", label: "Product" },
      { key: "sold_quantity", label: "Sold qty" },
      { key: "refunded_quantity", label: "Refunded qty" },
      { key: "unit_price", label: "Unit price" },
      { key: "line_total", label: "Line total" },
      { key: "net_line_total", label: "Net line total" },
      { key: "product_cost", label: "Cost" },
      { key: "product_attributes", label: "Attributes", defaultHidden: true },
    ],
    branchColumn: "branch_id",
    orderBy: "cart_id",
  },
  {
    name: "refund_detail",
    label: "Refund Detail",
    description: "Refund lines with processor and product context",
    columns: [
      { key: "refund_id", label: "Refund ID", defaultHidden: true },
      { key: "refund_item_id", label: "Item ID", defaultHidden: true },
      { key: "cart_id", label: "Cart ID", defaultHidden: true },
      { key: "branch_id", label: "Branch ID", defaultHidden: true },
      { key: "product_id", label: "Product ID", defaultHidden: true },
      { key: "product_name", label: "Product" },
      { key: "refunded_quantity", label: "Refunded qty" },
      { key: "unit_price", label: "Unit price" },
      { key: "refund_line_total", label: "Line total" },
      { key: "refund_amount", label: "Refund total" },
      { key: "processed_by_name", label: "Processed by" },
      { key: "processed_by_level", label: "Admin level" },
      { key: "refunded_at", label: "Refunded at" },
    ],
    branchColumn: "branch_id",
    orderBy: "refunded_at",
  },
];

function defaultVisibleColumns(view: MonitorView) {
  return view.columns.filter((column) => !column.defaultHidden).map((column) => column.key);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isIsoDateString(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function formatCell(value: unknown) {
  if (isIsoDateString(value)) return formatDateTime(value);
  return stringifyCell(value);
}

function toCsvValue(value: unknown) {
  const stringValue = stringifyCell(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: ViewRow[], columns: MonitorColumn[]) {
  const header = columns.map((column) => toCsvValue(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => toCsvValue(row[column.key])).join(","))
    .join("\n");
  const csv = [header, body].filter(Boolean).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function DataMonitor() {
  const { organization, branches } = useAuth();
  const [viewName, setViewName] = useState(monitorViews[0].name);
  const [rows, setRows] = useState<ViewRow[]>([]);
  const [rowCount, setRowCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState("all");
  const [filterValue, setFilterValue] = useState("");
  const [branchScope, setBranchScope] = useState("all");
  const [rowLimit, setRowLimit] = useState(250);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(() => defaultVisibleColumns(monitorViews[0]));
  const activeFilterCount =
    (filterColumn !== "all" && filterValue.trim() ? 1 : 0) +
    (branchScope !== "all" ? 1 : 0) +
    (rowLimit !== 250 ? 1 : 0);

  const activeView = useMemo(
    () => monitorViews.find((view) => view.name === viewName) || monitorViews[0],
    [viewName],
  );

  useEffect(() => {
    setVisibleColumnKeys(defaultVisibleColumns(activeView));
    setFilterColumn("all");
    setFilterValue("");
    setSearch("");
    setBranchScope("all");
  }, [activeView]);

  const visibleColumns = useMemo(
    () => activeView.columns.filter((column) => visibleColumnKeys.includes(column.key)),
    [activeView, visibleColumnKeys],
  );

  const loadRows = useCallback(async () => {
    if (!organization) {
      setRows([]);
      setRowCount(0);
      setLoading(false);
      return;
    }

    setLoading(true);
    const client = supabase as unknown as ReadOnlyClient;
    let query = client.from(activeView.name).select("*", { count: "exact" });

    if (activeView.organizationColumn) {
      query = query.eq(activeView.organizationColumn, organization.id);
    }

    if (activeView.organizationIdColumn) {
      query = query.eq(activeView.organizationIdColumn, organization.id);
    }

    if (activeView.branchColumn) {
      if (branchScope !== "all") {
        query = query.eq(activeView.branchColumn, branchScope);
      } else if (!activeView.organizationColumn && !activeView.organizationIdColumn && branches.length > 0) {
        query = query.in(activeView.branchColumn, branches.map((branch) => branch.id));
      }
    }

    if (activeView.orderBy) {
      query = query.order(activeView.orderBy, {
        ascending: activeView.orderBy === "full_name",
      });
    }

    const { data, count, error } = await query.range(0, rowLimit - 1);
    setLoading(false);

    if (error) {
      toast.error(`Failed to load ${activeView.label}: ${error.message}`);
      setRows([]);
      setRowCount(0);
      return;
    }

    setRows(data || []);
    setRowCount(count);
  }, [activeView, branchScope, branches, organization, rowLimit]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const normalizedFilter = filterValue.trim().toLowerCase();

    return rows.filter((row) => {
      if (normalizedSearch) {
        const rowMatches = activeView.columns.some((column) =>
          stringifyCell(row[column.key]).toLowerCase().includes(normalizedSearch),
        );
        if (!rowMatches) return false;
      }

      if (filterColumn !== "all" && normalizedFilter) {
        return stringifyCell(row[filterColumn]).toLowerCase().includes(normalizedFilter);
      }

      return true;
    });
  }, [activeView.columns, filterColumn, filterValue, rows, search]);

  const handleColumnToggle = (columnKey: string, checked: boolean) => {
    setVisibleColumnKeys((current) => {
      if (checked) return [...new Set([...current, columnKey])];
      if (current.length === 1) return current;
      return current.filter((key) => key !== columnKey);
    });
  };

  const clearFilters = () => {
    setFilterColumn("all");
    setFilterValue("");
    setBranchScope("all");
    setRowLimit(250);
  };

  const exportRows = () => {
    if (!filteredRows.length) {
      toast.error("No rows to export");
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`${activeView.name}-${date}.csv`, filteredRows, visibleColumns);
  };

  if (!organization) {
    return <div className="p-6 text-sm text-muted-foreground">Organization unavailable</div>;
  }

  return (
    <div className="p-4 md:p-6">
      <div className="sticky top-[48px] z-10 bg-background py-2 lg:hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search loaded rows..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="sticky top-[96px] z-10 bg-background py-2 lg:top-[48px]">
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(220px,300px)_minmax(320px,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-2">
            <Database className="hidden h-5 w-5 shrink-0 text-muted-foreground sm:block" />
            <Select value={viewName} onValueChange={setViewName}>
              <SelectTrigger className="w-full md:w-[280px]">
                <SelectValue placeholder="Select view" />
              </SelectTrigger>
              <SelectContent>
                {monitorViews.map((view) => (
                  <SelectItem key={view.name} value={view.name}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative hidden lg:block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search loaded rows..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end lg:flex-nowrap">
            <Button variant="outline" size="icon" className="w-full sm:w-10" onClick={loadRows} disabled={loading} aria-label="Refresh data">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="outline" className="w-full gap-2 px-0 sm:w-auto sm:px-4" onClick={exportRows} aria-label="Export CSV">
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">CSV</span>
            </Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="relative w-full gap-2 px-0 sm:w-auto sm:px-4" aria-label="Open filters">
                  <Filter className="h-4 w-4" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary" className="absolute -right-1 -top-1 h-5 min-w-5 justify-center px-1.5 py-0 text-[10px] sm:static sm:ml-1">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="monitor-filter-column">Column</Label>
                    <Select value={filterColumn} onValueChange={setFilterColumn}>
                      <SelectTrigger id="monitor-filter-column">
                        <SelectValue placeholder="Filter column" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">No column filter</SelectItem>
                        {activeView.columns.map((column) => (
                          <SelectItem key={column.key} value={column.key}>
                            {column.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monitor-filter-value">Value</Label>
                    <Input
                      id="monitor-filter-value"
                      placeholder="Filter value..."
                      value={filterValue}
                      onChange={(event) => setFilterValue(event.target.value)}
                      disabled={filterColumn === "all"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monitor-branch-scope">Branch</Label>
                    <Select value={branchScope} onValueChange={setBranchScope} disabled={!activeView.branchColumn}>
                      <SelectTrigger id="monitor-branch-scope">
                        <SelectValue placeholder="Branch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All branches</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monitor-row-limit">Rows</Label>
                    <Select value={String(rowLimit)} onValueChange={(value) => setRowLimit(Number(value))}>
                      <SelectTrigger id="monitor-row-limit">
                        <SelectValue placeholder="Rows" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROW_LIMIT_OPTIONS.map((option) => (
                          <SelectItem key={option} value={String(option)}>
                            {option} rows
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button variant="outline" className="w-full" onClick={clearFilters} disabled={activeFilterCount === 0}>
                    Clear filters
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full gap-2 px-0 sm:w-auto sm:px-4" aria-label="Choose columns">
                  <Columns3 className="h-4 w-4" />
                  <span className="hidden sm:inline">Columns</span>
                </Button>
              </SheetTrigger>
              <SheetContent className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Columns</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  {activeView.columns.map((column) => (
                    <div key={column.key} className="flex items-center gap-3">
                      <Checkbox
                        id={`column-${column.key}`}
                        checked={visibleColumnKeys.includes(column.key)}
                        onCheckedChange={(checked) => handleColumnToggle(column.key, checked === true)}
                      />
                      <Label htmlFor={`column-${column.key}`} className="cursor-pointer text-sm">
                        {column.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 pt-5">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">{activeView.label}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeView.description}</p>
        </div>
        <div className="text-sm text-muted-foreground">
          {filteredRows.length} shown{rowCount !== null ? ` of ${rowCount}` : ""}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-muted">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                {visibleColumns.map((column) => (
                  <th key={column.key} className="whitespace-nowrap px-4 py-3 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }, (_, index) => (
                  <tr key={index} className="border-t">
                    {visibleColumns.map((column) => (
                      <td key={column.key} className="px-4 py-3">
                        <Skeleton className="h-4 w-28" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filteredRows.length > 0 ? (
                filteredRows.map((row, rowIndex) => (
                  <tr key={String(row.id ?? `${activeView.name}-${rowIndex}`)} className="border-t border-muted transition-colors hover:bg-muted/40">
                    {visibleColumns.map((column) => (
                      <td key={column.key} className="max-w-[280px] px-4 py-3 align-top">
                        <span className="block truncate" title={stringifyCell(row[column.key])}>
                          {formatCell(row[column.key]) || <span className="text-muted-foreground">-</span>}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr className="border-t">
                  <td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-muted-foreground">
                    No rows match the current view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
