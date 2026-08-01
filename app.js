const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session'); 
const rateLimit = require('express-rate-limit');
const os = require('os');
require('dotenv').config();
console.log('DEBUG مقدار NODE_ENV:', JSON.stringify(process.env.NODE_ENV));
const app = express();

if (!process.env.SESSION_SECRET) {
    console.error('خطا: SESSION_SECRET در فایل .env تنظیم نشده است. برنامه متوقف شد.');
    process.exit(1);
}

// وارد کردن مدل‌ها
const Iteam = require('./models/iteam');
const Pass = require('./models/pass');
const Category = require('./models/category')

// میدل ور ها
app.set('view engine' , 'ejs');
// اول: مسیر اختصاصی uploads از دیسک persistent (اولویت داره)
app.use('/uploads', express.static('/uploads'));

// بعد: بقیه فایل‌های استاتیک از public (css, js, images, picture)
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(express.json());
// جلوگیری از NoSQL Injection: کلیدهای خطرناک ($ و .) رو از داخل آبجکت پاک می‌کنیم
// (به‌جای reassign کردن req.query که در Express 5 فقط getter هست و ارور می‌ده)
function sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
        if (key.startsWith('$') || key.includes('.')) {
            delete obj[key];
        } else if (obj[key] && typeof obj[key] === 'object') {
            sanitizeObject(obj[key]);
        }
    }
}

app.use((req, res, next) => {
    sanitizeObject(req.body);
    sanitizeObject(req.params);
    sanitizeObject(req.query);
    next();
});

// سشن
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production' // روی هاست با HTTPS باید true باشه
    }
}));

// میدل‌ور برای محافظت از مسیرهای ادمین
const checkAdminLogin = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next(); 
    } else {
        res.redirect('/log'); 
    }
};

// محدود کردن تلاش‌های لاگین برای جلوگیری از حمله Brute-Force
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // ۱۵ دقیقه
    max: 10, // حداکثر ۱۰ تلاش در این بازه به ازای هر IP
    message: 'تعداد تلاش‌های ورود بیش از حد مجاز است. لطفاً چند دقیقه دیگر دوباره تلاش کنید.',
    standardHeaders: true,
    legacyHeaders: false
});

// مالتر و آپلود عکس
const ALLOWED_MIME_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, '/uploads/'); // مسیر مطلق دیسک persistent، نه پوشه public داخل کانتینر
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeExt = ALLOWED_MIME_TYPES[file.mimetype];
        cb(null, uniqueSuffix + safeExt);
    }
});

const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) {
        cb(null, true);
    } else {
        cb(new Error('فقط فایل تصویری با فرمت jpg, png یا webp مجاز است'));
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // حداکثر ۵ مگابایت
    }
});

// اتصال دیتا بیس
const urlDB = process.env.MONGO_URL || 'mongodb://localhost:27017/NANONAN';
const PORT = process.env.PORT || 3000;
mongoose.connect(urlDB)
.then(() => {
    console.log('Connected to MongoDB');
    app.listen(PORT , () => {
        console.log('Server is running on port 3000');
    });
})
.catch((err) => console.error('Could not connect to MongoDB', err));



// صفحه داشبورد
app.get('/admin/monitoring', (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.redirect('/admin/login');
  }
  res.render('monitoring'); // views/monitoring.ejs همون فایل قبلی
});

// اندپوینت داده‌ای که صفحه هر ۲ ثانیه صداش می‌زنه
app.get('/admin/monitoring/data', async (req, res) => {
  if (!req.session || !req.session.admin) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  const data = await getMonitoringData();
  res.json(data);
});



// روت صفحه اصلی (نمایش منو)
app.get('/', async (req, res) => {
    try {
        const categories = await Category.find().sort({ createdAt: 1 });
        
        // برای هر دسته‌بندی، آیتم‌هاشو بگیر
        const categoriesWithItems = await Promise.all(
            categories.map(async (cat) => {
                const items = await Iteam.find({ category: cat.name });
                return { ...cat.toObject(), items };
            })
        );

        res.render('index', { categoriesWithItems });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// روت نمایش صفحه ادمین
app.get('/admin', checkAdminLogin, async (req , res) => {
    try {
        const [iteam, categories] = await Promise.all([
            Iteam.find(),
            Category.find().sort({ createdAt: -1 })
        ])

        res.render('admin', { 
            iteam,
            categories
        })
    } catch (e) {
        console.log(e)
        res.status(500).send('Error')
    }
})

// حذف کتگوری
app.get('/admin/category/delete/:id', checkAdminLogin, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id)
        res.redirect('/admin')
    } catch (err) {
        console.error('خطا در حذف دسته‌بندی:', err)
        res.status(500).send('خطا در حذف دسته‌بندی')
    }
})

// روت ادیت
app.get('/admin/category/edit/:id', checkAdminLogin, async (req, res) => {
    try {
        const category = await Category.findById(req.params.id)
        if (!category) {
            return res.redirect('/admin')
        }
        res.render('edit-category', { category })
    } catch (err) {
        console.log(err)
        res.redirect('/admin')
    }
})

app.post('/admin/category/update/:id', checkAdminLogin, upload.single('image'), async (req, res) => {
    try {
        const { nameFa, nameEn, icon, imageUrl } = req.body

        const updateData = {
            name: nameFa,
            enname: nameEn,
            icon: icon || 'bi-grid'
        }

        // اگه فایل جدید آپلود شده، عکس رو عوض کن؛ وگرنه اگه imageUrl (وکتور از پیش‌انتخاب‌شده) اومده اونو بذار؛ وگرنه عکس قبلی دست‌نخورده می‌مونه
        if (req.file) {
            updateData.image = '/uploads/' + req.file.filename
        } else if (imageUrl) {
            updateData.image = imageUrl
        }

        await Category.findByIdAndUpdate(
            req.params.id,
            updateData
        )

        res.redirect('/admin')

    } catch (err) {
        console.log(err)
        res.status(500).send('خطا در ویرایش دسته‌بندی')
    }
})

// تعویض رمز
app.post('/admin/change-credentials', checkAdminLogin, async (req, res) => {
    try {

        const { username, password, confirmPassword } = req.body

        const [iteam, categories] = await Promise.all([
            Iteam.find(),
            Category.find().sort({ createdAt: -1 })
        ])

        if (!username || !password || !confirmPassword) {
            return res.render('admin', {
                iteam,
                categories,
                credMsg: {
                    type: 'error',
                    text: 'همه فیلدها الزامی هستند'
                }
            })
        }

        if (password !== confirmPassword) {
            return res.render('admin', {
                iteam,
                categories,
                credMsg: {
                    type: 'error',
                    text: 'رمزهای عبور با هم مطابقت ندارند'
                }
            })
        }

        const adminUser = await Pass.findOne()

        adminUser.username = username.trim()
        adminUser.password = password.trim() // هش شدن به‌صورت خودکار توسط pre-save hook مدل Pass انجام میشه

        await adminUser.save()

        res.render('admin', {
            iteam,
            categories,
            credMsg: {
                type: 'success',
                text: 'اطلاعات ورود با موفقیت تغییر کرد'
            }
        })

    } catch (err) {
        console.error(err)
        res.redirect('/admin')
    }
})


// روت دریافت اطلاعات و عکس از فرم ادمین
app.post('/admin', checkAdminLogin, upload.single('imageUrl'), (req, res) => {
    const price = Number(req.body.iteamPrice);
    if (!req.body.iteamName || isNaN(price) || price < 0) {
        return res.status(400).send('نام محصول یا قیمت نامعتبر است');
    }
    const newIteamData = {
        iteamName: req.body.iteamName,
        iteamPrice: price,
        description: req.body.description,
        category: req.body.category,
        imageUrl: req.file ? '/uploads/' + req.file.filename : ''
    };
    const iteam = new Iteam(newIteamData);
    iteam.save()
        .then(() => {
            console.log('Iteam saved');
            res.redirect('/admin');
        })
        .catch(err => res.status(500).send('خطا در ذخیره محصول'));
});

// افزودن کتگوری
app.post('/admin/category/add', checkAdminLogin, upload.single('image'), async (req, res) => {
    try {
        console.log('DEBUG req.body:', req.body)
        console.log('DEBUG req.file:', req.file)
        const { name, enname, icon, imageUrl } = req.body   // imageUrl = مسیر وکتور آماده‌ی انتخاب‌شده (اگه فایل آپلود نشده باشه)

        if (!name || !enname) {
            return res.status(400).send('name و enname الزامی هستند')
        }

        const existingCategory = await Category.findOne({ enname })
        if (existingCategory) {
            return res.status(400).send('این دسته‌بندی قبلاً ثبت شده')
        }

        const newCategory = new Category({
            name,
            enname,
            icon: icon || 'bi-grid',
            // اولویت با فایل آپلودی؛ اگه فایلی نبود از وکتور از پیش‌انتخاب‌شده استفاده کن
            image: req.file ? '/uploads/' + req.file.filename : (imageUrl || '')
        })

        await newCategory.save()

        const [iteam, categories] = await Promise.all([
            Iteam.find(),
            Category.find().sort({ createdAt: -1 })
        ])
        res.render('admin', { iteam, categories })

    } catch (error) {
        console.error(error)
        res.status(500).send('خطا در ذخیره دسته‌بندی')
    }
})

// روت صفحه لیست آپدیت
app.get('/update', checkAdminLogin, (req , res) => {
    Iteam.find()
        .then(iteams => res.render('update', { iteams }))
        .catch(err => console.error(err));
});

// روت حذف محصول
app.get('/admin/delete/:id', checkAdminLogin, (req,res) => {
    const id = req.params.id;
    Iteam.findByIdAndDelete(id)
        .then(() => res.redirect('/admin'))
        .catch(err => console.error(err));
});

// روت نمایش فرم ویرایش
app.get('/admin/edit/:id', checkAdminLogin, async (req, res) => {
    try {
        const [iteam, categories] = await Promise.all([
            Iteam.findById(req.params.id),
            Category.find()
        ]);

        if (!iteam) return res.redirect('/admin');

        res.render('update', { iteam, categories });

    } catch (err) {
        console.error(err);
        res.redirect('/admin');
    }
});


// روت ذخیره ویرایش
app.post('/admin/update/:id', checkAdminLogin, upload.single('imageUrl'), async (req, res) => {
    try {
        const { iteamName, iteamPrice, description, category } = req.body;
        const price = Number(iteamPrice);
        if (!iteamName || isNaN(price) || price < 0) {
            return res.status(400).send('نام محصول یا قیمت نامعتبر است');
        }
        let updateData = { iteamName, iteamPrice: price, description, category };
        
        if (req.file) updateData.imageUrl = '/uploads/' + req.file.filename;

        await Iteam.findByIdAndUpdate(req.params.id, updateData, { runValidators: true });
        res.redirect('/admin');
    } catch (err) {
        console.error('خطا در آپدیت محصول:', err);
        res.redirect('/admin');
    }
});

// نمایش فرم لاگین
app.get('/log' , (req , res) => {
    res.render('log');
});

// بررسی لاگین
app.post('/log', loginLimiter, async (req, res) => {
    try {
        const user = await Pass.findOne({ username: req.body.username });
        console.log('DEBUG کاربر پیدا شد؟', !!user);
        const isMatch = user && await user.comparePassword(req.body.password || '');
        console.log('DEBUG پسورد مطابقت داشت؟', isMatch);
        if (!isMatch) {
            return res.send('نام کاربری یا رمز عبور اشتباه است!');
        }
        req.session.isLoggedIn = true;
        console.log('DEBUG session id بعد از ست شدن:', req.sessionID, 'isLoggedIn:', req.session.isLoggedIn);
        req.session.save((err) => {
            if (err) console.log('DEBUG خطا در ذخیره سشن:', err);
            res.redirect('/admin');
        });
    } catch (err) {
        console.error('خطا در لاگین:', err);
        res.status(500).send('خطای سرور');
    }
});

// روت خروج (Logout)
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if(err) console.log(err);
        res.redirect('/log'); 
    });
});

// هندلر خطای آپلود (فایل نامعتبر یا حجم زیاد)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError || err.message.includes('فرمت')) {
        return res.status(400).send('خطا در آپلود فایل: ' + err.message);
    }
    next(err);
});