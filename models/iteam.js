const mongoose = require('mongoose')

const itemSchema = new mongoose.Schema({
    iteamName: {
        type: String,
        required: true,
    },
    iteamPrice: {
        type: Number,
        required: true,
    },
    description: {
        type: String,
        trim: true,
    },
    imageUrl: {
        type: String,
    },
    category: {
        required: true,
        type: String,
    },
} , {timestamps : true})

const Iteam = mongoose.model('Iteam' , itemSchema)
module.exports = Iteam