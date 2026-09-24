import fs from "fs";
import path from "path";
import { ApplicantQuestionnaire } from "@/components/ApplicantQuestionnaire";

// Editable by staff: one line per question, ideas separated by " | ". These are
// things to think about, never suggested answers.
function loadHelpIdeas(): string[][] {
  try {
    return fs
      .readFileSync(path.join(process.cwd(), "prompts", "admissions-question-help.txt"), "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.split("|").map((i) => i.trim()).filter(Boolean));
  } catch {
    return [];
  }
}

export default function ApplyPage() {
  return (
    <div className="min-h-full bg-[var(--color-canvas)]">
      <ApplicantQuestionnaire helpIdeas={loadHelpIdeas()} />
    </div>
  );
}
