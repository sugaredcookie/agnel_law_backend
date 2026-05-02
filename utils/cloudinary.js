import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
  private_cdn: false,
});

// Helper to determine resource type based on mimetype
const getResourceType = (mimetype) => {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  return "raw"; // for documents, audio, archives, etc.
};

// Helper to determine folder based on file type
const getFolder = (mimetype) => {
  if (mimetype.startsWith("image/")) return "images";
  if (mimetype.startsWith("video/")) return "videos";
  if (mimetype.startsWith("audio/")) return "audio";
  if (
    mimetype.includes("zip") ||
    mimetype.includes("rar") ||
    mimetype.includes("7z")
  )
    return "archives";
  return "documents";
};

export const uploadToCloudinary = async (file) => {
  try {
    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");
    const resourceType = getResourceType(file.mimetype);
    const folder = getFolder(file.mimetype);

    const filename = file.originalname;
    const fileExt = filename.split(".").pop().toLowerCase();
    const baseName =
      filename.substring(0, filename.lastIndexOf(".")) || filename;

    const uniqueSuffix = Date.now().toString().slice(-4);

    const sanitizedBaseName = baseName.replace(/[&\s+,/\\:]+/g, "-");
    const finalName = `${sanitizedBaseName}_${uniqueSuffix}`;

    const options = {
      folder: folder,
      resource_type: resourceType,
      public_id: finalName,
      use_filename: true,
      unique_filename: false,
      overwrite: true,
      type: "upload",
    };

    let result;
    if (file.buffer) {
      result = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          options,
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          },
        );
        uploadStream.end(file.buffer);
      });
    } else if (file.path) {
      result = await cloudinary.uploader.upload(file.path, options);
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    } else {
      throw new Error("No valid file data found");
    }

    const finalUrl = result.secure_url;

    return {
      url: finalUrl,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format || fileExt,
      type: isImage ? "image" : isVideo ? "video" : "document",
    };
  } catch (error) {
    console.error("Cloudinary upload error details:", error);
    throw new Error(`Error uploading to Cloudinary: ${error.message}`);
  }
};

export const deleteFromCloudinary = async (
  public_id,
  resourceType = "auto",
) => {
  try {
    const result = await cloudinary.uploader.destroy(public_id, {
      resource_type: resourceType,
      invalidate: true,
    });

    if (result.result !== "ok") {
      throw new Error(`Cloudinary deletion failed: ${result.result}`);
    }

    return result;
  } catch (error) {
    console.error(`Error deleting from Cloudinary:`, error);
    throw error;
  }
};
