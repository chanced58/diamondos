'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { uploadGalleryPhotoAction, deleteGalleryPhotoAction } from './actions';
import type { PlayerProfilePhoto } from '@baseball/shared';

interface Props {
  photos: PlayerProfilePhoto[];
  isPro: boolean;
  publicUrlForPath: (path: string) => string;
}

export function GalleryManager({ photos, isPro, publicUrlForPath }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isAdding, startAdd] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleAdd(formData: FormData) {
    setError(null);
    startAdd(() => {
      uploadGalleryPhotoAction(formData).then((result) => {
        if ('error' in result) {
          setError(result.error);
        } else {
          const form = document.getElementById('gallery-form') as HTMLFormElement | null;
          form?.reset();
        }
      });
    });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const result = await deleteGalleryPhotoAction(id);
    if ('error' in result) setError(result.error);
    setDeletingId(null);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-base font-semibold text-gray-900">Photo gallery</h2>
        {!isPro && (
          <span className="text-xs text-gray-500 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">
            Pro required
          </span>
        )}
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-gray-400 mb-4">No gallery photos yet.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 mb-5">
          {photos.map((p) => (
            <div key={p.id} className="group relative aspect-square bg-gray-100 rounded-lg overflow-hidden">
              <img
                src={publicUrlForPath(p.storagePath)}
                alt={p.caption ?? ''}
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => handleDelete(p.id)}
                disabled={deletingId === p.id}
                className="absolute top-1 right-1 bg-white/90 text-red-600 text-[10px] font-semibold px-2 py-1 rounded opacity-0 group-hover:opacity-100 disabled:opacity-50"
              >
                {deletingId === p.id ? '…' : 'Delete'}
              </button>
            </div>
          ))}
        </div>
      )}

      {isPro && (
        <form id="gallery-form" action={handleAdd} className="space-y-3 pt-4 border-t border-gray-100">
          <input
            name="photo"
            type="file"
            accept="image/*"
            required
            className="text-sm w-full"
          />
          <input
            name="caption"
            type="text"
            placeholder="Optional caption"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={isAdding}
            className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50"
          >
            {isAdding ? 'Uploading…' : 'Add photo'}
          </button>
        </form>
      )}
    </div>
  );
}
