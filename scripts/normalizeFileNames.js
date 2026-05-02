
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PHOTO_DIR = path.join(__dirname, '..', 'uploads', 'collected_photos');
const SIGN_DIR = path.join(__dirname, '..', 'uploads', 'collected_signs');

const renameFilesInDir = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        console.log(`Directory does not exist: ${dirPath}`);
        return;
    }

    const files = fs.readdirSync(dirPath);
    let renamedCount = 0;
    let collisions = [];

    files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        const baseName = path.basename(file, path.extname(file));
        
        // Strip non-digits
        const normalizedBaseName = baseName.replace(/\D/g, '');

        if (normalizedBaseName && baseName !== normalizedBaseName || path.extname(file) !== ext) {
            const oldPath = path.join(dirPath, file);
            const newFile = normalizedBaseName + ext;
            const newPath = path.join(dirPath, newFile);

            if (fs.existsSync(newPath) && oldPath !== newPath) {
                collisions.push(`Collision: ${file} -> ${newFile} (Already exists)`);
            } else {
                fs.renameSync(oldPath, newPath);
                renamedCount++;
            }
        }
    });

    return { total: files.length, renamed: renamedCount, collisions };
};

console.log('--- STARTING FILE SYSTEM NORMALIZATION ---');

const photoResults = renameFilesInDir(PHOTO_DIR);
console.log(`\nPhotos Directory: ${PHOTO_DIR}`);
console.log(`Total: ${photoResults.total}, Renamed/Standardized: ${photoResults.renamed}`);
if (photoResults.collisions.length > 0) {
    console.log(`Collisions detected in Photos: ${photoResults.collisions.length}`);
    photoResults.collisions.forEach(c => console.log(c));
}

const signResults = renameFilesInDir(SIGN_DIR);
console.log(`\nSigns Directory: ${SIGN_DIR}`);
console.log(`Total: ${signResults.total}, Renamed/Standardized: ${signResults.renamed}`);
if (signResults.collisions.length > 0) {
    console.log(`Collisions detected in Signs: ${signResults.collisions.length}`);
    signResults.collisions.forEach(c => console.log(c));
}

console.log('\nNormalization Complete.');
