// Redimensionne une image côté client avant envoi à l'API Claude (vision) :
// garde le payload petit et sous les limites de taille, sans dépendre de la
// résolution native de la caméra du téléphone.
export async function resizeImageToBase64(
  file: File,
  maxDimension = 1568,
  quality = 0.82,
): Promise<{ base64: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Impossible d'obtenir le contexte canvas");
  ctx.drawImage(bitmap, 0, 0, width, height);

  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const base64 = dataUrl.split(',')[1];
  return { base64, mediaType: 'image/jpeg' };
}
