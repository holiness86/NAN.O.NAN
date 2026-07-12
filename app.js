const mongoose = require('mongoose');
const express = require('express');
const multer = require('multer');
const path = require('path');
const session = require('express-session'); 
const app = express();

// وارد کردن مدل‌ها
const Iteam = require('./models/iteam');
const Pass = require('./models/pass');
const Category = require('./models/category')

// میدل ور ها
app.set('view engine' , 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({extended: true}));
app.use(express.json());

// سشن
app.use(session({
    secret: 'mamad_super_secret_key_123!@#', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        maxAge: 1000 * 60 * 60 * 24 
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

// مالتر و آپلود عکس
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage : storage });

// اتصال دیتا بیس
const urlDB = 'mongodb://localhost:27017/YosefDB';
mongoose.connect(urlDB)
.then(() => {
    console.log('Connected to MongoDB');
    app.listen(3000 , () => {
        console.log('Server is running on port 3000');
    });
})
.catch((err) => console.error('Could not connect to MongoDB', err));

// روت صفحه اصلی (نمایش منو)
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

app.post('/admin/category/update/:id', checkAdminLogin, async (req, res) => {
    try {
        const { nameFa, nameEn, icon } = req.body  // ← icon اضافه شد

        await Category.findByIdAndUpdate(
            req.params.id,
            {
                name: nameFa,
                enname: nameEn,
                icon: icon || 'bi-grid'  // ← icon ذخیره میشه
            }
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
        adminUser.password = password.trim()

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
    const newIteamData = {
        iteamName: req.body.iteamName,
        iteamPrice: req.body.iteamPrice,
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
app.post('/admin/category/add', checkAdminLogin, async (req, res) => {
    try {
        const { name, enname, icon } = req.body   // ← icon اضافه شد

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
            icon: icon || 'bi-grid'    // ← icon ذخیره میشه
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
        let updateData = { iteamName, iteamPrice, description, category };
        
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
app.post('/log', async (req, res) => {
    try {
        const user = await Pass.findOne({ username: req.body.username });
        if (!user || user.password !== req.body.password) {
            return res.send('نام کاربری یا رمز عبور اشتباه است!');
        }
        req.session.isLoggedIn = true;
        res.redirect('/admin');
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