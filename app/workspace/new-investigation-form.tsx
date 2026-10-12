"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/client/api";
import { ActionSpinner, InteractionFeedback, type InteractionFeedbackMessage } from "@/app/interaction-feedback";

export function NewInvestigationForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<InteractionFeedbackMessage | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      setError("Enter a title for your investigation.");
      setFeedback({ kind: "error", message: "Enter a title before creating an investigation." });
      return;
    }

    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      const data = await readApiResponse(response, "Creating investigation");

      if (!data.investigation || typeof data.investigation !== "object" ||
          typeof (data.investigation as { id?: unknown }).id !== "string") {
        setError("Unable to create investigation.");
        setFeedback({ kind: "error", message: "Journol could not create the investigation." });
        return;
      }

      setFeedback({ kind: "success", message: "Investigation created. Opening it now…" });
      router.push(`/workspace/${(data.investigation as { id: string }).id}`);
      router.refresh();
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : "Unable to create investigation. Please try again.";
      setError(message);
      setFeedback({ kind: "error", message });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 rounded-lg border p-4" aria-busy={isSubmitting}>
      <InteractionFeedback feedback={feedback} onDismiss={() => setFeedback(null)} />
      <label
        htmlFor="investigation-title"
        className="block text-sm font-medium"
      >
        Start a new investigation
      </label>

      <div className="mt-3 flex gap-2">
        <input
          id="investigation-title"
          name="title"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="e.g. Nigeria's fuel market"
          maxLength={200}
          disabled={isSubmitting}
          className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm"
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md border px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? <><ActionSpinner label="Creating investigation" /> Creating…</> : "New investigation"}
        </button>
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
