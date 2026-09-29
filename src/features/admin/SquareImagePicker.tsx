import { useState } from 'react';
import { useKioskApi } from '../../app/providers';

import type { MediaSelection } from '../../services/kioskApi';

export function SquareImagePicker({
  buttonLabel,
  onSaved,
}: {
  buttonLabel: string;
  onSaved(path: string): void;
}) {
  const api = useKioskApi();
  const [selection, setSelection] = useState<MediaSelection | null>(null);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!api.media.upload) return;
    setError('');
    setUploading(true);
    try { onSaved(await api.media.upload(file)); }
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
    if (!selection) return;
    const size = Math.min(selection.width, selection.height);
    try {
      const path = await api.media.saveSquareCrop({
        selectionId: selection.selectionId,
        x: selection.width > selection.height ? offset : 0,
        y: selection.height > selection.width ? offset : 0,
        width: size,
        height: size,
      });
      onSaved(path);
      setSelection(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '이미지를 저장하지 못했습니다.');
    }
  };

  return (
    <>
      {api.media.upload ? <label>{buttonLabel}<input
        accept="image/png,image/jpeg,image/webp"
        disabled={uploading}
        type="file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = '';
        }}
      /></label> : <button type="button" onClick={() => void choose()}>{buttonLabel}</button>}
      {uploading && <p role="status">이미지 업로드 중…</p>}
      {error && <p role="alert">{error}</p>}
      {selection && (
        <div aria-label="1:1 이미지 자르기" aria-modal="true" className="admin-modal" role="dialog">
          <div className="admin-crop">
            <h2>1:1 이미지 자르기</h2>
            <div className="admin-crop-preview"><img alt="자르기 미리보기" src={selection.previewDataUrl} /></div>
            {selection.width !== selection.height && (
              <label>자르기 위치<input
                aria-label="자르기 위치"
                max={Math.abs(selection.width - selection.height)}
                min="0"
                type="range"
                value={offset}
                onChange={(event) => setOffset(Number(event.target.value))}
              /></label>
            )}
            <div className="admin-actions">
              <button type="button" onClick={() => setSelection(null)}>취소</button>
              <button type="button" onClick={() => void save()}>이 영역 사용</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
