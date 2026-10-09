import { v2 as cloudinary } from "cloudinary";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const localStudentUploadsPath = fileURLToPath(new URL("../uploads/students/", import.meta.url));

const isInlineImage = (value) => typeof value === "string" && /^data:image\/(jpeg|png|webp);base64,/i.test(value);

export async function storeStudentPhoto(photoUrl, section, studentId, publicBaseUrl = process.env.PUBLIC_BASE_URL || "http://localhost:5000") {
    const normalized = typeof photoUrl === "string" ? photoUrl.trim() : "";
    if (!normalized) {
        return { photoUrl: "", photoCloudinaryUrl: "", photoLocalUrl: "" };
    }

    if (!isInlineImage(normalized) && !/^(https?:\/\/|\/)/i.test(normalized)) {
        return { photoUrl: "", photoCloudinaryUrl: "", photoLocalUrl: "" };
    }

    if (!isInlineImage(normalized)) {
        return {
            photoUrl: normalized,
            photoCloudinaryUrl: /^https?:\/\//i.test(normalized) ? normalized : "",
            photoLocalUrl: /^\//i.test(normalized) ? `${String(publicBaseUrl || process.env.PUBLIC_BASE_URL || "http://localhost:5000").replace(/\/+$/g, "")}${normalized}` : normalized,
        };
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const sectionFolder = "englophone";
    const configuredKeys = [cloudName, apiKey, apiSecret].filter(Boolean).length;
    let cloudinaryUrl = "";

    if (configuredKeys === 3) {
        cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
        const rootFolder = (process.env.CLOUDINARY_STUDENT_PHOTOS_FOLDER || "bchs/students").replace(/^\/+|\/+$/g, "");
        const upload = await cloudinary.uploader.upload(normalized, {
            folder: `${rootFolder}/${sectionFolder}`,
            public_id: `student-${studentId}-${Date.now()}`,
            overwrite: false,
            resource_type: "image",
            transformation: [
                { width: 1280, height: 1280, crop: "limit" },
                { quality: "auto", fetch_format: "auto" },
            ],
        });
        cloudinaryUrl = upload.secure_url;
    } else if (configuredKeys > 0) {
        throw new Error("Cloudinary configuration is incomplete. Set all three CLOUDINARY_* variables or clear them to use local photo storage.");
    }

    const match = normalized.match(/^data:image\/(jpeg|png|webp);base64,([\s\S]+)$/i);
    if (!match) throw new Error("Student photo must be a JPEG, PNG, or WebP image.");
    const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
    const image = Buffer.from(match[2], "base64");
    if (image.length > 6 * 1024 * 1024) throw new Error("Student photo exceeds the 6 MB storage limit.");

    const folderPath = fileURLToPath(new URL(`../uploads/students/${sectionFolder}/`, import.meta.url));
    await mkdir(folderPath, { recursive: true });
    const fileName = `student-${studentId}-${randomUUID()}.${extension}`;
    await writeFile(path.join(folderPath, fileName), image, { flag: "wx" });

    const baseUrl = String(publicBaseUrl || process.env.PUBLIC_BASE_URL || "http://localhost:5000").replace(/\/+$/g, "");
    const localUrl = `${baseUrl}/uploads/students/${sectionFolder}/${fileName}`;
    return {
        photoUrl: cloudinaryUrl || localUrl,
        photoCloudinaryUrl: cloudinaryUrl,
        photoLocalUrl: localUrl,
    };
}