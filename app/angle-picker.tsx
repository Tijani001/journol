"use client";

import { ActionSpinner } from "@/app/interaction-feedback";
import { ANGLE_TYPE_LABELS, GAP_KIND_LABELS } from "@/lib/lead-angles";
import type { ClientAngle, ClientAngleSet } from "@/lib/client/angle-set";
import styles from "./angle-picker.module.css";

type Props = {
  set: ClientAngleSet;
  chosenLeadId: string | null;
  choosingLeadId: string | null;
  busy: boolean;
  onChoose: (angle: ClientAngle) => void;
  onShowOthers: () => void;
};

const STRENGTH: Record<string, string> = { high: "Strong", medium: "Promising", low: "Long shot" };

function gapList(indices: number[]) {
  const numbers = indices.map((index) => String(index + 1));
  if (numbers.length <= 1) return numbers.join("");
  return `${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/**
 * Shows what a story leaves open, then the angles Journol found in those
 * gaps. The journalist picks one to pursue.
 */
export function AnglePicker({ set, chosenLeadId, choosingLeadId, busy, onChoose, onShowOthers }: Props) {
  if (set.outcome === "insufficient_evidence") {
    const angle = set.angles[0];
    return (
      <section className={styles.panel} aria-labelledby="angles-heading">
        <div className={styles.notice} role="status">
          <h4 id="angles-heading">Not enough to go on yet</h4>
          <p>{angle.leadRationale}</p>
          {angle.firstAction && <p><strong>Try this: </strong>{angle.firstAction}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="angles-heading">
      {set.storyGaps.length > 0 && (
        <>
          <p className={styles.eyebrow}>Read between the lines</p>
          <h3 className={styles.heading}>What the story leaves open</h3>
          <p className={styles.intro}>Gaps in the published story — the places where a new angle can start.</p>
          <ol className={styles.gaps}>
            {set.storyGaps.map((gap, index) => (
              <li className={styles.gap} key={`${gap.kind}-${index}`}>
                <span className={styles.gapNumber} aria-hidden="true">{index + 1}</span>
                <div>
                  <span className={styles.gapKind}>{GAP_KIND_LABELS[gap.kind]}</span>
                  <p className={styles.gapText}>{gap.observation}</p>
                  {gap.excerpt && <blockquote className={styles.quote}>“{gap.excerpt}”</blockquote>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <p className={styles.eyebrow}>New angles</p>
      <h3 className={styles.heading} id="angles-heading">Angles to pursue</h3>
      <p className={styles.intro}>Pick one. Deep Research will focus on the angle you choose.</p>

      <div className={styles.angles}>
        {set.angles.map((angle) => {
          const chosen = angle.leadId === chosenLeadId;
          return (
            <article className={`${styles.angle} ${chosen ? styles.angleChosen : ""}`} key={angle.leadId} aria-label={angle.headline || angle.primaryLead}>
              {angle.angleType && <span className={styles.angleType}>{ANGLE_TYPE_LABELS[angle.angleType]}</span>}
              {angle.headline && <h4 className={styles.angleHeadline}>{angle.headline}</h4>}
              <p className={styles.question}>{angle.primaryLead}</p>
              {angle.leadRationale && <p className={styles.why}>{angle.leadRationale}</p>}
              <p className={styles.meta}>
                {[
                  STRENGTH[angle.confidence] ?? null,
                  angle.builtOnGaps.length && set.storyGaps.length ? `Builds on gap ${gapList(angle.builtOnGaps)}` : null,
                ].filter(Boolean).join(" · ")}
              </p>

              {chosen && (
                <div className={styles.details}>
                  {angle.firstAction && <div><h5>First step</h5><p>{angle.firstAction}</p></div>}
                  {angle.evidencePath.length > 0 && <div><h5>Where to look</h5><ul>{angle.evidencePath.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                  {angle.missingInformation.length > 0 && <div><h5>Still to find out</h5><ul>{angle.missingInformation.map((item) => <li key={item}>{item}</li>)}</ul></div>}
                </div>
              )}

              {chosen ? (
                <span className={styles.chosenLabel}>✓ Pursuing this angle</span>
              ) : (
                <button type="button" className={styles.choose} disabled={busy || choosingLeadId !== null} aria-busy={choosingLeadId === angle.leadId} onClick={() => onChoose(angle)}>
                  {choosingLeadId === angle.leadId ? <><ActionSpinner label="Choosing angle" /> Choosing…</> : "Pursue this angle"}
                </button>
              )}
            </article>
          );
        })}
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.secondary} disabled={busy || choosingLeadId !== null} aria-busy={busy} onClick={onShowOthers}>
          {busy ? <><ActionSpinner label="Finding different angles" /> Finding different angles…</> : "Show different angles"}
        </button>
      </div>
    </section>
  );
}
