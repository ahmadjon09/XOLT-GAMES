


function createImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Rasm yuklanmadi'));
    img.src = url;
  });
}



export async function getCroppedImg(imageSrc, pixelCrop, outputSize = null, fileName = 'cropped.png') {
  const image = await createImage(imageSrc);

  const w = outputSize?.width || Math.round(pixelCrop.width);
  const h = outputSize?.height || Math.round(pixelCrop.height);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    w, h
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Canvas bo'sh"));
      blob.name = fileName;
      resolve(blob);
    }, 'image/png');
  });
}


export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Fayl o'qilmadi"));
    reader.readAsDataURL(file);
  });
}


export function validateImageFile(file, maxMb = 5) {
  if (!file) return { ok: false, error: 'NO_FILE' };
  if (!file.type.startsWith('image/')) return { ok: false, error: 'INVALID_TYPE' };
  if (file.size > maxMb * 1024 * 1024) return { ok: false, error: 'TOO_LARGE', maxMb };
  return { ok: true };
}
