"use client";

export type InteractionFeedbackMessage = {
  kind: "success" | "error" | "warning" | "info";
  message: string;
  title?: string;
};

export function ActionSpinner({ label = "Working" }: { label?: string }) {
  return (
    <span className="journol-spinner" role="status" aria-label={label}>
      <span aria-hidden="true" />
    </span>
  );
}

export function InteractionFeedback({
  feedback,
  onDismiss,
}: {
  feedback: InteractionFeedbackMessage | null;
  onDismiss: () => void;
}) {
  if (!feedback) return null;

  return (
    <div
      className={`interaction-feedback interaction-feedback-${feedback.kind}`}
      role={feedback.kind === "error" ? "alert" : "status"}
      aria-live={feedback.kind === "error" ? "assertive" : "polite"}
    >
      <span>{feedback.kind === "success" ? "✓" : feedback.kind === "error" ? "!" : feedback.kind === "warning" ? "!" : "i"}</span>
      <div>
        {feedback.title && <strong>{feedback.title}</strong>}
        <p>{feedback.message}</p>
      </div>
      <button type="button" onClick={onDismiss} aria-label="Dismiss message">
        ×
      </button>
    </div>
  );
}
