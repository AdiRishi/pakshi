import { roleTitles } from "@repo/contracts/access";
import type { MergedChange } from "@repo/contracts/merge";
import type { PreflightIssue } from "@repo/contracts/publishing";
import { currentStep, type Submission } from "@repo/contracts/submission";
import type { WorkflowStep } from "@repo/contracts/workflow";

/** Who a step names, such as "Approvers, or Meera Kapoor". */
export const approversOf = (step: WorkflowStep) => {
  const names = [
    ...step.roles.map((role) => `${roleTitles[role]}s`),
    ...step.people.map((person) => person.name),
  ];
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;
};

/** How many approvals a step needs, such as "1 approval needed". */
export const neededOf = (step: WorkflowStep) =>
  step.required === 1 ? "1 approval needed" : `${step.required} approvals needed`;

/** Where a submission stands, for a badge. */
export const standing = (submission: Submission) => {
  switch (submission.status._tag) {
    case "InReview": {
      const step = currentStep(submission);
      return {
        label:
          step === null ? "Approved" : `In review, step ${step + 1} of ${submission.steps.length}`,
        variant: "secondary",
      } as const;
    }
    case "Published":
      return { label: "Approved and published", variant: "success" } as const;
    case "ChangesRequested":
      return { label: "Changes requested", variant: "destructive" } as const;
    case "NeedsUpdate":
      return { label: "Needs an update", variant: "warning" } as const;
    case "Replaced":
      return { label: "Submitted again", variant: "secondary" } as const;
    case "Withdrawn":
      return { label: "Withdrawn", variant: "secondary" } as const;
  }
};

/** The step a submission waits on, such as "Step 2 of 2, Library manager". */
export const waitingStep = (submission: Submission) => {
  const index = currentStep(submission);
  const step = index === null ? undefined : submission.steps[index];
  return index === null || step === undefined
    ? null
    : `Step ${index + 1} of ${submission.steps.length}, ${step.name}`;
};

/** A change between two versions of a site, as the review and update screens list it. */
export const describeChange = (change: MergedChange) => {
  switch (change._tag) {
    case "PageAdded":
      return "New page";
    case "PageRemoved":
      return "Page removed";
    case "BlockAdded":
      return `Added ${change.block.title}`;
    case "BlockRemoved":
      return `Removed ${change.block.title}`;
    case "BlockMoved":
      return `Moved ${change.block.title}`;
    case "ValueChanged":
      return change.block === null
        ? `Changed ${change.field}`
        : `${change.field} in ${change.block.title}`;
  }
};

/** What pre-flight found, in a sentence, and the page to fix it on, if it's on one. */
export const describeIssue = (issue: PreflightIssue) => {
  switch (issue._tag) {
    case "NoFormEmails":
      return {
        page: null,
        text: `${issue.name} would email its entries to no one. Add an address in the site's settings, under Forms and email`,
      };
    case "MissingConsent":
      return {
        page: null,
        text: `${issue.name} asks for an email address or phone number, so it needs a consent checkbox that links to a privacy policy`,
      };
  }
  const page = issue.place.target === "site" ? null : issue.place.target;
  switch (issue._tag) {
    case "Incomplete":
      return {
        page,
        text: `${issue.field} in ${issue.block.title}, ${issue.place.title}: ${issue.message}`,
      };
    case "Placeholder":
      return {
        page,
        text: `${issue.field} in ${issue.block.title}, ${issue.place.title}, still has placeholder content`,
      };
    case "MissingMeta":
      return { page, text: `${issue.place.title} has no ${issue.field}` };
    case "BrokenLink":
      return {
        page,
        text: `${issue.field}${issue.block === null ? "" : ` in ${issue.block.title}`}, ${issue.place.title}, links to a page that isn't published`,
      };
  }
};

/** The checks pre-flight runs, each with the kinds of issue it finds, in the order people fix them. */
export const preflightChecks = [
  { title: "Placeholders", passed: "No placeholder content left", tags: ["Placeholder"] },
  {
    title: "Required fields",
    passed: "Every required field is filled in, with alt text on every image",
    tags: ["Incomplete"],
  },
  { title: "Page titles and descriptions", passed: "Set on every page", tags: ["MissingMeta"] },
  { title: "Internal links", passed: "No broken links", tags: ["BrokenLink"] },
  {
    title: "Forms",
    passed: "Each form emails its entries and asks for consent",
    tags: ["NoFormEmails", "MissingConsent"],
  },
] as const satisfies ReadonlyArray<{
  readonly title: string;
  readonly passed: string;
  readonly tags: ReadonlyArray<PreflightIssue["_tag"]>;
}>;
