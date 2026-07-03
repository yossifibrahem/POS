import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface OverviewStatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  description?: string;
  onClick?: () => void;
}

export function OverviewStatCard({ label, value, icon: Icon, description, onClick }: OverviewStatCardProps) {
  return (
    <Card
      className={onClick ? "hover:shadow-md transition-all cursor-pointer" : "transition-colors"}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          <div className="p-3 bg-muted rounded-xl">
            <Icon className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
