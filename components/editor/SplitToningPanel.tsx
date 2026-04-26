"use client";

import { Slider } from "@/components/ui/Slider";
import type { GradingParams } from "@/lib/grading/params";

type Props = {
  value: GradingParams["splitToning"];
  onChange: (next: GradingParams["splitToning"]) => void;
};

export function SplitToningPanel({ value, onChange }: Props) {
  return (
    <div className="space-y-4">
      <ToneRow
        label="Shadows"
        hue={value.shadowHue}
        sat={value.shadowSaturation}
        onHue={(h) => onChange({ ...value, shadowHue: h })}
        onSat={(s) => onChange({ ...value, shadowSaturation: s })}
      />
      <ToneRow
        label="Highlights"
        hue={value.highlightHue}
        sat={value.highlightSaturation}
        onHue={(h) => onChange({ ...value, highlightHue: h })}
        onSat={(s) => onChange({ ...value, highlightSaturation: s })}
      />
      <Slider
        label="Balance"
        bipolar
        defaultValue={0}
        min={-100}
        max={100}
        value={value.balance}
        onChange={(v) => onChange({ ...value, balance: v })}
      />
    </div>
  );
}

function ToneRow({
  label,
  hue,
  sat,
  onHue,
  onSat,
}: {
  label: string;
  hue: number;
  sat: number;
  onHue: (h: number) => void;
  onSat: (s: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[var(--color-fg-muted)]">{label}</span>
        <div
          className="h-3 w-3 rounded-full ring-1 ring-[var(--color-border-strong)]"
          style={{ backgroundColor: `hsl(${hue} ${sat}% 50%)` }}
        />
      </div>
      <div className="relative h-5 rounded-full bg-[length:100%_100%]"
        style={{
          background:
            "linear-gradient(90deg, hsl(0 80% 50%), hsl(60 80% 50%), hsl(120 80% 50%), hsl(180 80% 50%), hsl(240 80% 50%), hsl(300 80% 50%), hsl(360 80% 50%))",
        }}
      >
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={hue}
          onChange={(e) => onHue(parseFloat(e.target.value))}
          className="absolute inset-0 w-full"
        />
      </div>
      <Slider
        dense
        label="Saturation"
        min={0}
        max={100}
        defaultValue={0}
        value={sat}
        onChange={onSat}
      />
    </div>
  );
}
