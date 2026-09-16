"use client";

import {
  CLASSIFICATION_LABEL,
  CLASSIFICATION_ORDER,
  PRIORITY_LABEL,
  REPRODUCIBILITY_LABEL,
  REPRODUCIBILITY_ORDER,
} from "@/lib/radar/taxonomy";
import { fullDate } from "@/lib/radar/format";
import type { RadarDetail } from "@/server/radars/queries";
import {
  DueDateField,
  FieldRow,
  SelectField,
  StateField,
  useRadarPatch,
  type RadarRef,
} from "@/components/radar/field-controls";
import { PriorityBadge, UserChip } from "@/components/radar/badges";
import { Switch } from "@/components/ui/switch";

export function DetailSidebar({
  radar,
  people,
  components,
  milestones,
}: {
  radar: RadarDetail;
  people: { id: string; name: string; handle: string }[];
  components: { id: string; path: string }[];
  milestones: { id: string; name: string }[];
}) {
  const ref: RadarRef = {
    id: radar.id,
    number: radar.number,
    version: radar.version,
  };
  const { patch } = useRadarPatch(ref);

  return (
    <div className="flex flex-col gap-0.5 text-sm">
      <FieldRow label="State">
        <StateField radar={ref} state={radar.state} substate={radar.substate} />
      </FieldRow>

      <FieldRow label="Priority">
        <SelectField
          radar={ref}
          field="priority"
          value={String(radar.priority)}
          options={[1, 2, 3, 4, 5].map((p) => ({
            value: String(p),
            label: PRIORITY_LABEL[p],
          }))}
          display={<PriorityBadge priority={radar.priority} long />}
        />
      </FieldRow>

      <FieldRow label="Classification">
        <SelectField
          radar={ref}
          field="classification"
          value={radar.classification}
          options={CLASSIFICATION_ORDER.map((c) => ({
            value: c,
            label: CLASSIFICATION_LABEL[c],
          }))}
        />
      </FieldRow>

      <FieldRow label="Reproducible">
        <SelectField
          radar={ref}
          field="reproducibility"
          value={radar.reproducibility}
          options={REPRODUCIBILITY_ORDER.map((r) => ({
            value: r,
            label: REPRODUCIBILITY_LABEL[r],
          }))}
        />
      </FieldRow>

      <div className="my-2 border-t" />

      <FieldRow label="Component">
        <SelectField
          radar={ref}
          field="componentId"
          value={radar.componentId}
          options={components.map((c) => ({ value: c.id, label: c.path }))}
          searchable
        />
      </FieldRow>

      <FieldRow label="Milestone">
        <SelectField
          radar={ref}
          field="milestoneId"
          value={radar.milestoneId}
          options={milestones.map((m) => ({ value: m.id, label: m.name }))}
          allowEmpty
          searchable
        />
      </FieldRow>

      <div className="my-2 border-t" />

      <FieldRow label="Assignee">
        <SelectField
          radar={ref}
          field="assigneeId"
          value={radar.assigneeId}
          options={people.map((p) => ({
            value: p.id,
            label: `${p.name} (@${p.handle})`,
          }))}
          display={radar.assignee ? <UserChip person={radar.assignee} /> : undefined}
          allowEmpty
          emptyLabel="Unassigned"
          searchable
        />
      </FieldRow>

      <FieldRow label="Originator">
        <span className="px-1.5 py-1">
          <UserChip person={radar.originator} muted />
        </span>
      </FieldRow>

      <div className="my-2 border-t" />

      <FieldRow label="Due">
        <DueDateField radar={ref} value={radar.dueDate} />
      </FieldRow>

      <FieldRow label="Regression">
        <span className="px-1.5 py-1">
          <Switch
            aria-label="Regression"
            checked={radar.isRegression}
            onCheckedChange={(checked: boolean) =>
              patch({ isRegression: checked })
            }
          />
        </span>
      </FieldRow>

      <div className="my-2 border-t" />

      <FieldRow label="Filed">
        <span className="text-muted-foreground px-1.5 py-1 text-xs">
          {fullDate(radar.createdAt)}
        </span>
      </FieldRow>
      <FieldRow label="State since">
        <span className="text-muted-foreground px-1.5 py-1 text-xs">
          {fullDate(radar.stateChangedAt)}
        </span>
      </FieldRow>
      {radar.resolvedAt && (
        <FieldRow label="Resolved">
          <span className="text-muted-foreground px-1.5 py-1 text-xs">
            {fullDate(radar.resolvedAt)}
          </span>
        </FieldRow>
      )}
    </div>
  );
}
