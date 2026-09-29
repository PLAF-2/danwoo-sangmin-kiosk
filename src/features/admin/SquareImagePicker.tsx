import { useState } from 'react';
import { useKioskApi } from '../../app/providers';

import type { MediaSelection } from '../../services/kioskApi';

type ImageSelection = MediaSelection | { file: File; previewDataUrl: string; width: number; height: number };

export function SquareImagePicker({
  buttonLabel,
  onSaved,
}: {
  buttonLabel: string;
  onSaved(path: string): void;
}) {
  const api = useKioskApi();
  const [selection, setSelection] = useState<ImageSelection | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!api.media.upload) return;
    setError('');
    setUploading(true);
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        throw new Error('PNG, JPEG, WebP 이미지를 선택해 주세요.');
      }
      const image = await createImageBitmap(file);
      const { width, height } = image;
      image.close();
      if (width === height) {
        onSaved(await api.media.upload(file));
      } else {
        const previewDataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
          reader.readAsDataURL(file);
        });
        setSelection({ file, previewDataUrl, width, height });
        setOffset(Math.floor(Math.abs(width - height) / 2));
      }
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : '이미지를 저장하지 못했습니다.'); }
    finally { setUploading(false); }
  };

  const choose = async () => {
    setError('');
    try {
      const selected = await api.media.selectImage('square');
      if (!selected) return;
      setSelection(selected);
      setOffset(Math.floor(Math.abs(selected.width - selected.height) / 2));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 선택하지 못했습니다.');
    }
  };

  const save = async () => {
    if (!selection || uploading) return;
    const size = Math.min(selection.width, selection.height);
    const x = selection.width > selection.height ? offset : 0;
    const y = selection.height > selection.width ? offset : 0;
    setError('');
    setUploading(true);
    try {
      let path: string;
      if ('file' in selection) {
        if (!api.media.upload) throw new Error('이미지 업로드를 사용할 수 없습니다.');
        const image = await createImageBitmap(selection.file);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        try {
          const context = canvas.getContext('2d');
          if (!context) throw new Error('이미지를 자르지 못했습니다.');
          context.drawImage(image, x, y, size, size, 0, 0, size, size);
        } finally {
          image.close();
        }
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((result) => result ? resolve(result) : reject(new Error('이미지를 자르지 못했습니다.')), 'image/png');
        });
        path = await api.media.upload(new File([blob], 'cropped.png', { type: 'image/png' }));
      } else {
        path = await api.media.saveSquareCrop({ selectionId: selection.selectionId, x, y, width: size, height: size });
      }
      onSaved(path);
      setSelection(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 저장하지 못했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {api.media.upload ? <label>{buttonLabel}<input
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading || selection !== null}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = '';
        }}
      /></label> : <button type="button" onClick={() => void choose()}>{buttonLabel}</button>}
      {uploading && !selection && <p role="status">이미지 업로드 중…</p>}
      {error && !selection && <p role="alert">{error}</p>}
      {selection && (
        <div aria-label="1:1 이미지 자르기" aria-modal="true" className="admin-modal" role="dialog">
          <div className="admin-crop">
            <h2>1:1 이미지 자르기</h2>
            <div className="admin-crop-preview"><img alt="자르기 미리보기" src={selection.previewDataUrl} style={{
              objectPosition: selection.width === selection.height ? '50% 50%' : selection.width > selection.height
                ? `${offset / (selection.width - selection.height) * 100}% 50%`
                : `50% ${offset / (selection.height - selection.width) * 100}%`,
            }} /></div>
            {selection.width !== selection.height && (
              <label>자르기 위치<input
                aria-label="자르기 위치"
                disabled={uploading}
                max={Math.abs(selection.width - selection.height)}
                min="0"
                type="range"
                value={offset}
                onChange={(event) => setOffset(Number(event.target.value))}
              /></label>
            )}
            {uploading && <p role="status">이미지 업로드 중…</p>}
            {error && <p role="alert">{error}</p>}
            <div className="admin-actions">
              <button disabled={uploading} type="button" onClick={() => { setSelection(null); setError(''); }}>취소</button>
              <button disabled={uploading} type="button" onClick={() => void save()}>이 영역 사용</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
