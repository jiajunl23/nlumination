"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/Slider";
import { HUE_BAND_CENTERS, HUE_BANDS, type HslBand, type HueBand } from "@/lib/grading/params";
import { cn } from "@/lib/utils";

type Props = {
  value: Record<HueBand, HslBand>;
  onChange: (next: Record<HueBand, HslBand>) => void;
};

const BAND_LABELS: Record<HueBand, string> = {
  red: "Red",
  orange: "Orange",
  yellow: "Yellow",
  green: "Green",
  aqua: "Aqua",
  blue: "Blue",
  purple: "Purple",
  magenta: "Magenta",
};

export function HSLPanel({ value, onChange }: Props) {
  const [active, setActive] = useState<HueBand>("orange");
  const band = value[active];

  const update = (patch: Partial<HslBand>) => {
    onChange({ ...value, [active]: { ...band, ...patch } });
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {HUE_BANDS.map((b) => {
          const selected = active === b;
          const v = value[b];
          const touched = v.hue !== 0 || v.saturation !== 0 || v.luminance !== 0;
          return (
            <button
              key={b}
              onClick={() => setActive(b)}
              title={BAND_LABELS[b]}
              className={cn(
                "relative h-6 flex-1 rounded-md ring-1 ring-inset ring-[--color-border] transition",
                selected && "ring-2 ring-[--color-fg]",
              )}
              style={{
                backgroundColor: `hsl(${HUE_BAND_CENTERS[b]} 80% 55%)`,
              }}
            >
              {touched && !selected && (
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white shadow ring-1 ring-black/30" />
              )}
            </button>
          );
        })}
      </div>

      <Slider
        label={`Hue · ${BAND_LABELS[active]}`}
        bipolar
        defaultValue={0}
        min={-100}
        max={100}
        value={band.hue}
        onChange={(v) => update({ hue: v })}
      />
      <Slider
        label="Saturation"
        bipolar
        defaultValue={0}
        min={-100}
        max={100}
        value={band.saturation}
        onChange={(v) => update({ saturation: v })}
      />
      <Slider
        label="Luminance"
        bipolar
        defaultValue={0}
        min={-100}
        max={100}
        value={band.luminance}
        onChange={(v) => update({ luminance: v })}
      />
    </div>
  );
}
