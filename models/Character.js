const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema(
    {
        id: Number,
        url: String,
        img: String,
        name: String,
        media: String,
        mediaName: String,
    },
    { collection: 'anime-db' }
);

const Character = mongoose.model('Character', characterSchema);
module.exports = Character;
