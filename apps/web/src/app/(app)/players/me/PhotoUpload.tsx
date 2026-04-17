'use client';
import type { JSX } from 'react';
import { useState, useTransition } from 'react';
import { uploadProfilePhotoAction } from './actions';

interface Props {
  currentUrl: string | null | undefined;
  isPro: boolean;
  initials: string;
}

export function PhotoUpload({ currentUrl, isPro, initials }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(() => {
      uploadProfilePhotoAction(formData).then((result) => {
        if ('error' in result) setError(result.error);
      });
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <h2 className="text-base font-semibold text-gray-900 mb-4">Profile photo</h2>
      <div className="flex items-center gap-5">
        <div className="w-24 h-24 rounded-full overflow-hidden bg-brand-100 flex items-center justify-center text-brand-700 text-3xl font-bold shrink-0">
          {currentUrl ? (
            <img src={currentUrl} alt="Profile" className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        {isPro ? (
          <form action={handleSubmit} className="flex flex-col gap-2">
            <input
              type="file"
              name="photo"
              accept="image/*"
              required
              className="text-sm"
            />
            <button
              type="submit"
              disabled={isPending}
              className="w-fit bg-brand-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-brand-800 disabled:opacity-50"
            >
              {isPending ? 'Uploading…' : 'Upload'}
            </button>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </form>
        ) : (
          <p className="text-sm text-gray-500">
            Photo uploads are available with <span className="font-semibold">Player Pro</span>.
          </p>
        )}
      </div>
    </div>
  );
}
