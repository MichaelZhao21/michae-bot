const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        id: String,
        rolls: [
            {
                id: Number,
                origin: String,
                gender: String,
                name: String,
            },
        ],
        dating: [
            {
                id: Number,
                origin: String,
                gender: String,
                name: String,
            },
        ],
    },
    { collection: 'michae-users' }
);

const User = mongoose.model('User', userSchema);
module.exports = User;
