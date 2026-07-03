import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canGoToNextDay, formatOverviewDate } from "@/lib/overview";

interface DateNavigatorProps {
  date: Date;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}

export function DateNavigator({ date, onPrevious, onNext, onToday }: DateNavigatorProps) {
  return (
    <div className="flex justify-between items-center gap-2 bg-muted/50 rounded-lg p-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrevious}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button variant="ghost" className="px-3 h-8 font-medium min-w-[120px]" onClick={onToday}>
        {formatOverviewDate(date)}
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} disabled={!canGoToNextDay(date)}>
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
