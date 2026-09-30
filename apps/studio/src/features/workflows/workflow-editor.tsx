import { DefaultRole, roleTitles, type Scope } from "@repo/contracts/access";
import type { WorkflowView } from "@repo/contracts/studio";
import { type Workflow, WorkflowStep } from "@repo/contracts/workflow";
import { Button } from "@repo/ui/components/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { approversOf, neededOf } from "../approvals/describe";
import { PersonPicker } from "../people/person-picker";
import { getWorkflow, saveWorkflow } from "../sites/functions";

export const workflowQuery = (scope: Scope) =>
  queryOptions({
    queryKey: ["workflow", scope.kind, scope.kind === "organization" ? null : scope.id],
    queryFn: () => getWorkflow({ data: { scope } }),
  });

const parentOf = { organization: null, brand: "the organization's", site: "the brand's" } as const;

const validateStep = Schema.toStandardSchemaV1(WorkflowStep)["~standard"].validate;

/** What's wrong with a step as the person has it, or null when it's ready to save. */
const problemOf = (step: WorkflowStep) => {
  const result = validateStep(step);
  if (result instanceof Promise) return null;
  return result.issues?.[0]?.message ?? null;
};

const blankStep: WorkflowStep = { name: "", roles: ["approver"], people: [], required: 1 };

/** One step's name, who can approve it, and how many approvals it needs. */
function StepEditor(props: {
  readonly index: number;
  readonly count: number;
  readonly step: WorkflowStep;
  readonly showProblem: boolean;
  readonly onChange: (step: WorkflowStep) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const id = useId();
  const { step } = props;
  const problem = props.showProblem ? problemOf(step) : null;
  const number = props.index + 1;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Step {number}</h3>
        </CardTitle>
        <CardAction className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${number} earlier`}
            disabled={props.index === 0}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move step ${number} later`}
            disabled={props.index === props.count - 1}
            onClick={() => props.onMove(1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove step ${number}`}
            onClick={props.onRemove}
          >
            <Trash2Icon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-name`}>Step name</FieldLabel>
            <Input
              id={`${id}-name`}
              value={step.name}
              maxLength={60}
              onChange={(event) => props.onChange({ ...step, name: event.target.value })}
            />
          </Field>
          <FieldSet>
            <FieldLegend variant="label">Who can approve</FieldLegend>
            <FieldDescription>
              Anyone with one of these roles on the site, its brand or the organization, or anyone
              named below. They also need permission to approve.
            </FieldDescription>
            <div className="grid gap-3 sm:grid-cols-2">
              {DefaultRole.literals.map((role) => (
                <Field key={role} orientation="horizontal">
                  <Checkbox
                    id={`${id}-${role}`}
                    checked={step.roles.includes(role)}
                    onCheckedChange={(checked) =>
                      props.onChange({
                        ...step,
                        roles: checked
                          ? [...step.roles, role]
                          : step.roles.filter((held) => held !== role),
                      })
                    }
                  />
                  <Label htmlFor={`${id}-${role}`}>{roleTitles[role]}s</Label>
                </Field>
              ))}
            </div>
            {step.people.length > 0 && (
              <ul aria-label={`People named in step ${number}`} className="flex flex-col gap-2">
                {step.people.map((person) => (
                  <li key={person.id} className="flex items-center gap-2 text-sm">
                    <span className="grow">{person.name}</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${person.name} from step ${number}`}
                      onClick={() =>
                        props.onChange({
                          ...step,
                          people: step.people.filter((named) => named.id !== person.id),
                        })
                      }
                    >
                      <XIcon />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <PersonPicker
              label={`Name someone for step ${number}`}
              exclude={step.people.map((person) => person.id)}
              onPick={(person) =>
                props.onChange({
                  ...step,
                  people: [...step.people, { id: person.id, name: person.name }],
                })
              }
            />
          </FieldSet>
          <Field>
            <FieldLabel htmlFor={`${id}-required`}>Approvals needed</FieldLabel>
            <Input
              id={`${id}-required`}
              type="number"
              min={1}
              className="w-24"
              value={step.required}
              onChange={(event) =>
                props.onChange({
                  ...step,
                  required: Math.max(1, Math.trunc(event.target.valueAsNumber) || 1),
                })
              }
            />
          </Field>
          {problem !== null && <FieldError>{problem}</FieldError>}
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

/** Steps as a read-only list, for a workflow the person can't change or one set above. */
function StepList(props: { readonly steps: Workflow }) {
  return props.steps.length === 0 ? (
    <p className="text-sm text-muted-foreground">
      No steps: changes go live as soon as someone submits them.
    </p>
  ) : (
    <ol className="flex flex-col gap-3">
      {props.steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
            {index + 1}
          </span>
          <span className="flex flex-col">
            <span className="font-medium">{step.name}</span>
            <span className="text-muted-foreground">
              {approversOf(step)}. {neededOf(step)}.
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A link to the workflow a scope uses when it has none of its own. */
function ParentLink(props: { readonly parent: Scope | null }) {
  const className = "self-start text-sm font-medium underline underline-offset-4";
  switch (props.parent?.kind) {
    case "brand":
      return (
        <Link
          to="/brands/$brandId/workflow"
          params={{ brandId: props.parent.id }}
          className={className}
        >
          Open the brand's workflow
        </Link>
      );
    case "organization":
      return (
        <Link to="/organization/workflow" className={className}>
          Open the organization's workflow
        </Link>
      );
    case "site":
    case undefined:
      return null;
  }
}

/**
 * A scope's approval workflow as a list of steps. A site or brand can use
 * the workflow above it instead of its own.
 */
export function WorkflowEditor(props: { readonly view: WorkflowView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const [own, setOwn] = useState<Workflow | null>(view.own);
  const [tried, setTried] = useState(false);
  const parent = parentOf[view.scope.kind];
  const switchId = useId();
  const save = useMutation({
    mutationFn: (steps: Workflow | null) => saveWorkflow({ data: { scope: view.scope, steps } }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(workflowQuery(view.scope).queryKey, saved);
      setTried(false);
      toast.success("Approval workflow saved", {
        description: "It applies to changes submitted from now on.",
      });
    },
  });
  const ready = own === null || own.every((step) => problemOf(step) === null);
  const changeStep = (index: number, step: WorkflowStep) =>
    setOwn((steps) => steps?.map((current, at) => (at === index ? step : current)) ?? null);

  if (!view.can.edit)
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          You can't change this workflow. Brand and organization admins edit workflows.
        </p>
        <StepList steps={view.own ?? view.inherited.steps} />
        {view.own === null && <ParentLink parent={view.parent} />}
      </div>
    );

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {parent !== null && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <Field orientation="horizontal">
              <Switch
                id={switchId}
                checked={own === null}
                onCheckedChange={(inherit) => setOwn(inherit ? null : [...view.inherited.steps])}
              />
              <FieldLabel htmlFor={switchId}>Use {parent} workflow</FieldLabel>
            </Field>
            {own === null && (
              <>
                <StepList steps={view.inherited.steps} />
                <ParentLink parent={view.parent} />
              </>
            )}
          </CardContent>
        </Card>
      )}
      {own !== null && (
        <>
          {own.map((step, index) => (
            <StepEditor
              key={index}
              index={index}
              count={own.length}
              step={step}
              showProblem={tried}
              onChange={(next) => changeStep(index, next)}
              onMove={(by) =>
                setOwn((steps) => {
                  if (steps === null) return steps;
                  const moved = [...steps];
                  const [taken] = moved.splice(index, 1);
                  if (taken !== undefined) moved.splice(index + by, 0, taken);
                  return moved;
                })
              }
              onRemove={() => setOwn((steps) => steps?.filter((_, at) => at !== index) ?? null)}
            />
          ))}
          <Button
            variant="outline"
            className="self-start"
            onClick={() => setOwn((steps) => [...(steps ?? []), blankStep])}
          >
            <PlusIcon />
            Add step
          </Button>
          <p className="text-sm text-muted-foreground">
            After the last step, changes go live within about a minute. With no steps, changes go
            live as soon as someone submits them. Someone who edited a change can approve it only
            with the "approve changes you edited" permission.
          </p>
        </>
      )}
      {save.error !== null && <FieldError>{save.error.message}</FieldError>}
      <Button
        className="self-start"
        disabled={save.isPending}
        onClick={() => {
          setTried(true);
          if (ready) save.mutate(own);
        }}
      >
        {save.isPending ? "Saving" : "Save workflow"}
      </Button>
    </div>
  );
}
