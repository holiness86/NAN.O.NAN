/*
 * اسکریپت یک‌بارمصرف: تبدیل همه عکس‌های قبلی به WebP و آپدیت مسیرها توی دیتابیس
 *
 * اجرا (کنار server.js بذارش):
 *   node migrate-webp.js --dry-run      فقط گزارش میده، هیچ چیزی تغییر نمی‌کنه
 *   node migrate-webp.js                تبدیل می‌کنه + دیتابیس رو آپدیت می‌کنه (فایل‌های قدیمی می‌مونن)
 *   node migrate-webp.js --delete-old   بعد از اینکه مطمئن شدی همه چی درسته، فایل‌های قدیمی رو پاک می‌کنه
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const mongoose = require('mongoose');
require('dotenv').config();

const Iteam = require('./models/iteam');
const Category = require('./models/category');

const urlDB = process.env.MONGO_URL || 'mongodb://localhost:27017/NANONAN';
const UPLOAD_DIR = '/uploads';
const PUBLIC_DIR = path.join(__dirname, 'public');

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_OLD = process.argv.includes('--delete-old');

const CONVERTIBLE = ['.jpg', '.jpeg', '.png', '.gif', '.avif', '.tiff', '.tif'];

const stats = { converted: 0, skipped: 0, missing: 0, failed: 0, dbUpdated: 0, deleted: 0, savedBytes: 0 };

// مسیر URL توی دیتابیس -> مسیر واقعی فایل روی دیسک
function resolveDiskPath(url) {
    if (!url || typeof url !== 'string') return null;
    if (/^https?:\/\//i.test(url)) return null; // لینک خارجی
    const clean = url.split('?')[0];
    if (clean.startsWith('/uploads/')) {
        return path.join(UPLOAD_DIR, clean.replace('/uploads/', ''));
    }
    return path.join(PUBLIC_DIR, clean);
}

// یک فایل رو به webp تبدیل می‌کنه. خروجی: { newUrl, newDiskPath, oldDiskPath } یا null
async function convertFile(url) {
    const clean = url.split('?')[0];
    const ext = path.extname(clean).toLowerCase();

    if (!CONVERTIBLE.includes(ext)) {
        stats.skipped++; // webp قبلاً، svg، یا چیز دیگه
        return null;
    }

    const oldDiskPath = resolveDiskPath(url);
    if (!oldDiskPath || !fs.existsSync(oldDiskPath)) {
        console.warn('  ⚠ فایل پیدا نشد:', url);
        stats.missing++;
        return null;
    }

    const dir = path.dirname(oldDiskPath);
    const base = path.basename(oldDiskPath, path.extname(oldDiskPath));
    let newName = base + '.webp';
    // اگه دو فایل هم‌اسم با پسوند متفاوت بودن (a.jpg و a.png) تداخل نشه
    if (fs.existsSync(path.join(dir, newName))) {
        newName = base + '-' + ext.replace('.', '') + '.webp';
    }
    const newDiskPath = path.join(dir, newName);
    const newUrl = path.posix.join(path.posix.dirname(clean), newName);

    if (DRY_RUN) {
        console.log(`  [dry-run] ${clean} -> ${newUrl}`);
        stats.converted++;
        return { newUrl, newDiskPath, oldDiskPath };
    }

    try {
        await sharp(oldDiskPath, { animated: ext === '.gif' })
            .rotate()
            .resize({ width: 1600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toFile(newDiskPath);

        const before = fs.statSync(oldDiskPath).size;
        const after = fs.statSync(newDiskPath).size;
        stats.savedBytes += before - after;
        stats.converted++;
        console.log(`  ✓ ${clean} -> ${newUrl} (${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB)`);
        return { newUrl, newDiskPath, oldDiskPath };
    } catch (err) {
        console.error('  ✗ خطا در تبدیل', url, '-', err.message);
        stats.failed++;
        return null;
    }
}

function removeOld(oldDiskPath) {
    if (!DELETE_OLD || DRY_RUN) return;
    try {
        fs.unlinkSync(oldDiskPath);
        stats.deleted++;
    } catch (e) {
        console.warn('  ⚠ نتونستم فایل قدیمی رو پاک کنم:', oldDiskPath);
    }
}

async function migrateCollection(Model, field, label) {
    console.log(`\n=== ${label} ===`);
    const docs = await Model.find({ [field]: { $exists: true, $ne: '' } });
    console.log(`تعداد رکورد دارای عکس: ${docs.length}`);

    for (const doc of docs) {
        const url = doc[field];
        const result = await convertFile(url);
        if (!result) continue;

        if (!DRY_RUN) {
            await Model.updateOne({ _id: doc._id }, { $set: { [field]: result.newUrl } });
            stats.dbUpdated++;
            removeOld(result.oldDiskPath);
        }
    }
}

// فایل‌های یتیم توی /uploads که توی دیتابیس بهشون اشاره‌ای نیست
async function convertOrphans() {
    console.log('\n=== فایل‌های باقی‌مونده توی /uploads ===');
    if (!fs.existsSync(UPLOAD_DIR)) return;

    const files = fs.readdirSync(UPLOAD_DIR);
    for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!CONVERTIBLE.includes(ext)) continue;
        const result = await convertFile('/uploads/' + file);
        if (result) removeOld(result.oldDiskPath);
    }
}

async function main() {
    console.log(DRY_RUN ? '*** حالت DRY-RUN: هیچ تغییری اعمال نمیشه ***' : '*** شروع تبدیل واقعی ***');
    if (DELETE_OLD && !DRY_RUN) console.log('*** فایل‌های قدیمی بعد از تبدیل پاک میشن ***');

    await mongoose.connect(urlDB);
    console.log('Connected to MongoDB');

    await migrateCollection(Iteam, 'imageUrl', 'محصولات');
    await migrateCollection(Category, 'image', 'دسته‌بندی‌ها');
    // فایل‌های یتیم بعد از دیتابیس: چون فایل‌های دیتابیس قبلاً تبدیل شدن (اگه --delete-old نبود هنوز هستن)،
    // فقط وقتی اجرا میشه که دیتابیس واقعاً آپدیت شده باشه
    if (!DRY_RUN) await convertOrphans();

    console.log('\n=============== گزارش ===============');
    console.log('تبدیل شده:       ', stats.converted);
    console.log('رد شده (webp/svg):', stats.skipped);
    console.log('فایل پیدا نشد:   ', stats.missing);
    console.log('خطا:             ', stats.failed);
    console.log('آپدیت دیتابیس:   ', stats.dbUpdated);
    console.log('پاک‌شده قدیمی‌ها:  ', stats.deleted);
    console.log('صرفه‌جویی حجم:    ', (stats.savedBytes / 1024 / 1024).toFixed(2) + ' MB');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(async (err) => {
    console.error('خطای کلی:', err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
