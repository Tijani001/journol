"use client";

import { useState } from "react";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, setState] = useState<"idle" | "deleting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function remove() {
    setState("deleting");
    try {
      const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "DELETE" }) });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) {
        setState("error");
        setMessage(body?.error ?? "Your account couldn't be deleted. Please try again.");
        return;
      }
      setState("done");
      setMessage(body.signInDeleted ? "Your account and all your Journol data have been deleted." : "Your Journol data has been deleted. Your sign-in account couldn't be removed automatically; contact us and we'll remove it.");
      // A full reload clears the signed-out session everywhere on the page.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.setTimeout(() => window.location.assign("/"), 2_500);
    } catch {
      setState("error");
      setMessage("Journol couldn't be reached. Check your connection and try again.");
    }
  }

  if (state === "done") return <p role="status"><strong>{message}</strong></p>;
  if (!open) return <button type="button" className="button button-danger" onClick={() => setOpen(true)}>Delete my account…</button>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
      <label className="field">
        <span>Type DELETE to confirm</span>
        <input className="text-input" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
      </label>
      <div className="toolbar">
        <button type="button" className="button button-danger" disabled={typed !== "DELETE" || state === "deleting"} onClick={remove}>
          {state === "deleting" ? "Deleting…" : "Permanently delete"}
        </button>
        <button type="button" className="button" onClick={() => { setOpen(false); setTyped(""); }}>Cancel</button>
      </div>
      {state === "error" ? <p className="form-error" role="alert">{message}</p> : null}
    </div>
  );
}
