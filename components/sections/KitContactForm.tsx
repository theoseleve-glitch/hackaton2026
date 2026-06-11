"use client";

import { useId, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { kit } from "@/lib/content";
import { cn } from "@/lib/utils";

const { fields, submit, success } = kit.contact;

/**
 * Sponsor inquiry form for the live kit page. Styled as a pit-wall input
 * channel: mono uppercase field labels, hairline borders, volt-lime focus.
 * No network — submit flips to an in-voice "transmitted" readout.
 */
export function KitContactForm() {
  const [sent, setSent] = useState(false);
  const nameId = useId();
  const companyId = useId();
  const messageId = useId();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSent(true);
  }

  if (sent) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col gap-5 rounded-md border border-accent/60 bg-accent/[0.05] p-7 sm:p-9"
      >
        <span className="inline-flex items-center gap-3 telemetry text-accent">
          <span aria-hidden className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-paper">
            <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
          </span>
          TRANSMITTED · CH 27
        </span>
        <p className="max-w-[44ch] text-balance font-display text-h2 font-medium text-ink">
          {success}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-px overflow-hidden rounded-md border border-border bg-border"
    >
      <Field id={nameId} label={fields.name} name="name" index="01" autoComplete="name" />
      <Field id={companyId} label={fields.company} name="company" index="02" autoComplete="organization" />

      <div className="group flex flex-col gap-2.5 bg-surface px-5 py-5 transition-colors focus-within:bg-surface-2 sm:px-7">
        <label
          htmlFor={messageId}
          className="flex items-center gap-3 telemetry transition-colors group-focus-within:text-accent"
        >
          <span className="text-mute">03</span>
          {fields.message}
        </label>
        <textarea
          id={messageId}
          name="message"
          rows={3}
          required
          className={cn(
            "w-full resize-none border-b border-border bg-transparent pb-2 text-body text-ink",
            "placeholder:text-mute/70 focus:border-accent focus:outline-none",
          )}
          placeholder="Sidepod — €1,500 / season"
        />
      </div>

      <button
        type="submit"
        className={cn(
          "group flex min-h-[56px] items-center justify-center gap-2.5 bg-accent px-6",
          "font-mono text-small font-medium uppercase tracking-[0.12em] text-paper",
          "transition-colors duration-[var(--duration-base)] hover:bg-accent-dim active:bg-accent-press",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink",
        )}
      >
        <span>{submit}</span>
        <ArrowRight
          className="h-4 w-4 transition-transform duration-[var(--duration-base)] ease-[var(--ease-out-expo)] group-hover:translate-x-1"
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
    </form>
  );
}

function Field({
  id,
  label,
  name,
  index,
  autoComplete,
}: {
  id: string;
  label: string;
  name: string;
  index: string;
  autoComplete?: string;
}) {
  return (
    <div className="group flex flex-col gap-2.5 bg-surface px-5 py-5 transition-colors focus-within:bg-surface-2 sm:px-7">
      <label
        htmlFor={id}
        className="flex items-center gap-3 telemetry transition-colors group-focus-within:text-accent"
      >
        <span className="text-mute">{index}</span>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required
        autoComplete={autoComplete}
        className={cn(
          "w-full border-b border-border bg-transparent pb-2 text-body text-ink",
          "placeholder:text-mute/70 focus:border-accent focus:outline-none",
        )}
      />
    </div>
  );
}
