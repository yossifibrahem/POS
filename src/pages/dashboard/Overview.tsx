import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, DollarSign, Package, ShoppingCart, Tags, TrendingUp, Users, XCircle } from "lucide-react";
import { CartDetailModal } from "@/components/CartDetailModal";
import { StatCardSkeleton } from "@/components/LoadingGrid";
import { DateNavigator } from "@/components/overview/DateNavigator";
import { OverviewSectionHeader } from "@/components/overview/OverviewSectionHeader";
import { OverviewStatCard } from "@/components/overview/OverviewStatCard";
import { TransactionsCard } from "@/components/overview/TransactionsCard";
import { useAuth } from "@/hooks/useAuth";
import { useCartRealtime, useInventoryRealtime } from "@/hooks/useRealtimeSubscription";
import { formatCurrency } from "@/lib/formatters";
import {
  addDays,
  fetchDailyOverview,
  fetchStaticOverview,
  isTodayDate,
  type Cart,
  type DailyStats,
  type Product,
  type StaticStats,
} from "@/lib/overview";
import { canSeeCostAndProfit } from "@/lib/permissions";

const EMPTY_DAILY_STATS: DailyStats = { sales: 0, revenue: 0, profit: 0 };
const EMPTY_STATIC_STATS: StaticStats = { products: 0, categories: 0, customers: 0 };

export default function Overview() {
  const navigate = useNavigate();
  const { adminLevel, user } = useAuth();
  const isLowLevelAdmin = adminLevel === "low";
  const [loadingDaily, setLoadingDaily] = useState(true);
  const [loadingStatic, setLoadingStatic] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dailyStats, setDailyStats] = useState(EMPTY_DAILY_STATS);
  const [staticStats, setStaticStats] = useState(EMPTY_STATIC_STATS);
  const [recentCarts, setRecentCarts] = useState<Cart[]>([]);
  const [outOfStock, setOutOfStock] = useState<Product[]>([]);
  const [selectedCartId, setSelectedCartId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadDailyData = useCallback(async (date: Date) => {
    setLoadingDaily(true);
    try {
      const data = await fetchDailyOverview(date, { isLowLevelAdmin, userId: user?.id });
      setDailyStats(data.dailyStats);
      setRecentCarts(data.recentCarts);
    } catch (error) {
      console.error("Error fetching daily data:", error);
    } finally {
      setLoadingDaily(false);
    }
  }, [isLowLevelAdmin, user?.id]);

  const loadStaticData = useCallback(async () => {
    setLoadingStatic(true);
    try {
      const data = await fetchStaticOverview();
      setStaticStats(data.staticStats);
      setOutOfStock(data.outOfStock);
    } catch (error) {
      console.error("Error fetching static data:", error);
    } finally {
      setLoadingStatic(false);
    }
  }, []);

  useEffect(() => {
    loadDailyData(selectedDate);
  }, [loadDailyData, selectedDate]);

  useEffect(() => {
    if (!isLowLevelAdmin) loadStaticData();
  }, [isLowLevelAdmin, loadStaticData]);

  useCartRealtime({
    onChange: useCallback(() => {
      if (isTodayDate(selectedDate)) loadDailyData(selectedDate);
    }, [loadDailyData, selectedDate]),
  });

  useInventoryRealtime({
    onChange: useCallback(() => {
      if (!isLowLevelAdmin) loadStaticData();
    }, [isLowLevelAdmin, loadStaticData]),
  });

  const refreshData = () => {
    loadDailyData(selectedDate);
    if (!isLowLevelAdmin) loadStaticData();
  };

  const dailyStatCards = useMemo(() => {
    const cards = [
      { label: "Sales", value: dailyStats.sales, icon: ShoppingCart },
      { label: "Revenue", value: formatCurrency(dailyStats.revenue), icon: DollarSign },
      { label: "Profit", value: formatCurrency(dailyStats.profit), icon: TrendingUp },
    ];
    return canSeeCostAndProfit(adminLevel) ? cards : cards.filter((card) => card.label !== "Profit");
  }, [adminLevel, dailyStats]);

  const staticStatCards = [
    { label: "Products", value: staticStats.products, icon: Package, description: "In inventory", to: "/dashboard/products" },
    { label: "Categories", value: staticStats.categories, icon: Tags, description: "Product groups", to: "/dashboard/categories" },
    { label: "Customers", value: staticStats.customers, icon: Users, description: "Registered", to: "/dashboard/customers" },
    { label: "Out of Stock", value: outOfStock.length, icon: XCircle, description: "Need restock", to: "/dashboard/products?sort=stock-asc" },
  ];

  return (
    <div className="p-4 md:p-6 space-y-8">
      {!isLowLevelAdmin && (
        <section className="space-y-4">
          <OverviewSectionHeader
            icon={TrendingUp}
            title="Inventory Overview"
            description="Your store metrics at a glance"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {loadingStatic
              ? [1, 2, 3, 4].map((key) => <StatCardSkeleton key={key} />)
              : staticStatCards.map((stat) => (
                  <OverviewStatCard key={stat.label} {...stat} onClick={() => navigate(stat.to)} />
                ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <OverviewSectionHeader
            icon={Calendar}
            title="Daily Overview"
            description="Monitor your daily performance"
          />
          <DateNavigator
            date={selectedDate}
            onPrevious={() => setSelectedDate((date) => addDays(date, -1))}
            onNext={() => setSelectedDate((date) => addDays(date, 1))}
            onToday={() => setSelectedDate(new Date())}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {loadingDaily
            ? [1, 2, 3].map((key) => <StatCardSkeleton key={key} />)
            : dailyStatCards.map((stat) => <OverviewStatCard key={stat.label} {...stat} />)}
        </div>

        <TransactionsCard
          carts={recentCarts}
          loading={loadingDaily}
          selectedDate={selectedDate}
          onSelectCart={(cartId) => {
            setSelectedCartId(cartId);
            setModalOpen(true);
          }}
        />
      </section>

      <CartDetailModal
        cartId={selectedCartId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        onRefund={refreshData}
      />
    </div>
  );
}
