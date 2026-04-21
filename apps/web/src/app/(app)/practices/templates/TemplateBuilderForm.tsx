'use client';

import { useMemo, useState, type JSX } from 'react';
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
  PracticeBlockType,
  PracticeDrill,
  PracticeFieldSpace,
  PracticeSeasonPhase,
  PracticeTemplate,
  PracticeTemplateKind,
  PracticeTemplateWithBlocks,
  QUICK_PRACTICE_BLOCK_TEMPLATE,
  SEASON_PHASE_LABELS,
  TEMPLATE_KIND_LABELS,
} from '@baseball/shared';
import {
  archiveTemplateAction,
  duplicateTemplateAction,
  saveTemplateAction,
} from './actions';
import { DrillPicker } from './DrillPicker';

interface BlockDraft {
  tempId: string;
  blockType: PracticeBlockType;
  title: string;
  durationMinutes: number;
  drillId: string | null;
  fieldSpaces: PracticeFieldSpace[];
  notes: string;
}

interface Props {
  mode: 'create' | 'edit';
  teamId: string;
  drills: PracticeDrill[];
  allTemplates: PracticeTemplate[];
  template?: PracticeTemplateWithBlocks;
}

function nextTempId(): string {
  return `b_${Math.random().toString(36).slice(2, 9)}`;
}

function makeDefaultBlocks(): BlockDraft[] {
  return QUICK_PRACTICE_BLOCK_TEMPLATE.map((b) => ({
    tempId: nextTempId(),
    blockType: b.blockType,
    title: b.title,
    durationMinutes: b.durationMinutes,
    drillId: null,
    fieldSpaces: [],
    notes: '',
  }));
}

export function TemplateBuilderForm({
  mode,
  teamId,
  drills,
  allTemplates,
  template,
}: Props): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [kind, setKind] = useState<PracticeTemplateKind>(
    template?.kind ?? PracticeTemplateKind.CUSTOM,
  );
  const [seasonPhase, setSeasonPhase] = useState<PracticeSeasonPhase>(
    template?.seasonPhase ?? PracticeSeasonPhase.ANY,
  );
  // Keep as string while the user types so we don't clobber "" → 90 on every
  // keystroke. Parsed on save (validation enforces 15..600).
  const [defaultDurationMinutes, setDefaultDurationMinutes] = useState<string>(
    String(template?.defaultDurationMinutes ?? 90),
  );
  const [isIndoorFallback, setIsIndoorFallback] = useState(template?.isIndoorFallback ?? false);
  const [pairedTemplateId, setPairedTemplateId] = useState<string | null>(
    template?.pairedTemplateId ?? null,
  );
  const [blocks, setBlocks] = useState<BlockDraft[]>(
    template
      ? template.blocks
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((b) => ({
            tempId: b.id,
            blockType: b.blockType,
            title: b.title,
            durationMinutes: b.durationMinutes,
            drillId: b.drillId ?? null,
            fieldSpaces: b.fieldSpaces,
            notes: b.notes ?? '',
          }))
      : makeDefaultBlocks(),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const drillsById = useMemo(() => {
    const m = new Map<string, PracticeDrill>();
    for (const d of drills) m.set(d.id, d);
    return m;
  }, [drills]);

  const pairableTemplates = allTemplates.filter((t) => t.id !== template?.id);

  const totalMinutes = blocks.reduce((s, b) => s + b.durationMinutes, 0);

  function addBlock() {
    setBlocks((arr) => [
      ...arr,
      {
        tempId: nextTempId(),
        blockType: PracticeBlockType.CUSTOM,
        title: 'Untitled block',
        durationMinutes: 10,
        drillId: null,
        fieldSpaces: [],
        notes: '',
      },
    ]);
  }

  function patchBlock(tempId: string, patch: Partial<BlockDraft>) {
    setBlocks((arr) => arr.map((b) => (b.tempId === tempId ? { ...b, ...patch } : b)));
  }

  function removeBlock(tempId: string) {
    setBlocks((arr) => arr.filter((b) => b.tempId !== tempId));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setBlocks((arr) => {
      const oldIdx = arr.findIndex((b) => b.tempId === active.id);
      const newIdx = arr.findIndex((b) => b.tempId === over.id);
      if (oldIdx < 0 || newIdx < 0) return arr;
      return arrayMove(arr, oldIdx, newIdx);
    });
  }

  async function handleSubmit() {
    setError(null);
    if (blocks.length === 0) {
      setError('Template must have at least one block.');
      return;
    }
    setSaving(true);
    try {
      const res = await saveTemplateAction({
        mode,
        teamId,
        id: template?.id,
        name,
        description: description || undefined,
        kind,
        seasonPhase,
        defaultDurationMinutes: Number(defaultDurationMinutes) || 90,
        isIndoorFallback,
        pairedTemplateId: pairedTemplateId ?? undefined,
        blocks: blocks.map((b, i) => ({
          position: i,
          blockType: b.blockType,
          title: b.title,
          durationMinutes: b.durationMinutes,
          drillId: b.drillId ?? undefined,
          fieldSpaces: b.fieldSpaces,
          notes: b.notes || undefined,
        })),
      });
      if (res.error) {
        setError(res.error);
      } else if (res.templateId) {
        router.push(`/practices/templates/${res.templateId}/edit`);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save template.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!template) return;
    const newName = prompt('Name for the duplicate?', `${template.name} (copy)`);
    if (!newName) return;
    setSaving(true);
    try {
      const res = await duplicateTemplateAction({
        sourceTemplateId: template.id,
        teamId,
        newName,
      });
      if (res.error) setError(res.error);
      else if (res.templateId) {
        router.push(`/practices/templates/${res.templateId}/edit`);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!template) return;
    if (!confirm('Archive this template? It will be hidden from the list.')) return;
    setSaving(true);
    try {
      const res = await archiveTemplateAction({ id: template.id, teamId });
      if (res.error) setError(res.error);
      else router.push('/practices/templates');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Kind</label>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as PracticeTemplateKind)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              {Object.values(PracticeTemplateKind).map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Season phase</label>
            <select
              value={seasonPhase}
              onChange={(e) => setSeasonPhase(e.target.value as PracticeSeasonPhase)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              {Object.values(PracticeSeasonPhase).map((s) => (
                <option key={s} value={s}>
                  {SEASON_PHASE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default duration (min)
            </label>
            <input
              type="number"
              min={15}
              max={600}
              value={defaultDurationMinutes}
              onChange={(e) => setDefaultDurationMinutes(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isIndoorFallback}
              onChange={(e) => setIsIndoorFallback(e.target.checked)}
              className="rounded"
            />
            Indoor / rainout fallback
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paired {isIndoorFallback ? 'outdoor' : 'indoor fallback'} template
            </label>
            <select
              value={pairedTemplateId ?? ''}
              onChange={(e) => setPairedTemplateId(e.target.value || null)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white"
            >
              <option value="">— none —</option>
              {pairableTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-gray-900">
            Blocks · {blocks.length} · total {totalMinutes} min
          </h2>
          <button
            type="button"
            onClick={addBlock}
            className="text-sm bg-white border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50"
          >
            + Add block
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={blocks.map((b) => b.tempId)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-2">
              {blocks.map((b) => (
                <SortableBlockRow
                  key={b.tempId}
                  block={b}
                  drillsById={drillsById}
                  drills={drills}
                  onPatch={(patch) => patchBlock(b.tempId, patch)}
                  onRemove={() => removeBlock(b.tempId)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </section>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="bg-brand-700 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-800 disabled:opacity-60"
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create template' : 'Save template'}
          </button>
          {mode === 'edit' && (
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={saving}
              className="bg-white border border-gray-300 font-semibold px-4 py-2.5 rounded-lg hover:bg-gray-50 text-sm"
            >
              Duplicate
            </button>
          )}
        </div>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleArchive}
            disabled={saving}
            className="text-sm text-red-600 hover:underline"
          >
            Archive
          </button>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  block: BlockDraft;
  drillsById: Map<string, PracticeDrill>;
  drills: PracticeDrill[];
  onPatch: (patch: Partial<BlockDraft>) => void;
  onRemove: () => void;
}

function SortableBlockRow({ block, drillsById, drills, onPatch, onRemove }: RowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.tempId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const drill = block.drillId ? drillsById.get(block.drillId) : undefined;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`bg-white rounded-xl border border-gray-200 p-4 ${
        isDragging ? 'shadow-lg opacity-80' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          aria-label="Drag to reorder"
          className="text-gray-400 cursor-grab active:cursor-grabbing pt-1 select-none"
          {...attributes}
          {...listeners}
        >
          ⋮⋮
        </button>
        <div className="flex-1 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_110px] gap-2">
            <input
              value={block.title}
              onChange={(e) => onPatch({ title: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-1.5 font-medium"
            />
            <select
              value={block.blockType}
              onChange={(e) =>
                onPatch({ blockType: e.target.value as PracticeBlockType })
              }
              className="border border-gray-300 rounded-lg px-3 py-1.5 bg-white text-sm"
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
                value={block.durationMinutes}
                onChange={(e) => onPatch({ durationMinutes: Number(e.target.value) || 0 })}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-right"
              />
              <span className="text-sm text-gray-500">min</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="text-brand-700 hover:underline"
            >
              {drill ? `🎯 ${drill.name}` : '+ Pick drill'}
            </button>
            {drill && (
              <button
                type="button"
                onClick={() => onPatch({ drillId: null })}
                className="text-gray-400 hover:text-red-500"
              >
                Remove drill
              </button>
            )}
          </div>

          <FieldSpacesChipInput
            value={block.fieldSpaces}
            onChange={(fs) => onPatch({ fieldSpaces: fs })}
          />

          <textarea
            placeholder="Notes (optional)"
            value={block.notes}
            onChange={(e) => onPatch({ notes: e.target.value })}
            rows={1}
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm resize-y"
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove block"
          className="text-gray-400 hover:text-red-500 pt-1"
        >
          ✕
        </button>
      </div>

      {pickerOpen && (
        <DrillPicker
          drills={drills}
          onPick={(d) => {
            onPatch({
              drillId: d.id,
              title: block.title === 'Untitled block' ? d.name : block.title,
              durationMinutes:
                block.durationMinutes || d.defaultDurationMinutes || 10,
              fieldSpaces:
                block.fieldSpaces.length === 0 ? d.fieldSpaces : block.fieldSpaces,
            });
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
}: {
  value: PracticeFieldSpace[];
  onChange: (next: PracticeFieldSpace[]) => void;
}): JSX.Element {
  function toggle(fs: PracticeFieldSpace) {
    if (value.includes(fs)) onChange(value.filter((x) => x !== fs));
    else onChange([...value, fs]);
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Field:
      </span>
      {Object.values(PracticeFieldSpace).map((fs) => {
        const on = value.includes(fs);
        return (
          <button
            key={fs}
            type="button"
            onClick={() => toggle(fs)}
            className={`text-xs px-2 py-0.5 rounded-full border ${
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
