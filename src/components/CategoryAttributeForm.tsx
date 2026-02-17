import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import type { CategoryAttribute, AttributeType } from "@/types/category";
import { parseOptions } from "@/lib/attributes";
import { toast } from "sonner";

interface CategoryAttributeFormProps {
  initialData?: Partial<CategoryAttribute>;
  attributesCount: number;
  onSave: (data: Partial<CategoryAttribute>) => void;
  onCancel?: () => void;
  isEditing?: boolean;
}

export function CategoryAttributeForm({
  initialData,
  attributesCount,
  onSave,
  onCancel,
  isEditing = false,
}: CategoryAttributeFormProps) {
  const [form, setForm] = useState<Partial<CategoryAttribute>>({
    name: initialData?.name || "",
    label: initialData?.label || "",
    attribute_type: initialData?.attribute_type || "text",
    unit: initialData?.unit || "",
    options: initialData?.options || [],
    is_required: initialData?.is_required || false,
    display_order: initialData?.display_order ?? attributesCount,
  });
  const [optionsInput, setOptionsInput] = useState(
    parseOptions(initialData?.options).join(", ") || ""
  );

  const handleLabelChange = (label: string) => {
    const name = label
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    setForm((prev) => ({ ...prev, label, name }));
  };

  const handleOptionsChange = (value: string) => {
    setOptionsInput(value);
    const options = value
      .split(",")
      .map((o) => o.trim())
      .filter((o) => o);
    setForm((prev) => ({ ...prev, options }));
  };

  const handleSubmit = () => {
    // Validate name format (lowercase_snake_case)
    if (!/^[a-z][a-z0-9_]*$/.test(form.name || "")) {
      toast.error("Name must be lowercase with underscores (e.g., 'screen_size')");
      return;
    }

    // Validate enum has options
    const optionsArray = parseOptions(form.options);
    if (form.attribute_type === "enum" && optionsArray.length === 0) {
      toast.error("Enum type requires at least one option");
      return;
    }

    onSave(form);
  };

  return (
    <div className="space-y-4 p-4 border rounded-md">
      <h4 className="font-medium">{isEditing ? "Edit Attribute" : "Add New Attribute"}</h4>

      <div className="space-y-2">
        <Label>Label (display name)</Label>
        <Input
          value={form.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="e.g., Screen Size"
        />
        <p className="text-xs text-muted-foreground">
          Key: {form.name || "auto-generated from label"}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select
            value={form.attribute_type}
            onValueChange={(v: AttributeType) =>
              setForm((prev) => ({ ...prev, attribute_type: v }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text</SelectItem>
              <SelectItem value="number">Number</SelectItem>
              <SelectItem value="boolean">Boolean</SelectItem>
              <SelectItem value="enum">Enum (Dropdown)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Unit (optional)</Label>
          <Input
            value={form.unit}
            onChange={(e) => setForm((prev) => ({ ...prev, unit: e.target.value }))}
            placeholder="e.g., GB, inch"
          />
        </div>
      </div>

      {form.attribute_type === "enum" && (
        <div className="space-y-2">
          <Label>Options (comma-separated)</Label>
          <Input
            value={optionsInput}
            onChange={(e) => handleOptionsChange(e.target.value)}
            placeholder="e.g., 4, 8, 16, 32"
          />
          <p className="text-xs text-muted-foreground">Enter values separated by commas</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Checkbox
          id="required"
          checked={form.is_required}
          onCheckedChange={(checked) =>
            setForm((prev) => ({ ...prev, is_required: checked as boolean }))
          }
        />
        <Label htmlFor="required" className="cursor-pointer">
          Required field
        </Label>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} size="sm">
          {isEditing ? "Update" : "Add"}
        </Button>
        {isEditing && onCancel && (
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
