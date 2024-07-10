const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const userSchema = new Schema({
    facebookId: {
        type: String,
        required: true
    },
    name: {
        type: String,
    },
    provider: {
        type: String,
    },
    accessToken: {
        type: String,
    },
    managedPages: [{
        id: String,
        name: String
    }]
});

module.exports = mongoose.model('User', userSchema);
