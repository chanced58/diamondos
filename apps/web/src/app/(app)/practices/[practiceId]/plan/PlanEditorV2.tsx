'use client';

import { useEffect, useMemo, useState, type JSX } from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BLOCK_TYPE_LABELS,
  FIELD_SPACE_LABELS,
  PracticeBlockStatus,
  PracticeBlockType,
  PracticeDrill,
  PracticeFieldSpace,
  PracticeTemplate,
  PracticeWeatherMode,
  PracticeWithBlocks,
  WEATHER_MODE_LABELS,
  computeBlockSchedule,
  compressRemaining,
  detectFieldSpaceConflicts,
} from '@baseball/shared';
import type { TeamCoach } from '@baseball/database';
import { DrillPicker } from '../../templates/DrillPicker';
import {
  applyWeatherSwapAction,
  compressRemainingAction,
  deleteBlockAction,
  instantiateFromTemplateAction,
  reorderBlocksAction,
  setBlockAssignedCoachAction,
  upsertBlockAction,
} from './actions';

interface Props {
  practice: PracticeWithBlocks;
  drills: PracticeDrill[];
  templates: PracticeTemplate[];
  coaches: TeamCoach[];
  currentUserId: string;
  /** True for head_coach / athletic_director / platform admin — may edit any
   * structural field, create/delete blocks, reorder, reassign. Assistant coaches
   * may only edit content on blocks they own. */
  canChangeStructure: boolean;
}

interface BlockRowData {
  id: string;
  position: number;
  blockType: PracticeBlockType;
  title: string;
  plannedDurationMinutes: number;
  drillId: string | null;
  assignedCoachId: string | null;
  fieldSpaces: PracticeFieldSpace[];
  notes: string;
}

export function PlanEditorV2({
  practice,
  drills,
  templates,
  coaches,
  currentUserId,
  canChangeStructure,
}: Props): JSX.Element {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<void>) {
    setPending(true);
    setError(null);
    fn()
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Request failed.');
      })
      .finally(() => setPending(false));
  }

  const initialBlocks = useMemo<BlockRowData[]>(
    () =>
      practice.blocks
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((b) => ({
          id: b.id,
          position: b.position,
          blockType: b.blockType,
          title: b.title,
          plannedDurationMinutes: b.plannedDurationMinutes,
          drillId: b.drillId ?? null,
          assignedCoachId: b.assignedCoachId ?? null,
          fieldSpaces: b.fieldSpaces,
          notes: b.notes ?? '',
        })),
    [practice.blocks],
  );

  const coachesById = useMemo(() => {
    const m = new Map<string, TeamCoach>();
    for (const c of coaches) m.set(c.userId, c);
    return m;
  }, [coaches]);

  const [blocks, setBlocks] = useState<BlockRowData[]>(initialBlocks);

  // After a server mutation + router.refresh(), practice.blocks arrives with
  // fresh ids/positions. Re-seed local state when the input materially
  // changes so we don't strand stale optimistic state.
  useEffect(() => {
    setBlocks(initialBlocks);
  }, [initialBlocks]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  const drillsById = useMemo(() => {
    const m = new Map<string, PracticeDrill>();
    for (const d of drills) m.set(d.id, d);
    return m;
  }, [drills]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const scheduleStart = practice.startedAt ?? practice.scheduledAt;
  const schedule = useMemo(
    () =>
      computeBlockSchedule(
        blocks.map((b) => ({
          id: b.id,
          position: b.position,
          plannedDurationMinutes: b.plannedDurationMinutes,
          status:
            practice.blocks.find((x) => x.id === b.id)?.status ??
            PracticeBlockStatus.PENDING,
          actualDurationMinutes: practice.blocks.find((x) => x.id === b.id)
            ?.actualDurationMinutes,
          startedAt: practice.blocks.find((x) => x.id === b.id)?.startedAt,
          completedAt: practice.blocks.find((x) => x.id === b.id)?.completedAt,
        })),
        scheduleStart,
      ),
    [blocks, practice.blocks, scheduleStart],
  );

  const scheduleById = useMemo(() => {
    const m = new Map<string, { startsAt: string; endsAt: string }>();
    for (const s of schedule) m.set(s.blockId, { startsAt: s.startsAt, endsAt: s.endsAt });
    return m;
  }, [schedule]);

  const conflicts = useMemo(
    () =>
      detectFieldSpaceConflicts(
        blocks.map((b) => {
          const slot = scheduleById.get(b.id);
          return {
            blockId: b.id,
            title: b.title,
            fieldSpaces: b.fieldSpaces,
            startsAt: slot?.startsAt ?? scheduleStart,
            endsAt: slot?.endsAt ?? scheduleStart,
          };
        }),
      ),
    [blocks, scheduleById, scheduleStart],
  );

  const conflictBlockIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      for (const b of c.overlappingBlocks) set.add(b.blockId);
    }
    return set;
  }, [conflicts]);

  const totalMinutes = blocks.reduce((s, b) => s + b.plannedDurationMinutes, 0);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = blocks.findIndex((b) => b.id === active.id);
    const newIdx = blocks.findIndex((b) => b.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const next = arrayMove(blocks, oldIdx, newIdx).map((b, i) => ({
      ...b,
      position: i,
    }));
    // Pure state update first — no side effects inside the updater.
    setBlocks(next);
    run(async () => {
      const res = await reorderBlocksAction({
        practiceId: practice.id,
        orderedBlockIds: next.map((b) => b.id),
      });
      if (res.error) setError(res.error);
      router.refresh();
    });
  }

  function handleInstantiate() {
    if (!selectedTemplate) return;
    if (
      blocks.length > 0 &&
      !confirm('This will replace the current plan with the template. Continue?')
    ) {
      return;
    }
    run(async () => {
      const res = await instantiateFromTemplateAction({
        practiceId: practice.id,
        templateId: selectedTemplate,
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function addBlankBlock() {
    run(async () => {
      const res = await upsertBlockAction({
        practiceId: practice.id,
        position: blocks.length,
        blockType: PracticeBlockType.CUSTOM,
        title: 'Untitled block',
        plannedDurationMinutes: 10,
        fieldSpaces: [],
      });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  function patchBlock(id: string, patch: Partial<BlockRowData>) {
    setBlocks((arr) => arr.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  /**
   * Merge patch + current row and persist in a single call. Previously the
   * row component did onChange(patch) then onCommit(), but onCommit captured
   * a stale `blocks` reference and saved the pre-patch values. Merging the
   * patch against the latest-known row here fixes it.
   */
  function saveBlockWithPatch(id: string, patch: Partial<BlockRowData>) {
    const current = blocks.find((x) => x.id === id);
    if (!current) return;
    const merged = { ...current, ...patch };
    run(async () => {
      const res = await upsertBlockAction({
        id: merged.id,
        practiceId: practice.id,
        position: merged.position,
        blockType: merged.blockType,
        title: merged.title,
        plannedDurationMinutes: merged.plannedDurationMinutes,
        drillId: merged.drillId,
        // Explicitly thread the owner so content-only saves don't wipe the
        // assignment on the server. Owner reassignment goes through
        // setBlockAssignedCoachAction instead.
        assignedCoachId: merged.assignedCoachId,
        fieldSpaces: merged.fieldSpaces,
        notes: merged.notes || undefined,
      });
      if (res.error) setError(res.error);
    });
  }

  function assignCoach(id: string, coachUserId: string | null) {
    const current = blocks.find((x) => x.id === id);
    if (!current) return;
    patchBlock(id, { assignedCoachId: coachUserId });
    run(async () => {
      const res = await setBlockAssignedCoachAction({
        practiceId: practice.id,
        blockId: id,
        coachUserId,
      });
      if (res.error) {
        setError(res.error);
        patchBlock(id, { assignedCoachId: current.assignedCoachId });
      } else {
        router.refresh();
      }
    });
  }

  function removeBlock(id: string) {
    if (!confirm('Remove this block?')) return;
    run(async () => {
      const res = await deleteBlockAction({ practiceId: practice.id, blockId: id });
      if (res.error) setError(res.error);
      else {
        setBlocks((arr) => arr.filter((b) => b.id !== id));
        router.refresh();
      }
    });
  }

  const [weatherOpen, setWeatherOpen] = useState(false);

  function handleWeatherSwap(
    targetMode: PracticeWeatherMode,
    indoorTemplateId?: string,
  ) {
    run(async () => {
      const res = await applyWeatherSwapAction({
        practiceId: practice.id,
        targetMode,
        indoorTemplateId,
      });
      if (res.error) setError(res.error);
      else {
        setWeatherOpen(false);
        router.refresh();
      }
    });
  }

  function handleCompress() {
    const endInput = prompt(
      'Target end time (HH:MM, local):',
      new Date(Date.now() + 60 * 60_000).toTimeString().slice(0, 5),
    );
    if (!endInput) return;
    const [h, m] = endInput.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) {
      setError('Invalid time. Use HH:MM (24-hour).');
      return;
    }
    // Anchor the date to the practice day (started or scheduled) rather than
    // "now" — otherwise a coach running a practice at 9pm who targets 10pm
    // would land a date on tomorrow if they kept the modal open past midnight.
    const target = new Date(practice.startedAt ?? practice.scheduledAt);
    target.setHours(h, m, 0, 0);
    const activeIdx = blocks.findIndex(
      (b) =>
        (practice.blocks.find((x) => x.id === b.id)?.status ?? 'pending') === 'active',
    );
    const newBlocks = compressRemaining(blocks, activeIdx, target);
    const updates = newBlocks
      .filter((b, i) => b.plannedDurationMinutes !== blocks[i].plannedDurationMinutes)
      .map((b) => ({ id: b.id, plannedDurationMinutes: b.plannedDurationMinutes }));
    if (updates.length === 0) {
      setError('No changes needed.');
      return;
    }
    run(async () => {
      const res = await compressRemainingAction({ practiceId: practice.id, updates });
      if (res.error) setError(res.error);
      else {
        setBlocks(newBlocks);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6">
      <div className="space-y-4">
        <section className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium text-gray-700">Start from template</label>
          <select
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm disabled:opacity-60"
            disabled={pending || !canChangeStructure}
          >
            <option value="">— choose —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleInstantiate}
            disabled={!selectedTemplate || pending || !canChangeStructure}
            className="bg-brand-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-60"
          >
            Apply
          </button>
          <span className="ml-auto text-sm text-gray-500">
            Weather: {WEATHER_MODE_LABELS[practice.weatherMode]}
          </span>
          <button
            type="button"
            onClick={() => setWeatherOpen((v) => !v)}
            disabled={!canChangeStructure}
            className="bg-white border border-gray-300 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            Weather swap
          </button>
          <button
            type="button"
            onClick={handleCompress}
            disabled={blocks.length === 0 || pending || !canChangeStructure}
            className="bg-white border border-gray-300 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 disabled:opacity-60"
          >
            We&apos;re behind — compress
          </button>
        </section>

        {weatherOpen && (
          <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
            <h3 className="text-sm font-semibold text-gray-900">Swap weather mode</h3>
            <div className="flex items-center gap-2 flex-wrap">
              {(
                [
                  PracticeWeatherMode.OUTDOOR,
                  PracticeWeatherMode.INDOOR_GYM,
                  PracticeWeatherMode.CLASSROOM,
                ] as const
              ).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    if (
                      m === PracticeWeatherMode.INDOOR_GYM ||
                      m === PracticeWeatherMode.CLASSROOM
                    ) {
                      const indoorTemplates = templates.filter((t) => t.isIndoorFallback);
                      if (indoorTemplates.length === 0) {
                        setError(
                          'No indoor fallback template paired with this team — create one first.',
                        );
                        return;
                      }
                      const choice = prompt(
                        `Pick an indoor template (paste ID):\n${indoorTemplates
                          .map((t) => `${t.id} — ${t.name}`)
                          .join('\n')}`,
                      );
                      if (!choice) return;
                      handleWeatherSwap(m, choice);
                    } else {
                      handleWeatherSwap(m);
                    }
                  }}
                  className="bg-white border border-gray-300 text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  {WEATHER_MODE_LABELS[m]}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setWeatherOpen(false)}
                className="text-sm text-gray-500 ml-2"
              >
                Cancel
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              For indoor/classroom swaps, drills and field spaces are re-assigned from the
              paired template; durations stay fixed.
            </p>
          </section>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">
            Blocks · {blocks.length} · total {totalMinutes} min
          </h2>
          {canChangeStructure ? (
            <button
              type="button"
              onClick={addBlankBlock}
              disabled={pending}
              className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60"
            >
              + Add block
            </button>
          ) : (
            <span className="text-xs text-gray-500">
              You can edit blocks you own. Ask your head coach to reassign or add blocks.
            </span>
          )}
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {blocks.map((b) => {
                const canEdit =
                  canChangeStructure || b.assignedCoachId === currentUserId;
                return (
                  <SortableBlock
                    key={b.id}
                    block={b}
                    conflict={conflictBlockIds.has(b.id)}
                    slot={scheduleById.get(b.id)}
                    drills={drills}
                    drillsById={drillsById}
                    coaches={coaches}
                    coachesById={coachesById}
                    canChangeStructure={canChangeStructure}
                    canEdit={canEdit}
                    onChange={(patch) => patchBlock(b.id, patch)}
                    onChangeAndCommit={(patch) => {
                      patchBlock(b.id, patch);
                      saveBlockWithPatch(b.id, patch);
                    }}
                    onAssignCoach={(coachId) => assignCoach(b.id, coachId)}
                    onRemove={() => removeBlock(b.id)}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>

        {blocks.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
            No blocks yet. Pick a template or add a block to begin.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:underline"
            >
              dismiss
            </button>
          </div>
        )}
      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 self-start">
        <section className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Field-space conflicts</h3>
          {conflicts.length === 0 ? (
            <p className="text-xs text-gray-500">No conflicts detected.</p>
          ) : (
            <ul className="space-y-2">
              {conflicts.map((c) => (
                <li
                  key={c.fieldSpace}
                  className="text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2"
                >
                  <p className="font-semibold text-red-700 mb-1">
                    {FIELD_SPACE_LABELS[c.fieldSpace]}
                  </p>
                  {c.overlappingBlocks.map((b) => (
                    <p key={b.blockId} className="text-red-600">
                      • {b.title}
                    </p>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

interface RowProps {
  block: BlockRowData;
  slot?: { startsAt: string; endsAt: string };
  conflict: boolean;
  drills: PracticeDrill[];
  drillsById: Map<string, PracticeDrill>;
  coaches: TeamCoach[];
  coachesById: Map<string, TeamCoach>;
  /** Viewer can change structural fields (HC/AD). */
  canChangeStructure: boolean;
  /** Viewer can edit this specific block's content (HC/AD or block owner). */
  canEdit: boolean;
  /** Update local state only (for "user is still typing"). */
  onChange: (patch: Partial<BlockRowData>) => void;
  /** Update local state AND persist — merges the patch against the latest
   * parent state so no stale commit can occur. */
  onChangeAndCommit: (patch: Partial<BlockRowData>) => void;
  onAssignCoach: (coachUserId: string | null) => void;
  onRemove: () => void;
}

function SortableBlock({
  block,
  conflict,
  slot,
  drills,
  drillsById,
  coaches,
  coachesById,
  canChangeStructure,
  canEdit,
  onChange,
  onChangeAndCommit,
  onAssignCoach,
  onRemove,
}: RowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id, disabled: !canChangeStructure });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const drill = block.drillId ? drillsById.get(block.drillId) : undefined;
  const [pickerOpen, setPickerOpen] = useState(false);

  const startsAt = slot ? new Date(slot.startsAt) : null;
  const endsAt = slot ? new Date(slot.endsAt) : null;

  const owner = block.assignedCoachId ? coachesById.get(block.assignedCoachId) : undefined;
  const ownerLabel = owner?.displayName ?? (block.assignedCoachId ? 'Unknown coach' : null);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border p-4 transition-shadow ${
        isDragging ? 'shadow-lg' : ''
      } ${conflict ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'} ${
        !canEdit ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        {canChangeStructure ? (
          <button
            type="button"
            aria-label="Drag"
            className="text-gray-400 cursor-grab active:cursor-grabbing select-none pt-1"
            {...attributes}
            {...listeners}
          >
            ⋮⋮
          </button>
        ) : (
          <span className="text-gray-200 select-none pt-1" aria-hidden="true">
            ⋮⋮
          </span>
        )}

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
            {startsAt && endsAt && (
              <span>
                {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                {' – '}
                {endsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {conflict && (
              <span className="text-red-600 font-semibold">⚠ Field conflict</span>
            )}
            {!canEdit && (
              <span className="text-gray-400 italic">read-only</span>
            )}
            <span className="ml-auto flex items-center gap-1.5">
              <span className="text-gray-400">Owner:</span>
              {canChangeStructure ? (
                <select
                  value={block.assignedCoachId ?? ''}
                  onChange={(e) => onAssignCoach(e.target.value || null)}
                  className="border border-gray-300 rounded-md px-2 py-0.5 bg-white text-xs"
                >
                  <option value="">Unassigned</option>
                  {coaches.map((c) => (
                    <option key={c.userId} value={c.userId}>
                      {c.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="font-medium text-gray-700">
                  {ownerLabel ?? 'Unassigned'}
                </span>
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_110px] gap-2">
            <input
              value={block.title}
              onChange={(e) => onChange({ title: e.target.value })}
              onBlur={(e) => onChangeAndCommit({ title: e.target.value })}
              disabled={!canEdit}
              className="border border-gray-300 rounded-lg px-3 py-1.5 font-medium disabled:bg-gray-50 disabled:text-gray-500"
            />
            <select
              value={block.blockType}
              onChange={(e) =>
                onChangeAndCommit({ blockType: e.target.value as PracticeBlockType })
              }
              disabled={!canChangeStructure}
              className="border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm disabled:bg-gray-50 disabled:text-gray-500"
            >
              {Object.values(PracticeBlockType).map((t) => (
                <option key={t} value={t}>
                  {BLOCK_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={600}
                value={block.plannedDurationMinutes}
                onChange={(e) =>
                  onChange({ plannedDurationMinutes: Number(e.target.value) || 0 })
                }
                onBlur={(e) =>
                  onChangeAndCommit({
                    plannedDurationMinutes: Number(e.target.value) || 0,
                  })
                }
                disabled={!canChangeStructure}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right disabled:bg-gray-50 disabled:text-gray-500"
              />
              <span className="text-sm text-gray-500">min</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={!canChangeStructure}
              className="text-brand-700 hover:underline disabled:text-gray-400 disabled:no-underline disabled:cursor-not-allowed"
            >
              {drill ? `🎯 ${drill.name}` : '+ Pick drill'}
            </button>
            {drill && canChangeStructure && (
              <button
                type="button"
                onClick={() => onChangeAndCommit({ drillId: null })}
                className="text-gray-400 hover:text-red-500"
              >
                Remove drill
              </button>
            )}
          </div>

          <FieldSpacesChipInput
            value={block.fieldSpaces}
            onChange={(fs) => onChangeAndCommit({ fieldSpaces: fs })}
            disabled={!canEdit}
          />

          <textarea
            placeholder="Notes (optional)"
            value={block.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            onBlur={(e) => onChangeAndCommit({ notes: e.target.value })}
            disabled={!canEdit}
            rows={1}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-y disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {canChangeStructure && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove block"
            className="text-gray-400 hover:text-red-500 pt-1"
          >
            ✕
          </button>
        )}
      </div>

      {pickerOpen && (
        <DrillPicker
          drills={drills}
          onPick={(d) => {
            onChangeAndCommit({ drillId: d.id });
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </li>
  );
}

function FieldSpacesChipInput({
  value,
  onChange,
  disabled = false,
}: {
  value: PracticeFieldSpace[];
  onChange: (next: PracticeFieldSpace[]) => void;
  disabled?: boolean;
}): JSX.Element {
  function toggle(fs: PracticeFieldSpace) {
    if (value.includes(fs)) onChange(value.filter((x) => x !== fs));
    else onChange([...value, fs]);
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 mr-1">
        Field:
      </span>
      {Object.values(PracticeFieldSpace).map((fs) => {
        const on = value.includes(fs);
        return (
          <button
            key={fs}
            type="button"
            onClick={() => toggle(fs)}
            disabled={disabled}
            className={`text-xs px-2 py-0.5 rounded-full border disabled:cursor-not-allowed disabled:opacity-60 ${
              on
                ? 'bg-brand-50 border-brand-500 text-brand-700'
                : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400'
            }`}
          >
            {FIELD_SPACE_LABELS[fs]}
          </button>
        );
      })}
    </div>
  );
}
