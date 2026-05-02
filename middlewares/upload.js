import multer from "multer";
import path from "path";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// Expanded file types for educational content
const ALLOWED_EXTENSIONS =
  /pdf|doc|docx|txt|rtf|odt|ppt|pptx|odp|xls|xlsx|ods|csv|jpeg|jpg|png|gif|webp|svg|bmp|zip|rar|7z|mp4|mp3|wav|avi|mkv|mov/;

const ALLOWED_MIMETYPES = [
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  // Presentations
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.presentation",
  // Spreadsheets
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  // Audio/Video
  "video/mp4",
  "video/x-msvideo",
  "video/x-matroska",
  "video/quicktime",
  "audio/mpeg",
  "audio/wav",
];

const fileFilter = (req, file, cb) => {
  const extname = ALLOWED_EXTENSIONS.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = ALLOWED_MIMETYPES.includes(file.mimetype);

  if (extname || mimetype) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "File type not supported. Allowed: PDF, Word, PowerPoint, Excel, Images, Archives, and media files.",
      ),
    );
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

// Export allowed types for frontend reference
export const SUPPORTED_FILE_TYPES = {
  documents: ".pdf,.doc,.docx,.txt,.rtf,.odt",
  presentations: ".ppt,.pptx,.odp",
  spreadsheets: ".xls,.xlsx,.ods,.csv",
  images: ".jpeg,.jpg,.png,.gif,.webp,.svg,.bmp",
  archives: ".zip,.rar,.7z",
  media: ".mp4,.mp3,.wav,.avi,.mkv,.mov",
};

export const ALL_SUPPORTED_EXTENSIONS = Object.values(SUPPORTED_FILE_TYPES).join(",");
