"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

const activityByStatus: Record<string, string[]> = {
  new: ["Brewing up your brief", "Taking in the creative ingredients", "Sifting for the details that matter", "Letting the concept take shape", "Connecting your references to the idea"],
  pending: ["Brewing up your brief", "Taking in the creative ingredients", "Sifting for the details that matter", "Letting the concept take shape", "Connecting your references to the idea"],
  created: ["Brewing up your brief", "Taking in the creative ingredients", "Sifting for the details that matter", "Letting the concept take shape", "Connecting your references to the idea"],
  in_progress: ["Shaping the opening beat", "Weaving scenes into a clear story", "Finding the visual rhythm", "Joining each shot to the next", "Balancing pace and emphasis", "Bringing the product into focus", "Smoothing the transitions"],
  processing: ["Shaping the opening beat", "Weaving scenes into a clear story", "Finding the visual rhythm", "Joining each shot to the next", "Balancing pace and emphasis", "Bringing the product into focus", "Smoothing the transitions"],
  in_review: ["Giving the cut a close read", "Checking the story from first frame to last", "Tuning the pacing", "Reviewing the visual details", "Preparing the delivery handoff"],
  completed: ["Giving the cut a close read", "Checking the story from first frame to last", "Tuning the pacing", "Reviewing the visual details", "Preparing the delivery handoff"],
  revision_requested: ["Taking in your change notes", "Reworking the selected moments", "Restitching the scene sequence", "Checking the revised rhythm", "Preparing your updated cut"],
  delivered: ["Wrapping the final file", "Wiring up your download"],
};

const phaseByStatus: Record<string, number> = {
  new: 0,
  pending: 0,
  created: 0,
  in_progress: 1,
  processing: 1,
  in_review: 2,
  completed: 2,
  revision_requested: 1,
  delivered: 3,
};

const workflowLabels = ["Brief", "Direction", "Final cut", "Delivery"];

export function VideoProgress({ status, compact = false }: { status: string; compact?: boolean }) {
  const { t } = useTranslation();
  const normalized = status.toLowerCase();
  const activities = activityByStatus[normalized] ?? activityByStatus.pending;
  const [activityIndex, setActivityIndex] = useState(0);
  const [typedActivity, setTypedActivity] = useState("");

  useEffect(() => {
    let active = true;
    let timeout = 0;
    let nextIndex = 0;

    function writeNextPhrase() {
      const phraseIndex = nextIndex % activities.length;
      const phrase = activities[phraseIndex];
      let characterIndex = 0;
      setActivityIndex(phraseIndex);
      setTypedActivity("");

      function writeCharacter() {
        if (!active) return;
        characterIndex += 1;
        setTypedActivity(phrase.slice(0, characterIndex));
        if (characterIndex < phrase.length) {
          timeout = window.setTimeout(writeCharacter, 28);
        } else {
          timeout = window.setTimeout(() => {
            nextIndex += 1;
            writeNextPhrase();
          }, 1700);
        }
      }

      timeout = window.setTimeout(writeCharacter, 90);
    }

    writeNextPhrase();
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [activities]);

  const activity = activities[activityIndex] ?? activities[0];
  const phase = phaseByStatus[normalized] ?? 0;
  const heading = normalized === "delivered"
    ? "Preparing your download"
    : normalized === "in_review" || normalized === "completed"
      ? "Your final cut is in review"
      : normalized === "revision_requested"
        ? "Working through your notes"
        : "Your video is taking shape";

  return (
    <div role="status" aria-label={t("Video preparation: {{activity}}", { activity: t(activity) })} className={compact
      ? "inline-flex h-10 min-w-48 items-center gap-2.5 rounded-full border border-line bg-surface px-3"
      : "rounded-[16px] border border-line bg-surface p-6 sm:p-8"}>
      <div className={compact ? "flex min-w-0 items-center gap-2.5" : "mx-auto flex max-w-md flex-col items-center text-center"}>
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2e8] text-olive">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 1.8 9.3 6.2 13.8 7.5 9.3 8.8 8 13.2 6.7 8.8 2.2 7.5l4.5-1.3L8 1.8Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" />
          </svg>
          <span className="absolute inset-0 rounded-full border border-olive/20 video-progress-pulse" />
        </span>
        <div className={compact ? "min-w-0" : "mt-4 w-full"}>
          <p className={`font-medium text-ink-2 ${compact ? "truncate text-[12px]" : "text-[17px]"}`}>
            {t(heading)}
          </p>
          <p aria-hidden="true" className={`min-h-[1.5em] text-muted ${compact ? "truncate text-[10px]" : "mt-1 text-[13px]"}`}>
            {t(typedActivity)}<span className="video-progress-caret">|</span>
          </p>
          <div className={`overflow-hidden rounded-full bg-sidebar ${compact ? "mt-1.5 h-1 w-full" : "mx-auto mt-6 h-1.5 w-full max-w-sm"}`} role="progressbar" aria-label={t(activity)} aria-valuetext={t(activity)}>
            <div className="video-progress-sweep h-full w-[28%] rounded-full bg-olive" />
          </div>
        </div>
      </div>
      {!compact ? (
        <div className="mx-auto mt-7 flex w-full max-w-sm items-start" aria-hidden="true">
          {workflowLabels.map((label, index) => (
            <div key={label} className="flex min-w-0 flex-1 items-center last:flex-none">
              <div className="flex min-w-[44px] flex-col items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-full transition-colors ${index <= phase ? "bg-olive" : "bg-line"}`} />
                <span className={`text-[10px] ${index <= phase ? "text-ink-2" : "text-muted-2"}`}>{t(label)}</span>
              </div>
              {index < workflowLabels.length - 1 ? (
                <span className="video-progress-wire relative mb-4 h-px min-w-3 flex-1 overflow-hidden bg-line">
                  <span className={`absolute inset-y-0 left-0 bg-olive ${index < phase ? "w-full" : index === phase ? "video-progress-wire-flow w-1/2" : "w-0"}`} />
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      <span className="sr-only">{t(activity)}</span>
    </div>
  );
}