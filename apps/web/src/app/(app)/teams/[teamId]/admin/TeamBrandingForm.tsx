'use client';
import type { JSX } from 'react';

import { useRef, useState } from 'react';
import { uploadTeamBrandingAction } from './branding-actions';

interface TeamBrandingFormProps {
  teamId: string;
  currentLogoUrl: string | null;
  currentPrimaryColor: string | null;
  currentSecondaryColor: string | null;
}

function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function TeamBrandingForm({
  teamId,
  currentLogoUrl,
  currentPrimaryColor,
  currentSecondaryColor,
}: TeamBrandingFormProps): JSX.Element | null {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentLogoUrl);
  const [primaryColor, setPrimaryColor] = useState<string>(currentPrimaryColor ?? '#1e2d6b');
  const [secondaryColor, setSecondaryColor] = useState<string>(currentSecondaryColor ?? '#1e3a8a');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setSuccess(false);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setPreviewUrl(dataUrl);

      // Extract colors once the preview image loads
      const img = new Image();
      img.onload = async () => {
        try {
          // Dynamic import to avoid SSR issues; handle both CJS default and named exports
          const ct = await import('colorthief');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const ColorThiefClass: any = (ct as any).default ?? ct;
          const thief = new ColorThiefClass();
          const palette: number[][] = thief.getPalette(img, 2);
          if (palette?.[0]) setPrimaryColor(rgbToHex(palette[0]));
          if (palette?.[1]) setSecondaryColor(rgbToHex(palette[1]));
        } catch {
          // Color extraction is best-effort; proceed without it
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(selected);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;

    const formData = new FormData();
    formData.append('teamId', teamId);
    formData.append('logo', file);
    formData.append('primaryColor', primaryColor);
    formData.append('secondaryColor', secondaryColor);

    setIsPending(true);
    setError(null);
    const result = await uploadTeamBrandingAction(formData);
    setIsPending(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setFile(null);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Logo preview + file input */}
        <div className="flex items-start gap-6">
          <div className="shrink-0">
            {previewUrl ? (
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Team logo"
                crossOrigin="anonymous"
                className="w-24 h-24 rounded-lg object-contain border border-gray-200 bg-gray-50 p-1"
              />
            ) : (
              <div className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs text-center">
                No logo
              </div>
            )}
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Team Logo</label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
            />
            <p className="text-xs text-gray-400 mt-1">PNG, JPG, SVG or WebP. Colors are extracted automatically.</p>
          </div>
        </div>

        {/* Color swatches */}
        <div className="flex items-center gap-6">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Primary (sidebar background)</label>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-md border border-gray-200 shrink-0"
                style={{ backgroundColor: primaryColor }}
              />
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-200"
                title="Primary color"
              />
              <span className="text-xs font-mono text-gray-500">{primaryColor}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Secondary (active nav / accents)</label>
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-md border border-gray-200 shrink-0"
                style={{ backgroundColor: secondaryColor }}
              />
              <input
                type="color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="w-10 h-8 rounded cursor-pointer border border-gray-200"
                title="Secondary color"
              />
              <span className="text-xs font-mono text-gray-500">{secondaryColor}</span>
            </div>
          </div>
        </div>

        {/* Sidebar preview */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-1.5">Sidebar preview</p>
          <div
            className="w-40 rounded-lg p-3 text-white text-xs space-y-1"
            style={{ backgroundColor: primaryColor }}
          >
            {['Dashboard', 'Schedule', 'Team Management', 'Messages'].map((label, i) => (
              <div
                key={label}
                className="px-2 py-1 rounded"
                style={i === 2 ? { backgroundColor: secondaryColor } : { opacity: 0.7 }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Branding saved! Reload to see the updated sidebar.</p>}

        <button
          type="submit"
          disabled={!file || isPending}
          className="bg-brand-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-brand-800 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Saving…' : 'Save Branding'}
        </button>
      </form>
    </div>
  );
}
