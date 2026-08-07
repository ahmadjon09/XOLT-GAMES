

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';
import { ModalBox, Button } from './ui.jsx';
import { getCroppedImg } from '../utils/cropImage.js';

export default function ImageCropper({
  open,
  imageSrc,
  onCancel,
  onComplete, 
  aspect = 1,      
  outputSize = null, 
  circular = true,  
  label = 'crop.cropImage',
}) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleDone = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedImg(
        imageSrc,
        croppedAreaPixels,
        outputSize,
        `cropped-${Date.now()}.png`
      );
      onComplete(blob);
    } catch (e) {
      console.error('[cropper]', e);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <ModalBox open={open} onClose={onCancel} width={560}>
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
        {typeof label === 'string' && label.startsWith('crop.') ? t(label) : label}
      </div>

      {}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 320,
          background: '#10142a',
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          cropShape={circular ? 'round' : 'rect'}
          showGrid
          minZoom={1}
          maxZoom={4}
        />
      </div>

      {}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
          <span>{t('crop.zoom')}</span>
          <span>{zoom.toFixed(1)}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--primary)' }}
        />
      </div>

      {}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Button variant="outline" className="full" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button className="full" loading={busy} onClick={handleDone}>
          {t('common.continue')}
        </Button>
      </div>
    </ModalBox>
  );
}
