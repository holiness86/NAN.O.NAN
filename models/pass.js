const mongoose = require('mongoose')

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

const Pass = mongoose.model('Pass' , passSchema)
module.exports = Pass