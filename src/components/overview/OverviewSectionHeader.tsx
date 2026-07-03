import type { LucideIcon } from "lucide-react";

interface OverviewSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function OverviewSectionHeader({ icon: Icon, title, description }: OverviewSectionHeaderProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="p-2 bg-muted rounded-lg">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
