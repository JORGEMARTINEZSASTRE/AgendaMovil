'use strict';

const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function subirImagen(filePath, folder = 'agendamovil') {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'auto',
  });
  return result.secure_url;
}

async function eliminarImagen(url) {
  if (!url) return;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  const publicId = filename.split('.')[0];
  const folder = parts[parts.length - 2];
  try {
    await cloudinary.uploader.destroy(`${folder}/${publicId}`);
  } catch (err) {
    console.error('[CLOUDINARY] Error eliminando:', err.message);
  }
}

module.exports = { cloudinary, subirImagen, eliminarImagen };
