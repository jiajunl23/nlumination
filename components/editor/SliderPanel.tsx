"use client";

import { Slider } from "@/components/ui/Slider";
import { Section } from "@/components/ui/Section";
import { HSLPanel } from "./HSLPanel";
import { ToneCurveEditor } from "./ToneCurveEditor";
import { SplitToningPanel } from "./SplitToningPanel";
import { DEFAULT_PARAMS, type GradingParams } from "@/lib/grading/params";

type Props = {
  params: GradingParams;
  onChange: (next: GradingParams) => void;
};

export function SliderPanel({ params, onChange }: Props) {
  const set = <K extends keyof GradingParams>(key: K, val: GradingParams[K]) =>
    onChange({ ...params, [key]: val });

  return (
    <div className="px-4 py-1">
      <Section
          title="Light"
          onReset={() =>
            onChange({
              ...params,
              exposure: 0,
              contrast: 0,
              highlights: 0,
              shadows: 0,
              whites: 0,
              blacks: 0,
            })
          }
          resetDisabled={
            params.exposure === 0 &&
            params.contrast === 0 &&
            params.highlights === 0 &&
            params.shadows === 0 &&
            params.whites === 0 &&
            params.blacks === 0
          }
        >
          <Slider
            label="Exposure"
            min={-3}
            max={3}
            step={0.05}
            bipolar
            defaultValue={0}
            format={(v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)} EV`}
            value={params.exposure}
            onChange={(v) => set("exposure", v)}
          />
          <Slider
            label="Contrast"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.contrast}
            onChange={(v) => set("contrast", v)}
          />
          <Slider
            label="Highlights"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.highlights}
            onChange={(v) => set("highlights", v)}
          />
          <Slider
            label="Shadows"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.shadows}
            onChange={(v) => set("shadows", v)}
          />
          <Slider
            label="Whites"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.whites}
            onChange={(v) => set("whites", v)}
          />
          <Slider
            label="Blacks"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.blacks}
            onChange={(v) => set("blacks", v)}
          />
        </Section>

        <Section
          title="Color"
          onReset={() =>
            onChange({
              ...params,
              temperature: 0,
              tint: 0,
              vibrance: 0,
              saturation: 0,
            })
          }
          resetDisabled={
            params.temperature === 0 &&
            params.tint === 0 &&
            params.vibrance === 0 &&
            params.saturation === 0
          }
        >
          <Slider
            label="Temperature"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.temperature}
            onChange={(v) => set("temperature", v)}
          />
          <Slider
            label="Tint"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.tint}
            onChange={(v) => set("tint", v)}
          />
          <Slider
            label="Vibrance"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.vibrance}
            onChange={(v) => set("vibrance", v)}
          />
          <Slider
            label="Saturation"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.saturation}
            onChange={(v) => set("saturation", v)}
          />
        </Section>

        <Section
          title="HSL"
          onReset={() => set("hsl", DEFAULT_PARAMS.hsl)}
          resetDisabled={Object.values(params.hsl).every(
            (b) => b.hue === 0 && b.saturation === 0 && b.luminance === 0,
          )}
          defaultOpen={false}
        >
          <HSLPanel
            value={params.hsl}
            onChange={(v) => set("hsl", v)}
          />
        </Section>

        <Section
          title="Tone curve"
          onReset={() => set("curve", DEFAULT_PARAMS.curve)}
          resetDisabled={params.curve.points.length === 2}
          defaultOpen={false}
        >
          <ToneCurveEditor
            points={params.curve.points}
            onChange={(p) => set("curve", { points: p })}
          />
        </Section>

        <Section
          title="Split toning"
          onReset={() => set("splitToning", DEFAULT_PARAMS.splitToning)}
          resetDisabled={
            params.splitToning.shadowSaturation === 0 &&
            params.splitToning.highlightSaturation === 0 &&
            params.splitToning.balance === 0
          }
          defaultOpen={false}
        >
          <SplitToningPanel
            value={params.splitToning}
            onChange={(v) => set("splitToning", v)}
          />
        </Section>

        <Section
          title="Effects"
          onReset={() =>
            onChange({
              ...params,
              clarity: 0,
              vignette: { ...DEFAULT_PARAMS.vignette },
            })
          }
          resetDisabled={
            params.clarity === 0 && params.vignette.amount === 0
          }
          defaultOpen={false}
        >
          <Slider
            label="Clarity"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.clarity}
            onChange={(v) => set("clarity", v)}
          />
          <Slider
            label="Vignette"
            min={-100}
            max={100}
            bipolar
            defaultValue={0}
            value={params.vignette.amount}
            onChange={(v) =>
              set("vignette", { ...params.vignette, amount: v })
            }
          />
          <Slider
            label="Midpoint"
            min={0}
            max={100}
            defaultValue={50}
            value={params.vignette.midpoint}
            onChange={(v) =>
              set("vignette", { ...params.vignette, midpoint: v })
            }
          />
          <Slider
            label="Feather"
            min={0}
            max={100}
            defaultValue={50}
            value={params.vignette.feather}
            onChange={(v) =>
              set("vignette", { ...params.vignette, feather: v })
            }
          />
        </Section>

      <div className="h-6" />
    </div>
  );
}
