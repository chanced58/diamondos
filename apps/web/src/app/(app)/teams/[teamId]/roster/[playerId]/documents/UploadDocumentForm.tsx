'use client';
import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import type { JSX } from 'react';
import { uploadPlayerDocumentAction } from './actions';

type DocType = {
  slug: string;
  name: string;
  requires_expiration: boolean;
  visibility: 'system' | 'team';
};

export function UploadDocumentForm({
  teamId,
  playerId,
  docTypes,
}: {
  teamId: string;
  playerId: string;
  docTypes: DocType[];
}): JSX.Element {
  const [error, formAction] = useFormState(uploadPlayerDocumentAction, null);
  const [selectedType, setSelectedType] = useState<string>(docTypes[0]?.slug ?? '');
  const activeType = docTypes.find((t) => t.slug === selectedType);
  const requiresExp = activeType?.requires_expiration ?? false;

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-3">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="playerId" value={playerId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Document type</span>
          <select
            name="documentType"
            required
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            {docTypes.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
                {t.visibility === 'team' ? ' (team)' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">Title</span>
          <input
            name="title"
            type="text"
            required
            maxLength={120}
            placeholder="e.g. 2026 Spring Liability Waiver"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">Signed on</span>
          <input
            name="signedOn"
            type="date"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-700">
            Expires on {requiresExp && <span className="text-amber-600">*recommended</span>}
          </span>
          <input
            name="expiresOn"
            type="date"
            className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">Notes (optional)</span>
        <textarea
          name="notes"
          rows={2}
          maxLength={500}
          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium text-gray-700">File (PDF or image, max 20 MB)</span>
        <input
          name="file"
          type="file"
          required
          accept="application/pdf,image/*"
          className="mt-1 block w-full text-sm"
        />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <SubmitButton />
    </form>
  );
}

function SubmitButton(): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
    >
      {pending ? 'Uploading…' : 'Upload document'}
    </button>
  );
}
