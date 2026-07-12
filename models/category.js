const { default: mongoose } = require('mongoose')
const mobgoose = require('mongoose')

const categorySchema = new mongoose.Schema({
    name : {
        required : true,
        trim : true,
        type : String,
    },
    enname : {
        require : false,
        trim : true,
        type : String,
    },
    icon: {
        type: String,
        default: 'bi-grid'  // ← اضافه شد
    }
} , { timestamps : true })

const Category = mongoose.model('category' , categorySchema)
module.exports = Category