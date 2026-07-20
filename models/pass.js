const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const passSchema = new mongoose.Schema({
    username : {
        type : String,
        trim : true,
        required : true,
    },
    password : {
        type : String,
        trim : true,
        required : true,
    },
} , {timestamps : true})

// قبل از هر ذخیره، اگه پسورد تغییر کرده باشه، خودکار هش میشه
passSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next()
    }

    // اگه از قبل هش bcrypt باشه (مثلاً هنگام migration)، دوباره هش نکن
    const alreadyHashed = /^\$2[aby]\$\d{2}\$/.test(this.password)
    if (alreadyHashed) {
        return next()
    }

    this.password = await bcrypt.hash(this.password, 10)
    next()
})

// متد کمکی برای مقایسه پسورد وارد شده با هش ذخیره‌شده
passSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password)
}

const Pass = mongoose.model('Pass' , passSchema)
module.exports = Pass