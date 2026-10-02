/**
 * Puerto de almacenamiento de imágenes. Desacopla el dominio del proveedor
 * concreto (hoy Cloudinary), igual que el puerto de correo.
 */
export interface UploadedImage {
  /** URL pública y estable (incluye versión: cambia al reemplazar la imagen). */
  url: string;
  /** Identificador completo en el proveedor, para reemplazar/borrar luego. */
  publicId: string;
}

export interface ImageStorage {
  /**
   * Sube (o reemplaza) el avatar. `publicId` es el nombre lógico (id del
   * usuario): el adaptador decide el prefijo/carpeta y devuelve el id final.
   */
  uploadAvatar(buffer: Buffer, opts: { publicId: string }): Promise<UploadedImage>;
  /** Borra la imagen por su id completo. */
  delete(publicId: string): Promise<void>;
}
