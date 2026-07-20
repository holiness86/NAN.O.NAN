// این اسکریپت رو فقط یک‌بار، بعد از بالا آوردن سایت روی هاست جدید اجرا کن
// تا پسورد فعلی که به‌صورت متن ساده (plain text) در دیتابیس هست، به هش bcrypt تبدیل بشه.
// اجرا: node migrate-password.js
// بعد از اجرای موفق، این فایل رو از روی هاست حذف کن.

require('dotenv').config();
const mongoose = require('mongoose');
const Pass = require('../../models/pass');

const urlDB = process.env.MONGO_URL || 'mongodb://localhost:27017/NANONAN';

mongoose.connect(urlDB)
    .then(async () => {
        const adminUser = await Pass.findOne();
        if (!adminUser) {
            console.log('هیچ کاربر ادمینی پیدا نشد.');
            process.exit(0);
        }

        // اگه پسورد از قبل هش bcrypt باشه، pre-save hook مدل خودش رد میشه و کاری نمی‌کنه
        const alreadyHashed = /^\$2[aby]\$\d{2}\$/.test(adminUser.password);
        if (alreadyHashed) {
            console.log('پسورد از قبل هش شده است. نیازی به migration نیست.');
            process.exit(0);
        }

        // markModified لازمه چون مقدار رو به همون مقدار قبلی ست می‌کنیم و mongoose ممکنه تغییر رو تشخیص نده
        adminUser.markModified('password');
        await adminUser.save(); // pre-save hook مدل Pass اینجا پسورد رو هش می‌کنه

        console.log('پسورد با موفقیت هش و ذخیره شد.');
        process.exit(0);
    })
    .catch(err => {
        console.error('خطا:', err);
        process.exit(1);
    });
